// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Produits (CRUD + gestion stock)                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const trialCheck = require('../middleware/trialCheck');

// Appliquer auth + trial check à toutes les routes
router.use(authenticate, trialCheck);

// ── GET /api/products ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM products WHERE company_id = $1';
    const params = [req.user.company_id];

    if (search) {
      query += ' AND (name ILIKE $2 OR description ILIKE $2)';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur listage produits :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PUT /api/products/reorder ───────────────────────────────────────────────
router.put('/reorder', async (req, res) => {
  const { positions } = req.body;
  if (!Array.isArray(positions)) return res.status(400).json({ error: 'Format invalide.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of positions) {
      await client.query('UPDATE products SET position = $1 WHERE id = $2 AND company_id = $3', [item.position, item.id, req.user.company_id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'OK' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erreur reorder' });
  } finally { client.release(); }
});

// ── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/products ───────────────────────────────────────────────────────
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Le nom du produit est requis.'),
    body('selling_price_exc_tax').isFloat({ min: 0 }).withMessage('Le prix de vente doit être un nombre positif.'),
    body('stock_quantity').optional().isInt({ min: 0 }),
    body('alert_threshold').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const {
        name, sku, barcode_type, unit, brand, category, sub_category,
        manage_stock, alert_threshold, description,
        has_imei, not_for_sale, weight, prep_time,
        tax_rate, tax_type, product_type,
        purchase_price_exc_tax, margin_percent, selling_price_exc_tax,
        stock_quantity, position
      } = req.body;

      // Calcul du prix final (TTC si applicable, ou on garde le prix HT comme base pour 'price' pour la rétrocompatibilité)
      const finalPrice = tax_type === 'inclusive' ? selling_price_exc_tax : selling_price_exc_tax * (1 + (tax_rate || 0)/100);

      const result = await pool.query(
        `INSERT INTO products (
          company_id, name, sku, barcode_type, unit, brand, category, sub_category,
          manage_stock, alert_threshold, description, image_url, has_imei, not_for_sale, weight, prep_time,
          tax_rate, tax_type, product_type, purchase_price_exc_tax, margin_percent, selling_price_exc_tax,
          price, stock_quantity, position
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22,
          $23, $24, $25
        ) RETURNING *`,
        [
          req.user.company_id, name, sku || null, barcode_type || 'C128', unit || null, brand || null, category || null, sub_category || null,
          manage_stock ? 1 : 0, alert_threshold || 5, description || '', req.body.image_url || null, has_imei ? 1 : 0, not_for_sale ? 1 : 0, weight || null, prep_time || null,
          tax_rate || 0, tax_type || 'exclusive', product_type || 'single', purchase_price_exc_tax || 0, margin_percent || 25, selling_price_exc_tax,
          finalPrice, stock_quantity || 0, position || 0
        ]
      );

      // Log d'activité
      await pool.query(
        'INSERT INTO activity_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.company_id, req.user.id, 'CREATE_PRODUCT', 'product', result.rows[0].id, `Produit "${name}" créé`]
      );

      // Mouvement de stock initial si stock > 0
      if (stock_quantity > 0) {
        await pool.query(
          'INSERT INTO stock_movements (product_id, company_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
          [result.rows[0].id, req.user.company_id, 'entry', stock_quantity, 'Stock initial']
        );
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erreur création produit :', err);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  }
);

// ── PUT /api/products/:id ────────────────────────────────────────────────────
router.put('/:id',
  [
    body('name').trim().notEmpty().withMessage('Le nom est requis.'),
    body('selling_price_exc_tax').isFloat({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const {
        name, sku, barcode_type, unit, brand, category, sub_category,
        manage_stock, alert_threshold, description,
        has_imei, not_for_sale, weight, prep_time,
        tax_rate, tax_type, product_type,
        purchase_price_exc_tax, margin_percent, selling_price_exc_tax,
        stock_quantity, position
      } = req.body;

      const finalPrice = tax_type === 'inclusive' ? selling_price_exc_tax : selling_price_exc_tax * (1 + (tax_rate || 0)/100);

      const result = await pool.query(
        `UPDATE products SET 
          name = $1, sku = $2, barcode_type = $3, unit = $4, brand = $5, category = $6, sub_category = $7,
          manage_stock = $8, alert_threshold = $9, description = $10, image_url = $11, has_imei = $12, not_for_sale = $13, 
          weight = $14, prep_time = $15, tax_rate = $16, tax_type = $17, product_type = $18, 
          purchase_price_exc_tax = $19, margin_percent = $20, selling_price_exc_tax = $21, 
          price = $22, stock_quantity = $23, position = $24
         WHERE id = $25 AND company_id = $26 RETURNING *`,
        [
          name, sku || null, barcode_type || 'C128', unit || null, brand || null, category || null, sub_category || null,
          manage_stock ? 1 : 0, alert_threshold || 5, description || '', req.body.image_url || null, has_imei ? 1 : 0, not_for_sale ? 1 : 0, 
          weight || null, prep_time || null, tax_rate || 0, tax_type || 'exclusive', product_type || 'single', 
          purchase_price_exc_tax || 0, margin_percent || 25, selling_price_exc_tax, 
          finalPrice, stock_quantity || 0, position || 0, req.params.id, req.user.company_id
        ]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Erreur mise à jour produit :', err);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  }
);

// ── DELETE /api/products/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND company_id = $2 RETURNING id, name',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });

    await pool.query(
      'INSERT INTO activity_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.company_id, req.user.id, 'DELETE_PRODUCT', 'product', result.rows[0].id, `Produit "${result.rows[0].name}" supprimé`]
    );

    res.json({ message: 'Produit supprimé.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/products/:id/stock ─────────────────────────────────────────────
router.post('/:id/stock',
  [
    body('type').isIn(['entry', 'exit', 'adjustment']).withMessage('Type invalide.'),
    body('quantity').isInt({ min: 1 }).withMessage('La quantité doit être positive.'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { type, quantity, note } = req.body;
      const productId = req.params.id;

      // Vérifier que le produit appartient à l'entreprise
      const product = await pool.query(
        'SELECT * FROM products WHERE id = $1 AND company_id = $2',
        [productId, req.user.company_id]
      );
      if (product.rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });

      let newStock;
      if (type === 'entry') {
        newStock = product.rows[0].stock_quantity + quantity;
      } else if (type === 'exit') {
        newStock = product.rows[0].stock_quantity - quantity;
        if (newStock < 0) return res.status(400).json({ error: 'Stock insuffisant.' });
      } else {
        newStock = quantity; // adjustment = valeur absolue
      }

      await pool.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, productId]);

      await pool.query(
        'INSERT INTO stock_movements (product_id, company_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
        [productId, req.user.company_id, type, quantity, note || '']
      );

      res.json({ message: 'Stock mis à jour.', new_stock: newStock });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  }
);

// ── POST /api/products/import-url ───────────────────────────────────────────
// Extrait les infos d'un produit depuis n'importe quelle URL (Jumia, AliExpress, Alibaba, Temu...)
router.post('/import-url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'URL invalide. Commence par http:// ou https://' });
  }

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    const html = await response.text();

    // Extrait le contenu d'une balise meta (property ou name)
    const getMeta = (...keys) => {
      for (const key of keys) {
        const patterns = [
          new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']${key}["']`, 'i'),
          new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+name=["']${key}["']`, 'i'),
        ];
        for (const p of patterns) {
          const m = html.match(p);
          if (m?.[1]?.trim()) return m[1].trim();
        }
      }
      return null;
    };

    // Décode les entités HTML basiques
    const decode = s => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");

    // Titre
    const rawTitle = getMeta('og:title', 'twitter:title', 'title')
      || html.match(/<title[^>]*>([^<]{3,})<\/title>/i)?.[1]
      || '';
    const name = decode(rawTitle).substring(0, 200);

    // Description
    const rawDesc = getMeta('og:description', 'twitter:description', 'description') || '';
    const description = decode(rawDesc).substring(0, 600);

    // Image principale
    const image_url = getMeta('og:image', 'og:image:secure_url', 'twitter:image', 'image') || '';

    // Prix — plusieurs stratégies
    let priceRaw = getMeta('product:price:amount', 'og:price:amount', 'price');
    if (!priceRaw) {
      // itemprop="price"
      const m = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
      if (m) priceRaw = m[1];
    }
    if (!priceRaw) {
      // Jumia / Alibaba class patterns
      const m = html.match(/class=["'][^"']*(?:price|prc|product-price)[^"']*["'][^>]*>[\s\S]*?([0-9][0-9\s,.]*)/i);
      if (m) priceRaw = m[1];
    }
    const price = priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, '')) || null : null;

    // Devise
    const currency = getMeta('product:price:currency', 'og:price:currency') || 'XOF';

    // Nom du site source
    const siteName = getMeta('og:site_name') || new URL(url).hostname.replace('www.', '');

    res.json({ name, description, image_url, price, currency, site_name: siteName, source_url: url });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(408).json({ error: 'Timeout : le site a mis trop de temps à répondre.' });
    }
    res.status(500).json({ error: 'Impossible de charger cette URL : ' + err.message });
  }
});

// ── GET /api/products/:id/movements ──────────────────────────────────────────
router.get('/:id/movements', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM stock_movements WHERE product_id = $1 AND company_id = $2 ORDER BY created_at DESC LIMIT 50',
      [req.params.id, req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── VARIANTES ─────────────────────────────────────────────────────────────────

router.get('/:id/variants', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY name, value',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/:id/variants', async (req, res) => {
  const { name, value, price_modifier = 0, stock_quantity = 0, sku } = req.body;
  if (!name || !value) return res.status(400).json({ error: 'name et value sont requis.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO product_variants (product_id, name, value, price_modifier, stock_quantity, sku) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.id, name, value, parseFloat(price_modifier) || 0, parseInt(stock_quantity) || 0, sku || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/:id/variants/:vid', async (req, res) => {
  const { name, value, price_modifier = 0, stock_quantity = 0, sku } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE product_variants SET name=$1, value=$2, price_modifier=$3, stock_quantity=$4, sku=$5 WHERE id=$6 AND product_id=$7 RETURNING *',
      [name, value, parseFloat(price_modifier) || 0, parseInt(stock_quantity) || 0, sku || null, req.params.vid, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Variante introuvable.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.delete('/:id/variants/:vid', async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2', [req.params.vid, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
