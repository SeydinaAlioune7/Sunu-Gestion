// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes Dropshipping – CJDropshipping Integration                           ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const cj = require('../utils/cjdropshipping');

// Toutes les routes nécessitent un utilisateur connecté
router.use(authenticate);

// ── Utilitaire : obtenir un token CJ valide pour une entreprise ───────────────
async function getCJToken(companyId) {
  const { rows } = await pool.query(
    'SELECT cj_email, cj_access_token, cj_refresh_token, cj_token_expires_at FROM dropshipping_configs WHERE company_id = $1',
    [companyId]
  );
  if (!rows.length) throw new Error('CJDropshipping non configuré. Veuillez connecter votre compte.');

  const cfg = rows[0];
  const now = new Date();
  const expiresAt = cfg.cj_token_expires_at ? new Date(cfg.cj_token_expires_at) : new Date(0);

  // Si le token est encore valide (marge de 5 min)
  if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
    return cfg.cj_access_token;
  }

  // Rafraîchir avec le refresh token
  const renewed = await cj.refreshAccessToken(cfg.cj_refresh_token);
  await pool.query(
    `UPDATE dropshipping_configs
     SET cj_access_token=$1, cj_refresh_token=$2, cj_token_expires_at=$3, updated_at=datetime('now')
     WHERE company_id=$4`,
    [renewed.accessToken, renewed.refreshToken, renewed.accessTokenExpiryDate, companyId]
  );
  return renewed.accessToken;
}

