// ── Routes Jumia Marketplace ────────────────────────────────────────────────
// Connexion SunuGestion ↔ Jumia Seller Center
// Sync commandes + produits + déclenchement CJDropshipping

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const authenticate = require('../middleware/auth');
const jumia   = require('../utils/jumia');
const cj      = require('../utils/cjdropshipping');

router.use(authenticate);

// ── Helpers ─────────────────────────────────────────────────────────────────
function getConfig(row) {
  return {
    user_id: row.jumia_user_id,
    api_key: row.jumia_api_key,
    country: row.jumia_country || 'sn',
  };
}

// ── GET /api/jumia/status ────────────────────────────────────────────────────
// Vérifier si Jumia est connecté pour cette entreprise
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT jumia_user_id, jumia_api_key, jumia_country, jumia_auto_sync FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!rows.length || !rows[0].jumia_user_id) {
      return res.json({ connected: false });
    }
    const cfg = getConfig(rows[0]);
    const test = await jumia.testConnection(cfg);
    res.json({ connected: test.success, country: rows[0].jumia_country, auto_sync: rows[0].jumia_auto_sync, error: test.error });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/jumia/connect ──────────────────────────────────────────────────
// Sauvegarder les credentials Jumia et tester la connexion
router.post('/connect', async (req, res) => {
  const { user_id, api_key, country = 'sn' } = req.body;
  if (!user_id || !api_key) return res.status(400).json({ error: 'user_id et api_key requis.' });

  const cfg = { user_id, api_key, country };
  const test = await jumia.testConnection(cfg);
  if (!test.success) return res.status(400).json({ error: `Connexion échouée : ${test.error}` });

  await pool.query(
    'UPDATE companies SET jumia_user_id = $1, jumia_api_key = $2, jumia_country = $3 WHERE id = $4',
    [user_id, api_key, country, req.user.company_id]
  );
  res.json({ success: true, message: 'Jumia connecté avec succès !' });
});

// ── DELETE /api/jumia/disconnect ─────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    'UPDATE companies SET jumia_user_id = NULL, jumia_api_key = NULL WHERE id = $1',
    [req.user.company_id]
  );
  res.json({ success: true });
});

// ── POST /api/jumia/sync-orders ──────────────────────────────────────────────
// Synchroniser les nouvelles commandes Jumia → SunuGestion
router.post('/sync-orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT jumia_user_id, jumia_api_key, jumia_country FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!rows.length || !rows[0].jumia_user_id) {
      return res.status(400).json({ error: 'Jumia non connecté.' });
    }
    const cfg = getConfig(rows[0]);
    const orders = await jumia.getOrders(cfg, 'pending');

    let imported = 0;
    let skipped  = 0;

    for (const order of orders) {
      const jumiaOrderId = String(order.OrderId);

      // Vérifier si déjà importé
      const existing = await pool.query(
        'SELECT id FROM jumia_orders WHERE jumia_order_id = $1 AND company_id = $2',
        [jumiaOrderId, req.user.company_id]
      );
      if (existing.rows.length) { skipped++; continue; }

      // Récupérer les items de la commande
      const items = await jumia.getOrderItems(cfg, jumiaOrderId);

      // Générer un numéro de facture
      const year = new Date().getFullYear();
      const lastInv = await pool.query(
        "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1",
        [`JUM-${year}-%`]
      );
      let num = 1;
      if (lastInv.rows.length) num = parseInt(lastInv.rows[0].invoice_number.split('-')[2], 10) + 1;
      const invoiceNumber = `JUM-${year}-${String(num).padStart(5, '0')}`;

      const clientName    = `${order.BillingAddress?.FirstName || ''} ${order.BillingAddress?.LastName || ''}`.trim() || 'Client Jumia';
      const clientAddress = [
        order.BillingAddress?.Address1,
        order.BillingAddress?.City,
        order.BillingAddress?.CountryCode,
      ].filter(Boolean).join(', ');
      const clientPhone = order.BillingAddress?.Phone || 'N/A';

      let totalAmount = 0;
      const invoiceResult = await pool.query(
        `INSERT INTO invoices (company_id, invoice_number, client_name, client_address, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, 0, 'paid', 'Jumia', $5) RETURNING id`,
        [req.user.company_id, invoiceNumber, clientName, `${clientAddress} | Tél: ${clientPhone}`, `Commande Jumia #${jumiaOrderId}`]
      );
      const invoiceId = invoiceResult.rows[0].id;

      for (const item of items) {
        const price = parseFloat(item.ItemPrice || item.PaidPrice || 0);
        const qty   = parseInt(item.Quantity || 1, 10);
        totalAmount += price * qty;

        await pool.query(
          `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, NULL, $2, $3, $4)`,
          [invoiceId, item.Name || 'Produit Jumia', qty, price]
        );
      }

      await pool.query('UPDATE invoices SET total_amount = $1 WHERE id = $2', [totalAmount, invoiceId]);

      // Enregistrer en jumia_orders
      await pool.query(
        `INSERT INTO jumia_orders (company_id, jumia_order_id, invoice_id, invoice_number, status)
         VALUES ($1, $2, $3, $4, 'imported')`,
        [req.user.company_id, jumiaOrderId, invoiceId, invoiceNumber]
      );

      // Log activité
      await pool.query(
        'INSERT INTO activity_logs (company_id, action, details) VALUES ($1, $2, $3)',
        [req.user.company_id, 'JUMIA_ORDER_IMPORTED', `Commande Jumia #${jumiaOrderId} → Facture ${invoiceNumber} (${totalAmount} F CFA)`]
      );

      imported++;
    }

    res.json({ success: true, imported, skipped, total: orders.length });
  } catch (err) {
    console.error('Erreur sync Jumia:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jumia/export-products ─────────────────────────────────────────
// Exporter les produits SunuGestion vers Jumia
router.post('/export-products', async (req, res) => {
  try {
    const { rows: cfgRows } = await pool.query(
      'SELECT jumia_user_id, jumia_api_key, jumia_country FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!cfgRows.length || !cfgRows[0].jumia_user_id) {
      return res.status(400).json({ error: 'Jumia non connecté.' });
    }
    const cfg = getConfig(cfgRows[0]);

    const { rows: products } = await pool.query(
      'SELECT * FROM products WHERE company_id = $1 AND not_for_sale = 0',
      [req.user.company_id]
    );
    if (!products.length) return res.status(400).json({ error: 'Aucun produit à exporter.' });

    await jumia.createProducts(cfg, products);

    res.json({ success: true, exported: products.length });
  } catch (err) {
    console.error('Erreur export produits Jumia:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jumia/orders ────────────────────────────────────────────────────
// Lister les commandes Jumia importées
router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT jo.*, i.total_amount, i.client_name, i.created_at as imported_at
       FROM jumia_orders jo
       LEFT JOIN invoices i ON i.id = jo.invoice_id
       WHERE jo.company_id = $1
       ORDER BY jo.id DESC LIMIT 50`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
