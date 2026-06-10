// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Dépenses (expenses) — Comptabilité simplifiée                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const trialCheck = require('../middleware/trialCheck');

// Toutes les routes nécessitent une authentification
router.use(authenticate);
router.use(trialCheck);

// ── GET /api/expenses — Liste toutes les dépenses de la compagnie ────────────
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM expenses WHERE company_id = $1 ORDER BY expense_date DESC, created_at DESC`,
            [req.user.company_id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Erreur récupération dépenses :', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── GET /api/expenses/summary — Résumé mensuel ───────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const { month, year } = req.query;
        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();

        // Total des dépenses du mois
        const expResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total_expenses,
                    COUNT(*) as count
             FROM expenses
             WHERE company_id = $1
             AND strftime('%m', expense_date) = $2
             AND strftime('%Y', expense_date) = $3`,
            [req.user.company_id, String(targetMonth).padStart(2, '0'), String(targetYear)]
        );

        // Total des ventes du mois (factures payées)
        const salesResult = await pool.query(
            `SELECT COALESCE(SUM(total_amount), 0) as total_sales,
                    COUNT(*) as count
             FROM invoices
             WHERE company_id = $1
             AND status = 'paid'
             AND strftime('%m', paid_at) = $2
             AND strftime('%Y', paid_at) = $3`,
            [req.user.company_id, String(targetMonth).padStart(2, '0'), String(targetYear)]
        );

        // Dépenses par catégorie
        const byCatResult = await pool.query(
            `SELECT category, COALESCE(SUM(amount), 0) as total
             FROM expenses
             WHERE company_id = $1
             AND strftime('%m', expense_date) = $2
             AND strftime('%Y', expense_date) = $3
             GROUP BY category ORDER BY total DESC`,
            [req.user.company_id, String(targetMonth).padStart(2, '0'), String(targetYear)]
        );

        const totalSales = parseFloat(salesResult.rows[0]?.total_sales || 0);
        const totalExpenses = parseFloat(expResult.rows[0]?.total_expenses || 0);

        res.json({
            month: targetMonth,
            year: targetYear,
            total_sales: totalSales,
            total_expenses: totalExpenses,
            net_profit: totalSales - totalExpenses,
            expense_count: expResult.rows[0]?.count || 0,
            by_category: byCatResult.rows
        });
    } catch (err) {
        console.error('Erreur résumé dépenses :', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── POST /api/expenses — Créer une dépense ───────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { label, amount, category, expense_date, note } = req.body;
        if (!label || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Libellé et montant requis.' });
        }

        const { rows } = await pool.query(
            `INSERT INTO expenses (company_id, label, amount, category, expense_date, note)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.user.company_id, label, parseFloat(amount), category || 'Autre', expense_date || new Date().toISOString().split('T')[0], note || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Erreur création dépense :', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── PUT /api/expenses/:id — Modifier une dépense ─────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { label, amount, category, expense_date, note } = req.body;
        const { rows } = await pool.query(
            `UPDATE expenses SET label=$1, amount=$2, category=$3, expense_date=$4, note=$5
             WHERE id=$6 AND company_id=$7 RETURNING *`,
            [label, parseFloat(amount), category, expense_date, note, req.params.id, req.user.company_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Dépense non trouvée.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── DELETE /api/expenses/:id — Supprimer une dépense ─────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `DELETE FROM expenses WHERE id=$1 AND company_id=$2 RETURNING id`,
            [req.params.id, req.user.company_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Dépense non trouvée.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

module.exports = router;
