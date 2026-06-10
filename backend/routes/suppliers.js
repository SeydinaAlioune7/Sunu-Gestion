const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// GET /api/suppliers
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM suppliers WHERE company_id = $1 ORDER BY name ASC', [req.user.company_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
    try {
        const { name, contact_person, email, phone, address } = req.body;
        const result = await pool.query(
            'INSERT INTO suppliers (company_id, name, contact_person, email, phone, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.company_id, name, contact_person || '', email || '', phone || '', address || '']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

module.exports = router;
