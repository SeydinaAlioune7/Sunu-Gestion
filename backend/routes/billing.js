const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// ── GET /api/billing/status ─────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT subscription_status, trial_end_date, created_at FROM companies WHERE id = $1',
            [req.user.company_id]
        );
        const company = result.rows[0];

        // Calculer les jours restants si en période d'essai
        let daysLeft = 0;
        if (company.subscription_status === 'trial') {
            const end = new Date(company.trial_end_date);
            const now = new Date();
            daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        }

        res.json({
            status: company.subscription_status,
            trial_end_date: company.trial_end_date,
            days_left: daysLeft > 0 ? daysLeft : 0,
            plans: [
                { id: 'monthly', name: 'Pack Standard', price: 5000, duration: 'mois' },
                { id: 'yearly', name: 'Pack Premium', price: 50000, duration: 'an' }
            ],
            payment_methods: [
                { type: 'wave', label: 'Wave', account: '+221 77 856 16 30', owner: 'Alioune Badara Diene' }
            ],
            note: "Effectuez le transfert sur l'un de ces numéros pour activer votre compte."
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── POST /api/billing/simulate-payment ──────────────────────────────────────
router.post('/simulate-payment', authenticate, async (req, res) => {
    const { planId, method } = req.body; // method: 'wave', 'om', 'card'
    
    try {
        // Simulation d'une attente réseau pour le paiement
        // Dans la réalité, on appellerait une API comme PayTech ici
        
        const duration = planId === 'yearly' ? 365 : 30;
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + duration);

        await pool.query(
            "UPDATE companies SET subscription_status = 'active', trial_end_date = $1 WHERE id = $2",
            [newExpiry.toISOString(), req.user.company_id]
        );

        // Log d'activité
        await pool.query(
            'INSERT INTO activity_logs (company_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [req.user.company_id, req.user.id, 'PAYMENT', `Paiement simulé via ${method.toUpperCase()} pour le plan ${planId}`]
        );

        res.json({ message: 'Paiement réussi ! Votre abonnement est maintenant actif.', status: 'active' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors du paiement.' });
    }
});


// ── GET /api/billing/company-settings ──────────────────────────────────────
router.get('/company-settings', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT name, email, phone, website, country, city, payment_info, wave_number, om_number, bank_iban, cinetpay_api_key, cinetpay_site_id, paytech_api_key, paytech_api_secret FROM companies WHERE id = $1', [req.user.company_id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/billing/company-settings ──────────────────────────────────────
router.put('/company-settings', authenticate, async (req, res) => {
    const { name, email, phone, website, country, city, payment_info, wave_number, om_number, bank_iban, cinetpay_api_key, cinetpay_site_id, paytech_api_key, paytech_api_secret } = req.body;
    try {
        await pool.query(
            'UPDATE companies SET name=$1, email=$2, phone=$3, website=$4, country=$5, city=$6, payment_info=$7, wave_number=$8, om_number=$9, bank_iban=$10, cinetpay_api_key=$11, cinetpay_site_id=$12, paytech_api_key=$13, paytech_api_secret=$14 WHERE id=$15',
            [name, email, phone, website, country, city, payment_info, wave_number, om_number, bank_iban, cinetpay_api_key, cinetpay_site_id, paytech_api_key, paytech_api_secret, req.user.company_id]
        );
        res.json({ message: 'Paramètres mis à jour.' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/billing/paytech ─────────────────────────────────────────────────
router.post('/paytech', authenticate, async (req, res) => {
    const { planId } = req.body;
    
    try {
        // 1. Récupérer les clés PayTech du propriétaire de la plateforme (Company ID 1)
        const platformRes = await pool.query('SELECT paytech_api_key, paytech_api_secret FROM companies WHERE id = 1');
        const platformKeys = platformRes.rows[0];

        if (!platformKeys || !platformKeys.paytech_api_key || !platformKeys.paytech_api_secret) {
            return res.status(400).json({ error: 'La plateforme n\'a pas encore configuré sa passerelle de paiement.' });
        }

        const price = planId === 'yearly' ? 50000 : 5000;
        const refCommand = `SUB_${req.user.company_id}_${planId}_${Date.now()}`;

        const host = req.headers.host || 'www.sunugestion.sn';
        const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;

        const { initPaytechPayment } = require('../utils/paytech');

        const paytechResult = await initPaytechPayment({
            apiKey: platformKeys.paytech_api_key,
            apiSecret: platformKeys.paytech_api_secret,
            refCommand: refCommand,
            amount: price,
            itemName: `Abonnement SunuGestion - ${planId === 'yearly' ? 'Annuel' : 'Mensuel'}`,
            successUrl: `${baseUrl}/settings.html?tab=billing&success=1`,
            cancelUrl: `${baseUrl}/settings.html?tab=billing&cancel=1`,
            ipnUrl: `${baseUrl}/api/billing/paytech-ipn`,
            env: platformKeys.paytech_api_key.includes('test') ? 'test' : 'prod'
        });

        if (paytechResult.success) {
            res.json({ redirect_url: paytechResult.redirectUrl });
        } else {
            console.error('PayTech Billing Init Error:', paytechResult.error);
            res.status(400).json({ error: paytechResult.error || 'Erreur d\'initialisation PayTech' });
        }
    } catch (err) {
        console.error('Erreur /api/billing/paytech:', err);
        res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement.' });
    }
});

// ── POST /api/billing/paytech-ipn (Webhook) ──────────────────────────────────
router.post('/paytech-ipn', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const { verifyPaytechIpnSignature } = require('../utils/paytech');
        
        // 1. Récupérer les clés de la plateforme
        const platformRes = await pool.query('SELECT paytech_api_key, paytech_api_secret FROM companies WHERE id = 1');
        const platformKeys = platformRes.rows[0];

        if (!platformKeys) return res.status(400).send('Platform keys missing');

        // 2. Vérifier la signature
        const isValid = verifyPaytechIpnSignature({
            apiKey: platformKeys.paytech_api_key,
            apiSecret: platformKeys.paytech_api_secret,
            body: req.body
        });

        if (!isValid) {
            console.error('Signature IPN invalide pour abonnement.');
            return res.status(400).send('Invalid signature');
        }

        // 3. Traiter le paiement s'il est réussi
        const { type_event, ref_command } = req.body;
        
        if (type_event === 'sale_complete') {
            const parts = ref_command.split('_');
            if (parts[0] !== 'SUB') return res.status(400).send('Invalid ref_command');

            const companyId = parts[1];
            const planId = parts[2];
            const duration = planId === 'yearly' ? 365 : 30;
            
            // Calculer la nouvelle date d'expiration
            const currentRes = await pool.query('SELECT trial_end_date FROM companies WHERE id = $1', [companyId]);
            let currentExpiry = currentRes.rows[0]?.trial_end_date ? new Date(currentRes.rows[0].trial_end_date) : new Date();
            if (currentExpiry < new Date()) currentExpiry = new Date(); // Si expiré, repartir d'aujourd'hui
            
            currentExpiry.setDate(currentExpiry.getDate() + duration);

            // Mettre à jour l'abonnement
            await pool.query(
                "UPDATE companies SET subscription_status = 'active', trial_end_date = $1 WHERE id = $2",
                [currentExpiry.toISOString(), companyId]
            );

            // Log d'activité
            await pool.query(
                'INSERT INTO activity_logs (company_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [companyId, null, 'PAYMENT', `Abonnement ${planId} payé avec succès via PayTech (IPN)`]
            );
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('Erreur Webhook IPN Abonnement:', err);
        res.status(500).send('Server Error');
    }
});

// ── POST /api/billing/submit-proof ──────────────────────────────────────────
router.post('/submit-proof', authenticate, async (req, res) => {
    const { planId, method, proofFile, proofFilename } = req.body;
    try {
        if (!proofFile) {
            return res.status(400).json({ error: 'Justificatif de paiement requis.' });
        }

        // Créer le répertoire s'il n'existe pas
        const uploadDir = path.join(__dirname, '..', '..', 'frontend', 'uploads', 'proofs');
        fs.mkdirSync(uploadDir, { recursive: true });

        // Extraire les données base64
        const matches = proofFile.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Format de fichier invalide.' });
        }

        const buffer = Buffer.from(matches[2], 'base64');
        const ext = path.extname(proofFilename) || '.png';
        const filename = `proof_${req.user.company_id}_${Date.now()}${ext}`;
        const filePath = path.join(uploadDir, filename);

        // Enregistrer le fichier physiquement
        fs.writeFileSync(filePath, buffer);
        const webPath = `/uploads/proofs/${filename}`;

        // Mettre à jour le statut dans la base de données
        await pool.query(
            "UPDATE companies SET subscription_status = 'pending_payment', payment_proof = $1 WHERE id = $2",
            [webPath, req.user.company_id]
        );

        // Enregistrer dans les logs d'activité
        await pool.query(
            'INSERT INTO activity_logs (company_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [req.user.company_id, req.user.id, 'PAYMENT_PROOF', `Justificatif de paiement soumis via ${method.toUpperCase()} pour le plan ${planId}`]
        );

        res.json({ message: 'Justificatif de paiement soumis avec succès.', status: 'pending_payment' });
    } catch (err) {
        console.error("Erreur lors de la soumission du justificatif :", err);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement du justificatif.' });
    }
});

module.exports = router;