// ── GET /api/dropshipping/config ──────────────────────────────────────────────
// Statut de la connexion CJDropshipping
router.get('/config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT cj_email, cj_token_expires_at, auto_order FROM dropshipping_configs WHERE company_id = $1',
      [req.user.company_id]
    );
    if (!rows.length) return res.json({ connected: false });

    const cfg = rows[0];
    const connected = !!cfg.cj_access_token;
    res.json({ connected, email: cfg.cj_email, auto_order: cfg.auto_order, expires_at: cfg.cj_token_expires_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/dropshipping/config ─────────────────────────────────────────────
// Connecter via email+password OU via access_token direct (API Key CJ)
router.post('/config', async (req, res) => {
  const { email, password, access_token, auto_order = 1 } = req.body;

  if (!email) return res.status(400).json({ error: 'Email requis.' });
  if (!password && !access_token) return res.status(400).json({ error: 'Mot de passe ou Access Token requis.' });

  try {
    let accessToken, refreshToken, expiresAt;

    if (access_token) {
      // Token direct fourni depuis l'interface CJ
      accessToken = access_token;
      refreshToken = null;
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 an
    } else {
      const tokenData = await cj.getAccessToken(email, password);
      accessToken = tokenData.accessToken;
      refreshToken = tokenData.refreshToken;
      expiresAt = tokenData.accessTokenExpiryDate;
    }

    const { rows } = await pool.query(
      'SELECT id FROM dropshipping_configs WHERE company_id = $1',
      [req.user.company_id]
    );

    if (rows.length) {
      await pool.query(
        `UPDATE dropshipping_configs
         SET cj_email=$1, cj_access_token=$2, cj_refresh_token=$3, cj_token_expires_at=$4, auto_order=$5, updated_at=datetime('now')
         WHERE company_id=$6`,
        [email, accessToken, refreshToken, expiresAt, auto_order ? 1 : 0, req.user.company_id]
      );
    } else {
      await pool.query(
        `INSERT INTO dropshipping_configs (company_id, cj_email, cj_access_token, cj_refresh_token, cj_token_expires_at, auto_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.company_id, email, accessToken, refreshToken, expiresAt, auto_order ? 1 : 0]
      );
    }

    res.json({ success: true, message: 'Compte CJDropshipping connecté avec succès.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/dropshipping/config ──────────────────────────────────────────
// Déconnecter le compte CJDropshipping
router.delete('/config', async (req, res) => {
  try {
    await pool.query('DELETE FROM dropshipping_configs WHERE company_id = $1', [req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dropshipping/products ────────────────────────────────────────────
// Rechercher des produits dans le catalogue CJDropshipping
router.get('/products', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, categoryId = '' } = req.query;
  try {
    const token = await getCJToken(req.user.company_id);
    const result = await cj.searchProducts(token, {
      keyword: q,
      pageNum: parseInt(page),
      pageSize: parseInt(pageSize),
      categoryId
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/dropshipping/product/:pid ────────────────────────────────────────
// Détail d'un produit CJ (variantes, images, prix)
router.get('/product/:pid', async (req, res) => {
  try {
    const token = await getCJToken(req.user.company_id);
    const product = await cj.getProductDetail(token, req.params.pid);
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/dropshipping/import ─────────────────────────────────────────────
// Importer un produit CJ dans le catalogue local
router.post('/import', async (req, res) => {
  const { cj_product_id, cj_variant_id, cj_product_name, cost_price, shipping_cost = 0, selling_price, category = 'Dropshipping', image_url = '', description = '' } = req.body;

  if (!cj_product_id || !cj_variant_id || !selling_price) {
    return res.status(400).json({ error: 'cj_product_id, cj_variant_id et selling_price sont requis.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Créer le produit local
    const productRes = await client.query(
      `INSERT INTO products
         (company_id, name, category, description, image_url, purchase_price_exc_tax, price, selling_price_exc_tax, manage_stock, stock_quantity, not_for_sale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 0, 999, 0)
       RETURNING id`,
      [req.user.company_id, cj_product_name, category, description, image_url, cost_price + shipping_cost, selling_price]
    );
    const productId = productRes.rows[0].id;

    // Lier au produit CJ
    await client.query(
      `INSERT INTO dropshipping_products
         (company_id, product_id, cj_product_id, cj_variant_id, cj_product_name, cost_price, shipping_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.company_id, productId, cj_product_id, cj_variant_id, cj_product_name, cost_price, shipping_cost]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, product_id: productId, message: `"${cj_product_name}" importé dans votre catalogue.` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/dropshipping/imported ────────────────────────────────────────────
// Liste des produits importés depuis CJ
router.get('/imported', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.id, dp.cj_product_id, dp.cj_variant_id, dp.cj_product_name,
              dp.cost_price, dp.shipping_cost, dp.created_at,
              p.name, p.price, p.image_url, p.id as product_id
       FROM dropshipping_products dp
       JOIN products p ON p.id = dp.product_id
       WHERE dp.company_id = $1
       ORDER BY dp.created_at DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/dropshipping/imported/:id ─────────────────────────────────────
// Supprimer un produit importé (supprime aussi le produit local)
router.delete('/imported/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT product_id FROM dropshipping_products WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable.' });

    await client.query('DELETE FROM dropshipping_products WHERE id = $1', [req.params.id]);
    await client.query('DELETE FROM products WHERE id = $1', [rows[0].product_id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/dropshipping/orders ──────────────────────────────────────────────
// Liste des commandes dropshipping
router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT do.*, i.client_name, i.total_amount
       FROM dropshipping_orders do
       LEFT JOIN invoices i ON i.id = do.invoice_id
       WHERE do.company_id = $1
       ORDER BY do.created_at DESC
       LIMIT 100`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/dropshipping/orders/:id/sync ────────────────────────────────────
// Synchroniser le statut d'une commande depuis CJ
router.post('/orders/:id/sync', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM dropshipping_orders WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Commande introuvable.' });
    const order = rows[0];

    if (!order.cj_order_id) return res.status(400).json({ error: 'Pas encore de commande CJ associée.' });

    const token = await getCJToken(req.user.company_id);
    const detail = await cj.getOrderDetail(token, order.cj_order_id);

    const trackingNumber = detail.trackingNumber || detail.logisticTrackNo || null;
    const newStatus = detail.orderStatus || order.status;

    await pool.query(
      `UPDATE dropshipping_orders
       SET status=$1, tracking_number=$2, updated_at=datetime('now')
       WHERE id=$3`,
      [newStatus, trackingNumber, order.id]
    );

    res.json({ success: true, status: newStatus, tracking_number: trackingNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
