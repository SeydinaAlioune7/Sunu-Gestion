// ── Routes eBay Marketplace ─────────────────────────────────────────────────
const express   = require('express');
const router    = express.Router();
const pool      = require('../db/pool');
const authenticate = require('../middleware/auth');
const ebay      = require('../utils/ebay');

router.use(authenticate);

// ── GET /api/ebay/status ─────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ebay_user_token, ebay_sandbox FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!rows.length || !rows[0].ebay_user_token) return res.json({ connected: false });
    const test = await ebay.testConnection({ user_token: rows[0].ebay_user_token, sandbox: !!rows[0].ebay_sandbox });
    res.json({ connected: test.success, sandbox: !!rows[0].ebay_sandbox, error: test.error });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/ebay/connect ───────────────────────────────────────────────────
// Sauvegarder le User Token eBay (OAuth 2.0 — généré côté frontend via redirect)
router.post('/connect', async (req, res) => {
  const { user_token, sandbox = false } = req.body;
  if (!user_token) return res.status(400).json({ error: 'user_token requis.' });

  const test = await ebay.testConnection({ user_token, sandbox });
  if (!test.success) return res.status(400).json({ error: `Token invalide : ${test.error}` });

  await pool.query(
    'UPDATE companies SET ebay_user_token = $1, ebay_sandbox = $2 WHERE id = $3',
    [user_token, sandbox ? 1 : 0, req.user.company_id]
  );
  res.json({ success: true, message: 'eBay connecté !' });
});

// ── DELETE /api/ebay/disconnect ──────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  await pool.query('UPDATE companies SET ebay_user_token = NULL WHERE id = $1', [req.user.company_id]);
  res.json({ success: true });
});

// ── POST /api/ebay/sync-orders ───────────────────────────────────────────────
router.post('/sync-orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ebay_user_token, ebay_sandbox FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!rows.length || !rows[0].ebay_user_token) return res.status(400).json({ error: 'eBay non connecté.' });

    const config = { user_token: rows[0].ebay_user_token, sandbox: !!rows[0].ebay_sandbox };
    const orders = await ebay.getOrders(config);

    let imported = 0, skipped = 0;

    for (const order of orders) {
      const ebayOrderId = order.orderId;
      const existing = await pool.query(
        'SELECT id FROM ebay_orders WHERE ebay_order_id = $1 AND company_id = $2',
        [ebayOrderId, req.user.company_id]
      );
      if (existing.rows.length) { skipped++; continue; }

      const year = new Date().getFullYear();
      const lastInv = await pool.query(
        "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1",
        [`EBY-${year}-%`]
      );
      let num = 1;
      if (lastInv.rows.length) num = parseInt(lastInv.rows[0].invoice_number.split('-')[2], 10) + 1;
      const invoiceNumber = `EBY-${year}-${String(num).padStart(5, '0')}`;

      const buyer       = order.buyer || {};
      const clientName  = buyer.username || 'Acheteur eBay';
      const shipping    = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {};
      const clientAddr  = [shipping.fullName, shipping.contactAddress?.addressLine1, shipping.contactAddress?.city, shipping.contactAddress?.countryCode].filter(Boolean).join(', ');
      const totalAmount = parseFloat(order.pricingSummary?.total?.value || 0);

      const invRes = await pool.query(
        `INSERT INTO invoices (company_id, invoice_number, client_name, client_address, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, 'paid', 'eBay', $6) RETURNING id`,
        [req.user.company_id, invoiceNumber, clientName, clientAddr, totalAmount, `Commande eBay ${ebayOrderId}`]
      );
      const invoiceId = invRes.rows[0].id;

      for (const item of (order.lineItems || [])) {
        await pool.query(
          `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, NULL, $2, $3, $4)`,
          [invoiceId, item.title || 'Produit eBay', item.quantity || 1, parseFloat(item.lineItemCost?.value || 0)]
        );
      }

      await pool.query(
        `INSERT INTO ebay_orders (company_id, ebay_order_id, invoice_id, invoice_number, status)
         VALUES ($1, $2, $3, $4, 'imported')`,
        [req.user.company_id, ebayOrderId, invoiceId, invoiceNumber]
      );

      await pool.query(
        'INSERT INTO activity_logs (company_id, action, details) VALUES ($1, $2, $3)',
        [req.user.company_id, 'EBAY_ORDER_IMPORTED', `Commande eBay ${ebayOrderId} → Facture ${invoiceNumber} (${totalAmount} €)`]
      );

      imported++;
    }

    res.json({ success: true, imported, skipped, total: orders.length });
  } catch (err) {
    console.error('Erreur sync eBay:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ebay/export-products ──────────────────────────────────────────
router.post('/export-products', async (req, res) => {
  try {
    const { rows: cfgRows } = await pool.query(
      'SELECT ebay_user_token, ebay_sandbox FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!cfgRows.length || !cfgRows[0].ebay_user_token) return res.status(400).json({ error: 'eBay non connecté.' });

    const config   = { user_token: cfgRows[0].ebay_user_token, sandbox: !!cfgRows[0].ebay_sandbox };
    const { rows: products } = await pool.query(
      'SELECT * FROM products WHERE company_id = $1 AND not_for_sale = 0',
      [req.user.company_id]
    );
    if (!products.length) return res.status(400).json({ error: 'Aucun produit à exporter.' });

    let exported = 0;
    for (const p of products) {
      await ebay.createListing(config, p);
      exported++;
    }
    res.json({ success: true, exported });
  } catch (err) {
    console.error('Erreur export eBay:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ebay/orders ─────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT eo.*, i.total_amount, i.client_name, i.created_at as imported_at
       FROM ebay_orders eo LEFT JOIN invoices i ON i.id = eo.invoice_id
       WHERE eo.company_id = $1 ORDER BY eo.id DESC LIMIT 50`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
