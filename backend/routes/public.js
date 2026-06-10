const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { sendOrderReceivedEmail } = require('../utils/mailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cj = require('../utils/cjdropshipping');

// Déclenche les commandes CJ pour tous les articles dropshipping d'une facture
async function triggerDropshippingOrders(invoiceId, invoiceNumber, companyId) {
  try {
    // Vérifier si l'entreprise a le dropshipping avec auto_order activé
    const cfgRes = await pool.query(
      'SELECT cj_access_token, cj_refresh_token, cj_token_expires_at, auto_order, cj_email FROM dropshipping_configs WHERE company_id = $1',
      [companyId]
    );
    if (!cfgRes.rows.length || !cfgRes.rows[0].auto_order) return;

    // Récupérer les articles de la facture qui sont des produits dropshipping
    const itemsRes = await pool.query(
      `SELECT ii.product_id, ii.product_name, ii.quantity,
              dp.cj_variant_id, dp.cj_product_id
       FROM invoice_items ii
       JOIN dropshipping_products dp ON dp.product_id = ii.product_id AND dp.company_id = $1
       WHERE ii.invoice_id = $2`,
      [companyId, invoiceId]
    );
    if (!itemsRes.rows.length) return; // Aucun article dropshipping

    // Récupérer l'adresse client depuis la facture
    const invRes = await pool.query(
      'SELECT client_name, client_address FROM invoices WHERE id = $1',
      [invoiceId]
    );
    const inv = invRes.rows[0];

    // Parser le téléphone depuis client_address (format: "adresse | Tél: xxx | Email: xxx")
    const phoneMatch = (inv.client_address || '').match(/Tél:\s*([^\|]+)/);
    const phone = phoneMatch ? phoneMatch[1].trim() : '000000000';
    const addressOnly = (inv.client_address || '').split('|')[0].trim();

    // Récupérer le token CJ (rafraîchir si nécessaire)
    const cfg = cfgRes.rows[0];
    let token = cfg.cj_access_token;
    const expiresAt = cfg.cj_token_expires_at ? new Date(cfg.cj_token_expires_at) : new Date(0);
    if (expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
      const renewed = await cj.refreshAccessToken(cfg.cj_refresh_token);
      token = renewed.accessToken;
      await pool.query(
        `UPDATE dropshipping_configs SET cj_access_token=$1, cj_refresh_token=$2, cj_token_expires_at=$3 WHERE company_id=$4`,
        [renewed.accessToken, renewed.refreshToken, renewed.accessTokenExpiryDate, companyId]
      );
    }

    // Créer la commande CJ
    const orderData = {
      orderNumber: invoiceNumber,
      shippingCountryCode: 'SN',
      shippingCountry: 'Senegal',
      shippingProvince: 'Dakar',
      shippingCity: 'Dakar',
      shippingPhone: phone,
      shippingCustomerName: inv.client_name,
      shippingAddress: addressOnly || 'Dakar, Sénégal',
      shippingZip: '00000',
      remark: `Commande SunuGestion ${invoiceNumber}`,
      products: itemsRes.rows.map(r => ({ vid: r.cj_variant_id, quantity: r.quantity }))
    };

    const cjResult = await cj.createOrder(token, orderData);

    // Sauvegarder la commande CJ en base
    await pool.query(
      `INSERT INTO dropshipping_orders (company_id, invoice_id, invoice_number, cj_order_id, status)
       VALUES ($1, $2, $3, $4, 'created')`,
      [companyId, invoiceId, invoiceNumber, cjResult.orderId]
    );

    console.log(`✅ Commande CJ créée : ${cjResult.orderId} pour facture ${invoiceNumber}`);
  } catch (err) {
    console.error(`❌ Erreur auto-commande CJ pour ${invoiceNumber}:`, err.message);
    // Enregistrer l'erreur sans bloquer le flux principal
    await pool.query(
      `INSERT INTO dropshipping_orders (company_id, invoice_id, invoice_number, status, error_message)
       VALUES ($1, $2, $3, 'error', $4)`,
      [companyId, invoiceId, invoiceNumber, err.message]
    ).catch(() => {});
  }
}

// Configuration Multer pour les preuves de paiement (justificatifs)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../frontend/uploads/receipts');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `order-proof-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ── GET /api/public/company-by-domain ─────────────────────────────────────────
router.get('/company-by-domain', async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ error: 'domain est requis.' });

    // Nettoyer le nom d'hôte (enlever le port si présent)
    const hostname = domain.split(':')[0];

    const result = await pool.query(
      'SELECT id, name, subscription_status, currency, logo_url FROM companies WHERE custom_domain = $1 OR custom_domain = $2',
      [hostname, domain]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucune boutique associée à ce domaine.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur API Publique Domain :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/public/products ────────────────────────────────────────────────
// Liste des produits publics pour la boutique
router.get('/products', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id est requis.' });

    // Vérifier si l'entreprise est en maintenance ou inactive
    const companyRes = await pool.query("SELECT subscription_status FROM companies WHERE id = $1", [company_id]);
    if (companyRes.rows.length > 0) {
        const status = companyRes.rows[0].subscription_status;
        if (status === 'maintenance' || status === 'expired' || status === 'blocked' || status === 'pending_payment') {
            return res.status(503).json({ error: 'Boutique momentanément indisponible', code: 'MAINTENANCE' });
        }
    }

    const result = await pool.query(
      'SELECT id, name, price, description, category, stock_quantity, sku, image_url FROM products WHERE company_id = $1 AND not_for_sale = 0 ORDER BY position ASC, created_at DESC',
      [company_id]
    );
    const products = result.rows;
    if (products.length > 0) {
      try {
        const ids = products.map(p => p.id);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const varResult = await pool.query(
          `SELECT id, product_id, name, value, price_modifier, stock_quantity FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY name, id ASC`,
          ids
        );
        const varMap = {};
        varResult.rows.forEach(v => {
          if (!varMap[v.product_id]) varMap[v.product_id] = [];
          varMap[v.product_id].push(v);
        });
        products.forEach(p => { p.variants = varMap[p.id] || []; });
      } catch (_) {
        // Table product_variants pas encore créée (redémarrage requis) — les produits s'affichent sans variantes
        products.forEach(p => { p.variants = []; });
      }
    }
    res.json(products);
  } catch (err) {
    console.error('Erreur API Publique Produits :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/public/orders ─────────────────────────────────────────────────
// Enregistrement d'une commande depuis la boutique (avec preuve de paiement)
router.post('/orders', upload.single('payment_proof'), async (req, res) => {
  console.log('ORDER REQ BODY:', req.body);
  const client = await pool.connect();
  try {
    const company_id = req.body.company_id;
    const client_name = req.body.client_name;
    const client_address = req.body.client_address;
    const client_email = req.body.client_email;
    const payment_method = req.body.payment_method;
    const items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
    const payment_proof_url = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    if (!company_id || !items || items.length === 0) {
      return res.status(400).json({ 
        error: `Données de commande incomplètes. Reçu : company_id=${company_id}, items=${JSON.stringify(req.body.items)}` 
      });
    }

    await client.query('BEGIN');

    // Génération du numéro de facture
    const year = new Date().getFullYear();
    const lastInv = await client.query(
      "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1",
      [`WEB-${year}-%`]
    );
    let num = 1;
    if (lastInv.rows.length > 0) {
      num = parseInt(lastInv.rows[0].invoice_number.split('-')[2], 10) + 1;
    }
    const invoiceNumber = `WEB-${year}-${String(num).padStart(5, '0')}`;

    const client_phone = req.body.client_phone || 'N/A';
    const combinedAddress = `${client_address || ''} | Tél: ${client_phone} | Email: ${client_email || 'N/A'}`;
    const initialStatus = (payment_method === 'cash') ? 'pending' : ((payment_proof_url || payment_method === 'paytech') ? 'pending_payment' : 'pending');

    const invoiceResult = await client.query(
      `INSERT INTO invoices (company_id, invoice_number, client_name, client_address, total_amount, status, payment_method, payment_proof)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7) RETURNING *`,
      [company_id, invoiceNumber, client_name, combinedAddress, initialStatus, payment_method, payment_proof_url]
    );
    const invoiceId = invoiceResult.rows[0].id;

    let totalAmount = 0;

    // 2. Ajouter les articles et déduire le stock
    for (const item of items) {
      const product = await client.query(
        'SELECT name, price, stock_quantity FROM products WHERE id = $1 AND company_id = $2',
        [item.product_id, company_id]
      );
      if (product.rows.length === 0) throw new Error(`Produit ${item.product_id} introuvable.`);

      let unitPrice = parseFloat(product.rows[0].price);
      let productLabel = product.rows[0].name;

      // Gestion des variantes (taille, couleur, etc.)
      const variantIds = Array.isArray(item.variant_ids) ? item.variant_ids.filter(Boolean) : [];
      for (const vid of variantIds) {
        const v = await client.query(
          'SELECT name, value, price_modifier FROM product_variants WHERE id = $1 AND product_id = $2',
          [vid, item.product_id]
        );
        if (v.rows.length > 0) {
          unitPrice += parseFloat(v.rows[0].price_modifier || 0);
          productLabel += ` · ${v.rows[0].name}: ${v.rows[0].value}`;
          await client.query(
            'UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, vid]
          );
        }
      }

      const lineTotal = unitPrice * item.quantity;
      totalAmount += lineTotal;

      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, item.product_id, productLabel, item.quantity, unitPrice]
      );

      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );

      await client.query(
        'INSERT INTO stock_movements (product_id, company_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
        [item.product_id, company_id, 'exit', item.quantity, `Vente Web (Facture ${invoiceNumber})`]
      );
    }

    // 3. Mettre à jour le montant total
    await client.query('UPDATE invoices SET total_amount = $1 WHERE id = $2', [totalAmount, invoiceId]);

    // Récupérer le nom de l'entreprise
    const companyRes = await client.query('SELECT name FROM companies WHERE id = $1', [company_id]);
    const companyName = companyRes.rows.length > 0 ? companyRes.rows[0].name : 'Notre Boutique';

    // Si paiement via PayTech, initier le flux de paiement en ligne
    if (payment_method === 'paytech') {
      const keysRes = await client.query('SELECT paytech_api_key, paytech_api_secret FROM companies WHERE id = $1', [company_id]);
      const { paytech_api_key, paytech_api_secret } = keysRes.rows[0];

      if (!paytech_api_key || !paytech_api_secret) {
        throw new Error("Cette boutique n'a pas configuré ses clés de paiement automatique PayTech.");
      }

      const host = req.headers.host || 'www.sunugestion.sn';
      const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
      const baseUrl = `${protocol}://${host}`;

      const successUrl = `${baseUrl}/vitrine/index.html?company_id=${company_id}&success_invoice=${invoiceNumber}`;
      const cancelUrl = `${baseUrl}/vitrine/index.html?company_id=${company_id}&cancel_invoice=${invoiceNumber}`;
      const ipnUrl = `${baseUrl}/api/public/paytech-ipn`;

      const env = paytech_api_key.includes('test') ? 'test' : 'prod';

      const { initPaytechPayment } = require('../utils/paytech');
      const paytechResult = await initPaytechPayment({
        apiKey: paytech_api_key,
        apiSecret: paytech_api_secret,
        refCommand: invoiceNumber,
        amount: totalAmount,
        itemName: `Commande ${invoiceNumber} - ${companyName}`,
        successUrl,
        cancelUrl,
        ipnUrl,
        env
      });

      if (!paytechResult.success) {
        throw new Error("PayTech: " + paytechResult.error);
      }

      await client.query('UPDATE invoices SET payment_proof = $1 WHERE id = $2', [paytechResult.token, invoiceId]);
      await client.query('COMMIT');
      
      return res.status(201).json({ 
        message: 'Commande initiée. Redirection vers le paiement...', 
        invoice_number: invoiceNumber, 
        total: totalAmount, 
        redirect_url: paytechResult.redirectUrl 
      });
    }

    await client.query('COMMIT');

    // ✉️ Envoi de l'email de confirmation de réception
    if (client_email && client_email.includes('@')) {
      sendOrderReceivedEmail(client_email, client_name, invoiceNumber, totalAmount, companyName, payment_method)
        .catch(err => console.error('Erreur tâche d\'envoi email :', err));
    }

    // 📱 Simulation de l'envoi du SMS de confirmation de réception
    if (client_phone && client_phone !== 'N/A') {
      console.log(`\n==================================================`);
      console.log(`📱 [SMS SIMULATION] Envoyé au ${client_phone}`);
      console.log(`Boutique : ${companyName}`);
      console.log(`Message : Bonjour ${client_name}, votre commande ${invoiceNumber} d'un montant de ${totalAmount} F CFA a bien été reçue. Elle est en attente de validation par le vendeur.`);
      console.log(`==================================================\n`);
    }

    res.status(201).json({ message: 'Commande enregistrée avec succès.', invoice_number: invoiceNumber, total: totalAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur API Publique Commande :', err);
    res.status(500).json({ error: err.message || 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ── POST /api/public/paytech-ipn ─────────────────────────────────────────────
// Notification instantanée de paiement (IPN) envoyée par PayTech
router.post('/paytech-ipn', async (req, res) => {
  console.log('PAYTECH IPN RECEIVED:', req.body);
  const { type_event, ref_command, token } = req.body;

  if (type_event !== 'sale_complete') {
    return res.status(200).send('Event ignored');
  }

  try {
    // 1. Trouver la facture associée au numéro de commande (ref_command)
    const invoiceRes = await pool.query('SELECT id, company_id, total_amount, status FROM invoices WHERE invoice_number = $1', [ref_command]);
    if (invoiceRes.rows.length === 0) {
      console.error(`PayTech IPN: Facture ${ref_command} introuvable.`);
      return res.status(404).send('Invoice not found');
    }
    const invoice = invoiceRes.rows[0];

    // 2. Récupérer les clés API PayTech de cette entreprise
    const companyRes = await pool.query('SELECT name, paytech_api_key, paytech_api_secret FROM companies WHERE id = $1', [invoice.company_id]);
    if (companyRes.rows.length === 0) {
      console.error(`PayTech IPN: Entreprise ${invoice.company_id} introuvable.`);
      return res.status(404).send('Company not found');
    }
    const company = companyRes.rows[0];

    // 3. Vérifier la signature IPN
    const { verifyPaytechIpnSignature } = require('../utils/paytech');
    const isValid = verifyPaytechIpnSignature({
      apiKey: company.paytech_api_key,
      apiSecret: company.paytech_api_secret,
      body: req.body
    });

    if (!isValid) {
      console.error('PayTech IPN: Signature invalide !');
      return res.status(400).send('Invalid signature');
    }

    // 4. Mettre à jour la facture en statut 'paid'
    if (invoice.status !== 'paid') {
      await pool.query(
        "UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = $1",
        [invoice.id]
      );
      
      // Log d'activité
      await pool.query(
        'INSERT INTO activity_logs (company_id, action, details) VALUES ($1, $2, $3)',
        [invoice.company_id, 'PAYTECH_IPN_SUCCESS', `Paiement en ligne PayTech validé automatiquement pour la facture ${ref_command}`]
      );

      console.log(`✅ PayTech IPN: Facture ${ref_command} payée avec succès !`);

      // Déclencher les commandes CJDropshipping automatiquement
      triggerDropshippingOrders(invoice.id, ref_command, invoice.company_id);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('PayTech IPN Error:', err);
    res.status(500).send('Server error');
  }
});

// ── GET /api/public/company ──────────────────────────────────────────────────
router.get('/company', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id est requis.' });
    const { rows } = await pool.query('SELECT name, logo_url, phone, email, website, country, city, currency, payment_info, wave_number, om_number, bank_iban, paytech_api_key, cinetpay_api_key, subscription_status FROM companies WHERE id = $1', [company_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable.' });
    
    const c = rows[0];

    // Vérifier si l'entreprise est en maintenance ou inactive
    if (['maintenance', 'expired', 'blocked', 'pending_payment'].includes(c.subscription_status)) {
        return res.status(503).json({ error: 'Boutique momentanément indisponible', code: 'MAINTENANCE' });
    }

    const responseData = {
      name: c.name,
      logo_url: c.logo_url,
      phone: c.phone,
      email: c.email,
      website: c.website,
      country: c.country,
      city: c.city,
      currency: c.currency,
      payment_info: c.payment_info,
      wave_number: c.wave_number,
      om_number: c.om_number,
      bank_iban: c.bank_iban,
      paytech_enabled: !!c.paytech_api_key,
      cinetpay_enabled: !!c.cinetpay_api_key
    };
    res.json(responseData);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/public/visits ──────────────────────────────────────────────────
router.post('/visits', async (req, res) => {
  try {
    const { company_id, referrer, is_private } = req.body;
    if (!company_id) return res.status(400).json({ error: 'company_id est requis.' });
    
    // Obtenir l'IP réelle et le User Agent
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const user_agent = req.headers['user-agent'] || 'Unknown';

    await pool.query(
      'INSERT INTO shop_visits (company_id, ip_address, user_agent, referrer, is_private) VALUES ($1, $2, $3, $4, $5)',
      [parseInt(company_id, 10), ip_address, user_agent, referrer || 'Direct', is_private ? 1 : 0]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur enregistrement visite :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/public/visits/today ─────────────────────────────────────────────
router.get('/visits/today', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'company_id requis' });
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM shop_visits WHERE company_id = $1 AND visited_at >= datetime('now', 'start of day') AND ip_address != $2`,
      [companyId, req.ip]
    );
    res.json({ count: result.rows[0].count });
  } catch (err) {
    console.error('Erreur API visites aujourd\'hui :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/public/cinetpay/init ────────────────────────────────────────────
// Initier un paiement CinetPay pour la boutique vitrine
router.post('/cinetpay/init', async (req, res) => {
  try {
    const { company_id, amount, customer_name, customer_email, customer_phone, items } = req.body;
    if (!company_id || !amount || !items) {
      return res.status(400).json({ error: 'Données incomplètes.' });
    }

    // Récupérer les clés CinetPay de la compagnie depuis ses paramètres
    const compRes = await pool.query(
      'SELECT name, cinetpay_api_key, cinetpay_site_id FROM companies WHERE id = $1',
      [company_id]
    );
    if (!compRes.rows.length) return res.status(404).json({ error: 'Boutique introuvable.' });

    const company = compRes.rows[0];
    const cinetpayApiKey = company.cinetpay_api_key;
    const cinetpaySiteId = company.cinetpay_site_id;

    // Si les clés ne sont pas configurées, retourner un indicateur pour mode simulation
    if (!cinetpayApiKey || !cinetpaySiteId) {
      return res.status(200).json({
        mode: 'simulation',
        message: 'Clés CinetPay non configurées. Mode simulation activé.',
        simulated: true
      });
    }

    const { initPayment } = require('../utils/cinetpay');
    const transactionId = `SG-${company_id}-${Date.now()}`;
    const baseUrl = process.env.APP_URL || 'https://sunugestion.sn';

    const result = await initPayment({
      apiKey: cinetpayApiKey,
      siteId: cinetpaySiteId,
      transactionId,
      amount: Math.round(amount),
      currency: 'XOF',
      description: `Commande ${company.name}`,
      returnUrl: `${baseUrl}/vitrine/payment-return?company_id=${company_id}&tx=${transactionId}`,
      notifyUrl: `${baseUrl}/api/public/cinetpay/webhook`,
      customerName: customer_name,
      customerEmail: customer_email || '',
      customerPhone: customer_phone || ''
    });

    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    // Stocker la transaction en cours en base pour retrouver au retour
    await pool.query(
      `INSERT INTO _cinetpay_pending (transaction_id, company_id, amount, customer_name, customer_phone, items_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
       ON CONFLICT(transaction_id) DO NOTHING`,
      [transactionId, company_id, amount, customer_name, customer_phone || '', JSON.stringify(items)]
    ).catch(() => {}); // Table optionnelle, ignore si n'existe pas

    res.json({ paymentUrl: result.paymentUrl, transactionId });

  } catch (err) {
    console.error('Erreur CinetPay init:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/public/cinetpay/webhook ────────────────────────────────────────
// Reçoit la notification de CinetPay après un paiement
router.post('/cinetpay/webhook', async (req, res) => {
  try {
    const { cpm_trans_id, cpm_site_id, cpm_amount, cpm_currency, cpm_payment_date, cpm_payment_time, cpm_error_message, cpm_result, signature } = req.body;

    console.log('🔔 Webhook CinetPay reçu :', JSON.stringify(req.body));

    // Vérifier que le paiement est accepté
    if (cpm_result !== '00') {
      console.log(`❌ Paiement refusé: ${cpm_error_message}`);
      return res.json({ success: false, message: 'Paiement refusé.' });
    }

    // Extraire le company_id depuis le transaction_id (format SG-{cid}-{timestamp})
    const parts = (cpm_trans_id || '').split('-');
    const companyId = parts[1] ? parseInt(parts[1]) : null;

    if (!companyId) {
      return res.json({ success: false, message: 'Transaction ID invalide.' });
    }

    // Retrouver la facture web la plus récente en attente pour cette boutique
    const invRes = await pool.query(
      `SELECT id, invoice_number FROM invoices
       WHERE company_id = $1 AND status IN ('pending','pending_payment')
       ORDER BY id DESC LIMIT 1`,
      [companyId]
    );

    if (invRes.rows.length > 0) {
      const inv = invRes.rows[0];
      await pool.query(
        `UPDATE invoices SET status='paid', payment_method='CinetPay', paid_at=datetime('now') WHERE id=$1`,
        [inv.id]
      );
      console.log(`✅ Facture ${inv.invoice_number} marquée comme PAYÉE via CinetPay !`);

      // Déclencher les commandes CJDropshipping automatiquement
      triggerDropshippingOrders(inv.id, inv.invoice_number, companyId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur webhook CinetPay:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/public/visit ───────────────────────────────────────────────
// Enregistre une visite unique par IP par 24h (Analytics Master Control)
router.post('/visit', async (req, res) => {
  try {
    const { url, referrer, device, browser, os, resolution, timezone } = req.body;
    let ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';

    // ── Déduplication : 1 entrée par IP par 24h ──────────────────────────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const existing = await pool.query(
      `SELECT id FROM visitor_logs WHERE ip_address = $1 AND visited_at > $2`,
      [ip, oneDayAgo]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, deduplicated: true });
    }

    // ── Géolocalisation via ip-api.com ────────────────────────────────────
    let location = 'Localisation inconnue';
    let city = '', country = '', isp = '';
    if (ip !== '127.0.0.1') {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country,regionName,isp`);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            city    = geo.city    || '';
            country = geo.country || '';
            isp     = geo.isp     || '';
            location = [city, geo.regionName, country].filter(Boolean).join(', ');
          }
        }
      } catch(e) { console.log('[GeoIP] Erreur:', e.message); }
    } else {
      location = 'Localhost (développement)';
    }

    await pool.query(
      `INSERT INTO visitor_logs (ip_address, location, device_type, browser, os, page_visited, referrer)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ip, location, device || 'Desktop', browser || 'Unknown', os || 'Unknown', url || '/', referrer || 'Direct']
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur API Analytics Visit:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/public/track/:invoiceNumber ────────────────────────────────────
router.get('/track/:invoiceNumber', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { rows } = await pool.query(
      `SELECT i.invoice_number, i.client_name, i.status, i.payment_method,
              i.total_amount, i.created_at, i.paid_at,
              c.name as company_name, c.currency
       FROM invoices i
       JOIN companies c ON i.company_id = c.id
       WHERE i.invoice_number = $1`,
      [invoiceNumber.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Commande introuvable. Vérifiez le numéro.' });

    const inv = rows[0];
    const itemsRes = await pool.query(
      `SELECT product_name, quantity, unit_price
       FROM invoice_items
       WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = $1)`,
      [invoiceNumber.toUpperCase()]
    );

    const statusLabels = {
      pending:         { label: 'En attente de traitement',            color: '#f59e0b', icon: '⏳' },
      pending_payment: { label: 'En attente de validation du paiement', color: '#f97316', icon: '💳' },
      paid:            { label: 'Payé — En cours de préparation',       color: '#6366f1', icon: '✅' },
      confirmed:       { label: 'Confirmé — En préparation',            color: '#6366f1', icon: '📦' },
      shipped:         { label: 'Expédié — En route',                   color: '#0ea5e9', icon: '🚚' },
      delivered:       { label: 'Livré',                                color: '#10b981', icon: '🎉' },
      cancelled:       { label: 'Annulé',                               color: '#ef4444', icon: '❌' },
    };
    const statusInfo = statusLabels[inv.status] || { label: inv.status, color: '#94a3b8', icon: '📋' };

    res.json({
      invoice_number: inv.invoice_number,
      client_name:    inv.client_name,
      status:         inv.status,
      status_label:   statusInfo.label,
      status_color:   statusInfo.color,
      status_icon:    statusInfo.icon,
      payment_method: inv.payment_method,
      total_amount:   inv.total_amount,
      currency:       inv.currency || 'XOF',
      company_name:   inv.company_name,
      created_at:     inv.created_at,
      paid_at:        inv.paid_at,
      items:          itemsRes.rows,
    });
  } catch (err) {
    console.error('Erreur tracking:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
