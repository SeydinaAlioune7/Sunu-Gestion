// ── eBay API Client ──────────────────────────────────────────────────────────
// eBay REST APIs : Fulfillment (commandes) + Inventory (produits)
// Auth : OAuth 2.0 Client Credentials + User Token

const https = require('https');

const EBAY_HOSTS = {
  prod:    'api.ebay.com',
  sandbox: 'api.sandbox.ebay.com',
};

// ── Requête HTTPS générique ──────────────────────────────────────────────────
function ebayFetch(host, path, method = 'GET', token, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: host,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...extraHeaders,
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) reject(new Error(`eBay ${res.statusCode}: ${json.errors?.[0]?.message || raw.slice(0, 200)}`));
          else resolve(json);
        } catch (e) { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Obtenir un token OAuth App (client_credentials) ──────────────────────────
// Utilisé pour les appels non liés à un vendeur spécifique
async function getAppToken(clientId, clientSecret, sandbox = false) {
  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body  = 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path:     '/identity/v1/oauth2/token',
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
        catch(e) { reject(new Error('eBay token parse error: ' + raw)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Récupérer les commandes en attente ───────────────────────────────────────
async function getOrders(config) {
  const { user_token, sandbox = false } = config;
  const host = EBAY_HOSTS[sandbox ? 'sandbox' : 'prod'];
  const data = await ebayFetch(
    host,
    '/sell/fulfillment/v1/order?filter=orderfulfillmentstatus%3A%7BNOT_STARTED%7C%7CIN_PROGRESS%7D&limit=50',
    'GET', user_token
  );
  return data.orders || [];
}

// ── Marquer une commande comme expédiée ─────────────────────────────────────
async function markShipped(config, orderId, trackingNumber, carrier) {
  const { user_token, sandbox = false } = config;
  const host = EBAY_HOSTS[sandbox ? 'sandbox' : 'prod'];
  return ebayFetch(
    host,
    `/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`,
    'POST', user_token,
    {
      lineItems: [],
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: carrier || 'CHRONOPOST',
      trackingNumber: trackingNumber || 'N/A',
    }
  );
}

// ── Créer/mettre à jour un produit sur eBay (Inventory API) ─────────────────
async function createListing(config, product) {
  const { user_token, sandbox = false } = config;
  const host = EBAY_HOSTS[sandbox ? 'sandbox' : 'prod'];
  const sku   = product.sku || `SG-${product.id}`;

  // 1. Créer l'inventaire
  await ebayFetch(host, `/sell/inventory/v1/inventory_item/${sku}`, 'PUT', user_token, {
    availability: { shipToLocationAvailability: { quantity: product.stock_quantity || 99 } },
    condition: 'NEW',
    product: {
      title:       product.name,
      description: product.description || product.name,
      imageUrls:   product.image_url ? [product.image_url] : [],
      aspects:     {},
    },
  });

  return { sku, message: 'Produit créé dans l\'inventaire eBay' };
}

// ── Tester la connexion ──────────────────────────────────────────────────────
async function testConnection(config) {
  try {
    const { user_token, sandbox = false } = config;
    const host = EBAY_HOSTS[sandbox ? 'sandbox' : 'prod'];
    await ebayFetch(host, '/sell/fulfillment/v1/order?limit=1', 'GET', user_token);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { getOrders, markShipped, createListing, testConnection, getAppToken };
