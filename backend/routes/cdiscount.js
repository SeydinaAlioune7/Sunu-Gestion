// ── Routes Cdiscount Marketplace ────────────────────────────────────────────
const express   = require('express');
const router    = express.Router();
const pool      = require('../db/pool');
const authenticate = require('../middleware/auth');
const cd        = require('../utils/cdiscount');

router.use(authenticate);

async function getToken(companyId) {
  const { rows } = await pool.query(
    'SELECT cdiscount_login, cdiscount_password FROM companies WHERE id = $1',
    [companyId]
  );
  if (!rows.length || !rows[0].cdiscount_login) throw new Error('Cdiscount non connecté.');
  const tokenData = await cd.getToken(rows[0].cdiscount_login, rows[0].cdiscount_password);
  if (!tokenData.access_token) throw new Error('Impossible d\'obtenir le token Cdiscount.');
  return tokenData.access_token;
}

// ── GET /api/cdiscount/status ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT cdiscount_login FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!rows.length || !rows[0].cdiscount_login) return res.json({ connected: false });
    res.json({ connected: true, login: rows[0].cdiscount_login });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/cdiscount/connect ──────────────────────────────────────────────
router.post('/connect', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Login et mot de passe requis.' });

  const test = await cd.testConnection(login, password);
  if (!test.success) return res.status(400).json({ error: `Connexion échouée : ${test.error}` });

  await pool.query(
    'UPDATE companies SET cdiscount_login = $1, cdiscount_password = $2 WHERE id = $3',
    [login, password, req.user.company_id]
  );
  res.json({ success: true, message: 'Cdiscount connecté !' });
});

// ── DELETE /api/cdiscount/disconnect ─────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  await pool.query(
    'UPDATE companies SET cdiscount_login = NULL, cdiscount_password = NULL WHERE id = $1',
    [req.user.company_id]
  );
  res.json({ success: true });
});

// ── POST /api/cdiscount/sync-orders ─────────────────────────────────────────
router.post('/sync-orders', async (req, res) => {
  try {
    const token  = await getToken(req.user.company_id);
    const orders = await cd.getOrders({ token });

    let imported = 0, skipped = 0;

    for (const order of orders) {
      const cdOrderId = order.OrderNumber || order.Id;
      const existing  = await pool.query(
        'SELECT id FROM cdiscount_orders WHERE cd_order_id = $1 AND company_id = $2',
        [String(cdOrderId), req.user.company_id]
      );
      if (existing.rows.length) { skipped++; continue; }

      const year = new Date().getFullYear();
      const lastInv = await pool.query(
        "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1",
        [`CDS-${year}-%`]
      );
      let num = 1;
      if (lastInv.rows.length) num = parseInt(lastInv.rows[0].invoice_number.split('-')[2], 10) + 1;
      const invoiceNumber = `CDS-${year}-${String(num).padStart(5, '0')}`;

      const clientName  = [order.Customer?.FirstName, order.Customer?.LastName].filter(Boolean).join(' ') || 'Client Cdiscount';
      const clientAddr  = [order.ShippingAddress?.Address1, order.ShippingAddress?.City, 'France'].filter(Boolean).join(', ');
      const totalAmount = parseFloat(order.TotalAmount || order.TotalPriceWithTax || 0);

      const invRes = await pool.query(
        `INSERT INTO invoices (company_id, invoice_number, client_name, client_address, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, 'paid', 'Cdiscount', $6) RETURNING id`,
        [req.user.company_id, invoiceNumber, clientName, clientAddr, totalAmount, `Commande Cdiscount ${cdOrderId}`]
      );
      const invoiceId = invRes.rows[0].id;

      for (const item of (order.OrderLineList || order.Lines || [])) {
        await pool.query(
          `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, NULL, $2, $3, $4)`,
          [invoiceId, item.ProductName || 'Produit Cdiscount', item.Quantity || 1, parseFloat(item.Price || 0)]
        );
      }

      await pool.query(
        `INSERT INTO cdiscount_orders (company_id, cd_order_id, invoice_id, invoice_number, status)
         VALUES ($1, $2, $3, $4, 'imported')`,
        [req.user.company_id, String(cdOrderId), invoiceId, invoiceNumber]
      );

      await pool.query(
        'INSERT INTO activity_logs (company_id, action, details) VALUES ($1, $2, $3)',
        [req.user.company_id, 'CDISCOUNT_ORDER_IMPORTED', `Commande Cdiscount ${cdOrderId} → Facture ${invoiceNumber} (${totalAmount} €)`]
      );

      imported++;
    }

    res.json({ success: true, imported, skipped, total: orders.length });
  } catch (err) {
    console.error('Erreur sync Cdiscount:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cdiscount/export-products ─────────────────────────────────────
router.post('/export-products', async (req, res) => {
  try {
    const token = await getToken(req.user.company_id);
    const { rows: products } = await pool.query(
      'SELECT * FROM products WHERE company_id = $1 AND not_for_sale = 0',
      [req.user.company_id]
    );
    if (!products.length) return res.status(400).json({ error: 'Aucun produit à exporter.' });

    let exported = 0;
    for (const p of products) {
      await cd.createProduct({ token }, p);
      exported++;
    }
    res.json({ success: true, exported });
  } catch (err) {
    console.error('Erreur export Cdiscount:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cdiscount/orders ────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT co.*, i.total_amount, i.client_name, i.created_at as imported_at
       FROM cdiscount_orders co LEFT JOIN invoices i ON i.id = co.invoice_id
       WHERE co.company_id = $1 ORDER BY co.id DESC LIMIT 50`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
