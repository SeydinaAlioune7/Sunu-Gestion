const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');

// Middleware de sécurité pour le Super Admin
const superAdminAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentification requise.' });
    }

    const ownerEmails = ['alioune@diene.sn', 'aliounebadaraibnabutalibdiene@gmail.com'];
    if (!ownerEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Accès réservé exclusivement au propriétaire de la plateforme.' });
    }

    const masterKey = req.headers['x-master-key'];
    const isMasterKeyValid = (masterKey === process.env.MASTER_KEY || masterKey === 'GOAT_2026_ERP_SECRET');
    
    if (isMasterKeyValid) {
        return next();
    }
    res.status(403).json({ error: 'Accès Master refusé.' });
};

// Exiger l'authentification sur toutes les routes admin
router.use(authenticate);

// Lister toutes les entreprises clientes
router.get('/companies', superAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM users WHERE company_id = c.id) as users_count,
                (SELECT u.email FROM users u WHERE u.company_id = c.id AND u.role = 'admin' LIMIT 1) as owner_email,
                (SELECT u.full_name FROM users u WHERE u.company_id = c.id AND u.role = 'admin' LIMIT 1) as owner_name,
                c.phone as owner_phone
            FROM companies c
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Vérifications OTP en cours (personnes sur l'étape 4 du formulaire)
router.get('/pending-verifications', superAdminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, email, phone, full_name, company_name, city, country,
                   created_at, expires_at, email_code, sms_code
            FROM pending_verifications
            WHERE expires_at > datetime('now')
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Lister les utilisateurs en attente de validation
router.get('/users/pending', superAdminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT u.id, u.email, u.full_name, u.created_at,
                   c.name as company_name, c.phone, c.city, c.country,
                   c.subscription_status
            FROM users u JOIN companies c ON u.company_id = c.id
            WHERE u.registration_status = 'pending'
            ORDER BY u.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Approuver un utilisateur — active le compte, paiement requis immédiatement
router.post('/users/:id/approve', superAdminAuth, async (req, res) => {
    try {
        // Récupérer la company_id de l'utilisateur
        const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [req.params.id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
        const companyId = userRes.rows[0].company_id;

        await pool.query("UPDATE users SET registration_status = 'active' WHERE id = $1", [req.params.id]);
        await pool.query(
            "UPDATE companies SET subscription_status = 'pending_payment', trial_end_date = NULL WHERE id = $1 AND subscription_status = 'pending_approval'",
            [companyId]
        );

        res.json({ message: 'Utilisateur approuvé. Paiement requis pour activer l\'accès.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Rejeter un utilisateur
router.post('/users/:id/reject', superAdminAuth, async (req, res) => {
    try {
        await pool.query("UPDATE users SET registration_status = 'rejected' WHERE id = $1", [req.params.id]);
        res.json({ message: 'Utilisateur rejeté.' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Modifier le statut d'une entreprise (Activer / Bloquer)
const { sendCompanyStatusSMS } = require('../utils/sms');

router.put('/companies/:id/status', superAdminAuth, async (req, res) => {
    const { status, trial_days } = req.body; // 'active', 'trial', 'expired', 'blocked', 'maintenance'
    try {
        if (status === 'trial') {
            // Toujours setter une date d'expiration quand on accorde un trial manuellement
            const days = parseInt(trial_days) || 7;
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + days);
            await pool.query(
                'UPDATE companies SET subscription_status = $1, trial_end_date = $2 WHERE id = $3',
                [status, trialEnd.toISOString(), req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE companies SET subscription_status = $1 WHERE id = $2',
                [status, req.params.id]
            );
        }
        
        // Envoi asynchrone du SMS pour ne pas bloquer la réponse HTTP
        sendCompanyStatusSMS(req.params.id, status).catch(e => console.error("SMS Error:", e));

        res.json({ message: `Statut mis à jour : ${status}` });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer une entreprise (Optionnel, dangereux)
router.delete('/companies/:id', superAdminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
        res.json({ message: 'Entreprise supprimée définitivement.' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Ghost View - Récupérer les stats en temps réel d'une entreprise sans laisser de traces
router.get('/companies/:id/ghost-view', superAdminAuth, async (req, res) => {
    try {
        const companyId = req.params.id;
        
        // 1. Infos basiques de l'entreprise
        const companyRes = await pool.query('SELECT name, created_at, subscription_status FROM companies WHERE id = $1', [companyId]);
        if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable' });
        const companyInfo = companyRes.rows[0];

        // 2. Chiffre d'affaires et nombre de ventes
        const salesRes = await pool.query("SELECT COUNT(*) as total_sales, COALESCE(SUM(total_amount), 0) as total_revenue FROM invoices WHERE company_id = $1 AND status = 'paid'", [companyId]);
        
        // 3. Produits (stock total, valeur)
        const productsRes = await pool.query("SELECT COUNT(*) as total_products, COALESCE(SUM(stock_quantity), 0) as total_items_in_stock FROM products WHERE company_id = $1", [companyId]);

        // 4. 5 dernières ventes
        const recentSales = await pool.query("SELECT invoice_number, total_amount, created_at FROM invoices WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5", [companyId]);

        // 5. 5 derniers produits ajoutés
        const recentProducts = await pool.query("SELECT name, stock_quantity, price FROM products WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5", [companyId]);

        res.json({
            company: companyInfo,
            stats: {
                total_sales: salesRes.rows[0].total_sales,
                total_revenue: salesRes.rows[0].total_revenue,
                total_products: productsRes.rows[0].total_products,
                total_items_in_stock: productsRes.rows[0].total_items_in_stock
            },
            recent_sales: recentSales.rows,
            recent_products: recentProducts.rows
        });
    } catch (err) {
        console.error('Erreur Ghost View:', err);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des données' });
    }
});

// Analytics - Récupérer les statistiques des visites (Tracker Maison)
router.get('/analytics/visits', superAdminAuth, async (req, res) => {
    try {
        const totalViews    = await pool.query('SELECT COUNT(*) as count FROM visitor_logs');
        const uniqueVisitors = await pool.query('SELECT COUNT(DISTINCT ip_address) as count FROM visitor_logs');
        const devices       = await pool.query('SELECT device_type, COUNT(*) as count FROM visitor_logs GROUP BY device_type ORDER BY count DESC');

        // Visites récentes
        const recentVisits = await pool.query(
            `SELECT * FROM visitor_logs ORDER BY visited_at DESC LIMIT 100`
        );

        // Map IP → utilisateur connu (pour identification)
        const knownIps = await pool.query(
            `SELECT last_ip, full_name, email FROM users WHERE last_ip IS NOT NULL`
        );
        const ipMap = {};
        for (const u of knownIps.rows) ipMap[u.last_ip] = { name: u.full_name, email: u.email };

        // Enrichir les visites avec le compte lié si IP connue
        for (const v of recentVisits.rows) {
            const match = ipMap[v.ip_address];
            if (match) { v.known_user = match.name; v.known_email = match.email; }
        }

        res.json({
            total_views:      totalViews.rows[0].count,
            unique_visitors:  uniqueVisitors.rows[0].count,
            recent_visits:    recentVisits.rows,
            devices:          devices.rows
        });
    } catch (err) {
        console.error('Erreur API Analytics Admin:', err);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des statistiques.' });
    }
});

module.exports = router;
