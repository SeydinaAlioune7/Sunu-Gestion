// ── Jumia Seller Center API Client ─────────────────────────────────────────
// Compatible avec Jumia Sénégal (sellercenter.jumia.sn) et autres pays
// Auth: HMAC-SHA256 signature sur chaque requête

const https = require('https');
const http  = require('http');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');

const JUMIA_HOSTS = {
  sn: 'sellercenter.jumia.sn',
  ng: 'sellercenter.jumia.com.ng',
  ci: 'sellercenter.jumia.ci',
  ke: 'sellercenter.jumia.co.ke',
  ma: 'sellercenter.jumia.ma',
  gh: 'sellercenter.jumia.com.gh',
};

// Génère la signature HMAC-SHA256 requise par Jumia Seller Center
function buildSignature(apiKey, params) {
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', apiKey).update(sorted).digest('hex');
}

// Exécute une requête vers l'API Jumia Seller Center
async function jumiaRequest(config, action, extraParams = {}, method = 'GET', body = null) {
  const { user_id, api_key, country = 'sn' } = config;
  const host = JUMIA_HOSTS[country] || JUMIA_HOSTS.sn;

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const params = {
    Action:    action,
    Format:    'JSON',
    Timestamp: timestamp,
    UserID:    user_id,
    Version:   '1.0',
    ...extraParams,
  };

  params.Signature = buildSignature(api_key, params);

  const qs = new URLSearchParams(params).toString();
  const path = `/api/v1/?${qs}`;

  return new Promise((resolve, reject) => {
    const options = { hostname: host, path, method, headers: { 'Content-Type': 'application/json' } };
    const protocol = host.includes('localhost') ? http : https;
    const req = protocol.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ErrorResponse) {
            reject(new Error(`Jumia API Error: ${json.ErrorResponse.Head.ErrorMessage}`));
          } else {
            resolve(json.SuccessResponse || json);
          }
        } catch (e) {
          reject(new Error(`Jumia API parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Récupérer les commandes en attente ────────────────────────────────────
async function getOrders(config, status = 'pending') {
  const data = await jumiaRequest(config, 'GetOrders', { Status: status, Limit: 100 });
  const orders = data?.Body?.Orders?.Order || [];
  return Array.isArray(orders) ? orders : [orders];
}

// ── Récupérer les détails d'une commande (items) ──────────────────────────
async function getOrderItems(config, orderId) {
  const data = await jumiaRequest(config, 'GetOrderItems', { OrderId: orderId });
  const items = data?.Body?.OrderItems?.OrderItem || [];
  return Array.isArray(items) ? items : [items];
}

// ── Mettre à jour le statut d'une commande ────────────────────────────────
async function setOrderStatus(config, orderItemIds, status, trackingNumber = '') {
  const params = {
    OrderItemIds: JSON.stringify(orderItemIds),
    Status:       status,
  };
  if (trackingNumber) params.TrackingNumber = trackingNumber;
  return jumiaRequest(config, 'SetStatusToPackedByMarketplace', params, 'POST');
}

// ── Créer / mettre à jour des produits sur Jumia ─────────────────────────
async function createProducts(config, products) {
  // products: [{ name, description, price, brand, category, images: [url], sku }]
  const xmlProducts = products.map(p => `
    <Product>
      <SellerSku>${escXml(p.sku || String(p.id))}</SellerSku>
      <Name>${escXml(p.name)}</Name>
      <Description>${escXml(p.description || p.name)}</Description>
      <Brand>${escXml(p.brand || 'Générique')}</Brand>
      <Price>${p.price}</Price>
      <SalePrice>${p.price}</SalePrice>
      <TaxClass>default</TaxClass>
      <PrimaryCategory>${escXml(p.category || 'Others')}</PrimaryCategory>
      <Quantity>${p.stock_quantity || 99}</Quantity>
      ${p.image_url ? `<Images><Image>${escXml(p.image_url)}</Image></Images>` : ''}
    </Product>`).join('');

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><Request><Products>${xmlProducts}</Products></Request>`;
  return jumiaRequest(config, 'ProductCreate', {}, 'POST', xmlBody);
}

// ── Mettre à jour le stock d'un produit ──────────────────────────────────
async function updateStock(config, sku, quantity) {
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
    <Request><Products><Product>
      <SellerSku>${escXml(sku)}</SellerSku>
      <Quantity>${quantity}</Quantity>
    </Product></Products></Request>`;
  return jumiaRequest(config, 'ProductUpdate', {}, 'POST', xmlBody);
}

// ── Vérifier si les credentials sont valides ──────────────────────────────
async function testConnection(config) {
  try {
    await jumiaRequest(config, 'GetSeller', {});
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function escXml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { getOrders, getOrderItems, setOrderStatus, createProducts, updateStock, testConnection };
