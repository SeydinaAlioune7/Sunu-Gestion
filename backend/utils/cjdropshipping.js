// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CJDropshipping API Client                                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

async function cjFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['CJ-Access-Token'] = token;

  const res = await fetch(`${CJ_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (data.code !== 200 || data.result === false) {
    throw new Error(data.message || `Erreur CJDropshipping (${path})`);
  }
  return data.data;
}

// Obtenir un access token avec email + mot de passe CJ
async function getAccessToken(email, password) {
  return cjFetch('/authentication/getAccessToken', {
    method: 'POST',
    body: { email, password }
  });
  // Retourne : { accessToken, refreshToken, accessTokenExpiryDate, refreshTokenExpiryDate }
}

// Renouveler le token via refresh token
async function refreshAccessToken(refreshToken) {
  return cjFetch('/authentication/refreshAccessToken', {
    method: 'POST',
    body: { refreshToken }
  });
}

// Rechercher des produits dans le catalogue CJ
async function searchProducts(token, { keyword = '', pageNum = 1, pageSize = 20, categoryId = '' } = {}) {
  const params = new URLSearchParams({ pageNum, pageSize });
  if (keyword) params.append('productName', keyword);
  if (categoryId) params.append('categoryId', categoryId);
  return cjFetch(`/product/list?${params}`, { token });
  // Retourne : { list: [...], total, pageNum, pageSize }
}

// Détail complet d'un produit (variantes, images, prix)
async function getProductDetail(token, pid) {
  return cjFetch(`/product/query?pid=${pid}`, { token });
}

// Créer une commande chez CJDropshipping
async function createOrder(token, orderData) {
  return cjFetch('/shopping/order/createOrder', {
    method: 'POST',
    token,
    body: orderData
  });
  // Retourne : { orderId, orderNumber, ... }
}

// Suivre le statut d'une commande
async function getOrderDetail(token, orderId) {
  return cjFetch(`/shopping/order/getOrderDetail?orderId=${orderId}`, { token });
}

module.exports = { getAccessToken, refreshAccessToken, searchProducts, getProductDetail, createOrder, getOrderDetail };
