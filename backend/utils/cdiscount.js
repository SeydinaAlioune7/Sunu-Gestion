// ── Cdiscount Marketplace API Client ────────────────────────────────────────
// API REST Cdiscount Marketplace (France)
// Docs : dev.cdiscount.com
// Auth : Basic Auth (login + password) → token

const https = require('https');

const CDISCOUNT_HOST = 'api.cdiscount.com';

function cdFetch(path, method = 'GET', token, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: CDISCOUNT_HOST,
      path:     '/api' + path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) reject(new Error(`Cdiscount ${res.statusCode}: ${JSON.stringify(json).slice(0, 200)}`));
          else resolve(json);
        } catch(e) { resolve({}); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Obtenir un token d'accès ─────────────────────────────────────────────────
async function getToken(login, password) {
  const creds = Buffer.from(`${login}:${password}`).toString('base64');
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const options = {
      hostname: CDISCOUNT_HOST,
      path:     '/token',
      method:   'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Cdiscount token error: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Récupérer les commandes en attente de traitement ────────────────────────
async function getOrders(config) {
  const { token } = config;
  const data = await cdFetch('/orders?States=WaitingForSellerAcceptance,AcceptedBySeller&PageSize=50', 'GET', token);
  return data.Orders || data.orders || [];
}

// ── Accepter une commande ────────────────────────────────────────────────────
async function acceptOrder(config, orderId) {
  const { token } = config;
  return cdFetch(`/orders/${orderId}/accept`, 'POST', token);
}

// ── Confirmer l'expédition ───────────────────────────────────────────────────
async function confirmShipment(config, orderId, trackingNumber, carrier) {
  const { token } = config;
  return cdFetch(`/orders/${orderId}/confirm`, 'POST', token, {
    TrackingNumber: trackingNumber || 'N/A',
    TrackingUrl:    '',
    CarrierName:    carrier || 'Chronopost',
  });
}

// ── Créer un produit sur Cdiscount ──────────────────────────────────────────
async function createProduct(config, product) {
  const { token } = config;
  return cdFetch('/products', 'POST', token, {
    Products: [{
      SellerProductId: product.sku || `SG-${product.id}`,
      Name:            product.name,
      Description:     product.description || product.name,
      BrandName:       'Générique',
      SellingPrice:    product.price,
      Stock:           product.stock_quantity || 99,
      CategoryCode:    '0' + (product.category || 'UNKNOWN'),
      PictureUri1:     product.image_url || '',
    }],
  });
}

// ── Tester la connexion ──────────────────────────────────────────────────────
async function testConnection(login, password) {
  try {
    const tokenData = await getToken(login, password);
    if (!tokenData.access_token) return { success: false, error: 'Identifiants incorrects.' };
    return { success: true, token: tokenData.access_token, expires_in: tokenData.expires_in };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { getToken, getOrders, acceptOrder, confirmShipment, createProduct, testConnection };
