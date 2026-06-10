// ════════════════════════════════════════════════════
//  ABD STORE — shop.js v2.0 (Premium)
// ════════════════════════════════════════════════════
const API_URL    = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.protocol === 'file:' || window.location.origin === 'null'
  ? 'http://localhost:3001/api/public'
  : window.location.origin + '/api/public';

// --- Maintenance Check ---
fetch(API_URL + '/maintenance-status')
    .then(r => r.json())
    .then(data => { if (data.active) window.location.href = '/maintenance.html'; })
    .catch(() => {});
// -------------------------
const urlParams  = new URLSearchParams(window.location.search);
let COMPANY_ID = 1; // ID par défaut (ABD Store), résolu dynamiquement si absent
const EMOJI_MAP  = {
  'Alimentaire':'🛒','Électronique':'📱','Vêtement':'👕','Boisson':'🥤',
  'Cosmétique':'💄','Informatique':'💻','Téléphone':'📱','Meuble':'🪑',
  'Sport':'⚽','Livre':'📚','Bijou':'💎','Autre':'📦','Général':'📦',
  'default':'📦'
};

let cart       = JSON.parse(localStorage.getItem('abd_cart') || '[]');
let allProducts = [];
let currentCat  = '';

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();

  // Résolution du Company ID via le domaine
  const cidParam = urlParams.get('company_id');
  if (cidParam) {
    COMPANY_ID = parseInt(cidParam);
  } else {
    try {
      const dres = await fetch(`${API_URL}/company-by-domain?domain=${window.location.host}`);
      if (dres.ok) {
        const ddata = await dres.json();
        COMPANY_ID = ddata.id;
      }
    } catch(e) {
      console.log('Domain resolution failed, using default company_id = 2');
    }
  }

  loadCompany();
  loadCategories();
  loadProducts();
  renderCartDrawer();
  logVisit();

  // Gestion du retour de paiement réussi PayTech
  const successInvoice = urlParams.get('success_invoice');
  if (successInvoice) {
    document.getElementById('invoiceNum').textContent = successInvoice;
    const successMsg = document.getElementById('successMsg');
    if (successMsg) successMsg.innerHTML = `<span style="color:#10b981; font-weight:bold;">Votre paiement a été validé avec succès !<br>Merci pour votre confiance.</span>`;
    document.getElementById('successOverlay').classList.add('open');
    
    // Nettoyer le panier local
    localStorage.removeItem('abd_cart');
    cart = [];
    renderCartDrawer();
    updateCartBadge();
  }

  // Navbar scroll effect
  function initNavbar() {
    const nav = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    });
  }

  // Cart drawer
  document.getElementById('cartBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.getElementById('continueShopping')?.addEventListener('click', closeDrawer);

  // Checkout
  document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
  document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
  document.getElementById('checkoutOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('checkoutOverlay')) closeCheckout();
  });
  document.getElementById('orderForm').addEventListener('submit', handleOrder);
  document.getElementById('successClose').addEventListener('click', () => {
    document.getElementById('successOverlay').classList.remove('open');
    closeDrawer();
  });

  // Search
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => filterProducts(e.target.value, currentCat), 350);
  });

  // Payment method toggle
  document.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updatePaymentFields(e.target.value);
    });
  });
});

function updatePaymentFields(value) {
  const instructions = document.getElementById('paymentInstructions');
  const wave     = document.getElementById('waveDetails');
  const om       = document.getElementById('omDetails');
  const card     = document.getElementById('cardDetails');
  const cash     = document.getElementById('cashDetails');
  const fakeCard = document.getElementById('fakeCardNum');

  if (wave)     wave.style.display = 'none';
  if (om)       om.style.display   = 'none';
  if (card)     card.style.display = 'none';
  if (cash)     cash.style.display = 'none';
  if (fakeCard) fakeCard.required  = false;
  if (instructions) instructions.style.display = 'block';

  if (value === 'cash') {
    if (cash) cash.style.display = 'block';
  } else if (value === 'card') {
    if (card) card.style.display = 'block';
    if (fakeCard) fakeCard.required = true;
  } else if (value === 'wave') {
    if (wave) wave.style.display = 'block';
    updateWaveUI();
  } else if (value === 'orange_money') {
    if (om) om.style.display = 'block';
    updateOmUI();
  }
}

// Met à jour le montant et le deep link Wave selon le total du panier
function updateWaveUI() {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const numEl = document.getElementById('waveNumberDisplay');
  const amtEl = document.getElementById('waveAmount');
  const link  = document.getElementById('waveDeepLink');
  if (amtEl) amtEl.textContent = total.toLocaleString('fr-FR') + ' F CFA';
  if (numEl) numEl.textContent = window._waveNumber || '—';
  if (link && window._waveNumber) {
    const num = window._waveNumber.replace(/[^0-9]/g, '');
    link.href = `wave://pay?to=${num}&amount=${total}&currency=XOF`;
  }
}

function copyWaveNum() {
  const num = window._waveNumber || '';
  if (!num) return;
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.getElementById('copyWaveBtn');
    if (btn) { btn.textContent = '✅ Copié !'; setTimeout(() => btn.textContent = '📋 Copier', 1500); }
  });
}

function updateOmUI() {
  const total  = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const numEl  = document.getElementById('omNumberDisplay');
  const amtEl  = document.getElementById('omAmount');
  const ussdEl = document.getElementById('omUssd');
  const codeEl = document.getElementById('omUssdCode');
  if (amtEl) amtEl.textContent = total.toLocaleString('fr-FR') + ' F CFA';
  if (numEl) numEl.textContent = window._omNumber || '—';
  if (ussdEl && codeEl) {
    if (window._omNumber) {
      const num = window._omNumber.replace(/[^0-9]/g, '');
      codeEl.textContent = `*144*2*${num}*${total}#`;
      ussdEl.style.display = 'block';
    } else {
      ussdEl.style.display = 'none';
    }
  }
}

function copyOmNum() {
  const num = window._omNumber || '';
  if (!num) return;
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.getElementById('copyOmBtn');
    if (btn) { btn.textContent = '✅ Copié !'; setTimeout(() => btn.textContent = '📋 Copier', 1500); }
  });
}

function openWave(e) {
  const link = document.getElementById('waveDeepLink');
  if (!link || link.href === '#' || link.href.endsWith('#')) {
    alert('Numéro Wave non configuré par ce vendeur.');
    return false;
  }
  // Sur mobile, tente d'ouvrir l'app Wave
  window.location.href = link.href;
  // Fallback après 1.5s si l'app ne s'ouvre pas
  setTimeout(() => {
    const num = window._waveNumber || '';
    if (num) alert(`Ouvrez Wave manuellement et envoyez au ${num}`);
  }, 1500);
  return false;
}

let companyPhone = '+221 7X XXX XX XX';

// ── COMPANY INFO ──────────────────────────────────────
async function loadCompany() {
  try {
    const res  = await fetch(`${API_URL}/company?company_id=${COMPANY_ID}`);
    const c    = await res.json();
    if (!res.ok) return;
    if (c.name)  document.title = `${c.name} — Boutique`;
    
    if (c.phone) {
      companyPhone = c.phone;
      document.getElementById('companyPhone').textContent = c.phone;
      const payPhone = document.getElementById('payPhone');
      if(payPhone) payPhone.textContent = c.phone;
      const waFloatBtn = document.getElementById('waFloatBtn');
      if(waFloatBtn) waFloatBtn.href = 'https://wa.me/' + c.phone.replace(/[^0-9]/g, '');
    }
    if (c.email) document.getElementById('companyEmail').textContent = c.email;
    if (c.city || c.country) {
      const addressStr = [c.city, c.country].filter(Boolean).join(', ');
      document.getElementById('companyAddress').textContent = addressStr;
    }
    if (c.name) {
      document.getElementById('companyFooter').textContent = `© 2026 ${c.name}. Tous droits réservés.`;
      
      const words = c.name.split(' ');
      const firstWord = words[0];
      const rest = words.slice(1).join(' ');
      
      const navLogo = document.getElementById('storeNameNav');
      if (navLogo) navLogo.innerHTML = rest ? `${firstWord}<strong>${rest}</strong>` : `<strong>${firstWord}</strong>`;
      
      const footerLogo = document.getElementById('storeNameFooter');
      if (footerLogo) footerLogo.innerHTML = rest ? `${firstWord}<strong>${rest}</strong>` : `<strong>${firstWord}</strong>`;
      
      const contactLogo = document.getElementById('storeNameContact');
      if (contactLogo) contactLogo.innerHTML = rest ? `${firstWord}<br/>${rest}` : firstWord;
    }
    // Stocker les numéros de paiement globalement
    window._waveNumber = c.wave_number || '';
    window._omNumber   = c.om_number   || '';
    updateWaveUI();
    updateOmUI();
  } catch(e) { /* silencieux */ }
}

// ── CATEGORIES ─────────────────────────────────────────
async function loadCategories() {
  try {
    const res  = await fetch(`${API_URL}/categories?company_id=${COMPANY_ID}`);
    if (!res.ok) return;
    const cats = await res.json();
    const bar  = document.getElementById('categoriesBar');
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-pill';
      btn.dataset.cat = cat.name;
      btn.textContent = cat.name;
      btn.style.setProperty('--cat-color', cat.color || '#6366f1');
      btn.addEventListener('click', () => selectCategory(cat.name, btn));
      bar.appendChild(btn);
    });
    bar.querySelectorAll('.cat-pill').forEach(p =>
      p.addEventListener('click', () => selectCategory(p.dataset.cat, p))
    );
  } catch(e) { /* silencieux */ }
}

function selectCategory(cat, el) {
  currentCat = cat;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  filterProducts(document.getElementById('searchInput').value, cat);
}

// ── PRODUCTS ──────────────────────────────────────────
async function loadProducts() {
  try {
    const res  = await fetch(`${API_URL}/products?company_id=${COMPANY_ID}`);
    if (!res.ok) throw new Error();
    allProducts = await res.json();
    const statEl = document.getElementById('statProducts');
    if (statEl) statEl.textContent = allProducts.length;
    renderProducts(allProducts);
  } catch(err) {
    console.error(err);
    document.getElementById('productGrid').innerHTML =
      '<p style="text-align:center;color:var(--danger);padding:40px">Impossible de charger les produits. Assurez-vous que le serveur est démarré.</p>';
  }
}

function filterProducts(search = '', cat = '') {
  let filtered = allProducts;
  if (cat)    filtered = filtered.filter(p => p.category === cat);
  if (search) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );
  renderProducts(filtered);
}

function renderProducts(products) {
  const grid  = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');

  if (!products.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = products.map(p => productCard(p)).join('');
}

function productCard(p) {
  const emoji    = EMOJI_MAP[p.category] || EMOJI_MAP.default;
  const inCart   = cart.find(c => c.product_id === p.id);
  const outStock = p.stock_quantity <= 0;
  const lowStock = !outStock && p.stock_quantity <= 5;
  const stockTxt = outStock ? 'Rupture de stock' : lowStock ? `Plus que ${p.stock_quantity}` : `En stock (${p.stock_quantity})`;
  const stockCls = outStock ? 'out' : lowStock ? 'low' : '';
  const catColor = p.category_color || '#111827';
  const BASE_URL = API_URL.replace('/api/public', '');
  const imgTag   = p.image_url
    ? `<img src="${p.image_url.startsWith('http') ? p.image_url : BASE_URL+p.image_url}" alt="${p.name}" loading="lazy" />`
    : `<div class="product-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;

  return `
    <div class="product-card" id="card-${p.id}">
      <div class="product-img-wrap">
        ${imgTag}
        ${p.category ? `<div class="product-category-badge" style="background:${catColor}22;color:${catColor};border:1px solid ${catColor}44">${p.category}</div>` : ''}
        ${outStock ? '<div class="out-of-stock-badge">Rupture</div>' : ''}
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        ${p.description ? `<div class="product-desc">${p.description}</div>` : ''}
        <div class="product-stock ${stockCls}">${stockTxt}</div>
      </div>
      <div class="product-footer">
        <div>
          <div class="product-price" style="display:flex; flex-direction:column; line-height:1.2;">
            <span>${Number(p.price).toLocaleString('fr-FR')} <span style="font-size:0.7em">F CFA</span></span>
            <span style="font-size:0.6em; color:var(--text-muted); font-weight: 500;">~ ${(p.price / 655.957).toFixed(2)} €</span>
          </div>
        </div>
        ${p.variants && p.variants.length > 0
          ? `<button class="add-btn" id="add-${p.id}" onclick="openVariantModal(${p.id})" ${outStock ? 'disabled' : ''} title="Choisir les options" style="font-size:11px;padding:0 8px;white-space:nowrap;">Choisir</button>`
          : `<button class="add-btn" id="add-${p.id}" onclick="addToCart(${p.id},'${p.name.replace(/'/g,"\\'")}',${p.price})" ${outStock ? 'disabled' : ''} title="Ajouter au panier">${inCart ? '✓' : '+'}</button>`
        }
      </div>
    </div>`;
}

// ── CART ──────────────────────────────────────────────
function addToCart(id, name, price) {
  const key = String(id);
  const existing = cart.find(c => (c.cart_key || String(c.product_id)) === key);
  if (existing) { existing.quantity += 1; }
  else          { cart.push({ cart_key: key, product_id: id, name, price, quantity: 1, variant_ids: [] }); }
  saveCart();
  renderCartDrawer();
  updateCartBadge();
  openDrawer();
  showToast(`Ajouté: ${name}`, 'success');
  const btn = document.getElementById(`add-${id}`);
  if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '+'; }, 1500); }
}

function removeFromCart(key) {
  cart = cart.filter(c => (c.cart_key || String(c.product_id)) !== String(key));
  saveCart(); renderCartDrawer(); updateCartBadge();
}

function changeQty(key, delta) {
  const item = cart.find(c => (c.cart_key || String(c.product_id)) === String(key));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) removeFromCart(key);
  else { saveCart(); renderCartDrawer(); updateCartBadge(); }
}

function saveCart() { localStorage.setItem('abd_cart', JSON.stringify(cart)); }

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.quantity, 0);
  document.getElementById('cartBadge').textContent = total;
  document.getElementById('cartBadge').style.transform = 'scale(1.3)';
  setTimeout(() => document.getElementById('cartBadge').style.transform = '', 200);
}

function renderCartDrawer() {
  const body   = document.getElementById('cartItems');
  const footer = document.getElementById('drawerFooter');
  updateCartBadge();
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg><p>Votre panier est vide</p><br><a href="#products" class="btn btn-outline btn-sm" id="continueShopping">Retour au catalogue</a></div>`;
    document.getElementById('continueShopping')?.addEventListener('click', closeDrawer);
    footer.style.display = 'none';
    return;
  }
  body.innerHTML = cart.map(item => {
    const key = item.cart_key || String(item.product_id);
    return `
    <div class="cart-item">
      <div class="ci-emoji" style="display:none"></div>
      <div class="ci-info">
        <div class="ci-name">${item.name}</div>
        <div class="ci-price">${(item.price * item.quantity).toLocaleString('fr-FR')} F <span style="font-size:0.8em;color:#94a3b8;font-weight:normal">(~${((item.price * item.quantity) / 655.957).toFixed(2)} €)</span></div>
      </div>
      <div class="ci-controls">
        <button class="ci-btn" data-key="${key}" onclick="changeQty(this.dataset.key,-1)">−</button>
        <span class="ci-qty">${item.quantity}</span>
        <button class="ci-btn" data-key="${key}" onclick="changeQty(this.dataset.key,1)">+</button>
        <button class="ci-remove" data-key="${key}" onclick="removeFromCart(this.dataset.key)">×</button>
      </div>
    </div>`;
  }).join('');

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const euroTotal = (total / 655.957).toFixed(2);
  document.getElementById('cartSubtotal').innerHTML = total.toLocaleString('fr-FR') + ' F <br><span style="font-size:10px;color:#94a3b8">~' + euroTotal + ' €</span>';
  document.getElementById('cartTotal').innerHTML    = total.toLocaleString('fr-FR') + ' F <br><span style="font-size:10px;color:#94a3b8">~' + euroTotal + ' €</span>';
  footer.style.display = 'block';
}

// ── DRAWER ────────────────────────────────────────────
function openDrawer() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── CHECKOUT ──────────────────────────────────────────
function openCheckout() {
  const summary = document.getElementById('orderSummary');
  const total   = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  summary.innerHTML = `
    <div class="os-title">Récapitulatif</div>
    ${cart.map(c => `<div class="os-item"><span>${c.name} × ${c.quantity}</span><strong style="text-align:right">${(c.price * c.quantity).toLocaleString('fr-FR')} F<br><span style="font-size:10px;color:#94a3b8;font-weight:normal">~${((c.price * c.quantity) / 655.957).toFixed(2)} €</span></strong></div>`).join('')}
    <div class="os-total"><span>Total</span><span style="text-align:right">${total.toLocaleString('fr-FR')} F CFA<br><span style="font-size:12px;color:#94a3b8;font-weight:normal">~${(total / 655.957).toFixed(2)} €</span></span></div>`;
  closeDrawer();
  document.getElementById('checkoutOverlay').classList.add('open');
  
  // Initialiser l'affichage de la méthode de paiement sélectionnée par défaut
  const checkedPayment = document.querySelector('input[name="payment"]:checked')?.value || 'wave';
  updatePaymentFields(checkedPayment);
}
function closeCheckout() {
  document.getElementById('checkoutOverlay').classList.remove('open');
}

async function handleOrder(e) {
  e.preventDefault();
  const btn  = document.getElementById('submitOrder');
  const text = document.getElementById('submitText');
  btn.disabled = true;

  const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'cash';
  let paymentProofFile = null;
  let transactionId = '';
  if (paymentMethod === 'card') {
    text.textContent = 'Authentification bancaire 3D Secure...';
    const cardNum = document.getElementById('fakeCardNum')?.value || '';
    const last4 = cardNum.replace(/\s/g, '').slice(-4) || 'XXXX';
    transactionId = `STRIPE_****${last4}`;
    await new Promise(r => setTimeout(r, 2000)); // Simuler appel Stripe
  } else if (paymentMethod === 'wave') {
    text.textContent = 'Enregistrement de la commande...';
    paymentProofFile = document.getElementById('waveProof')?.files[0] || null;
  } else if (paymentMethod === 'orange_money') {
    text.textContent = 'Enregistrement de la commande...';
    paymentProofFile = document.getElementById('omProof')?.files[0] || null;
  } else {
    text.textContent = 'Enregistrement de la commande...';
    transactionId = 'CASH_ON_DELIVERY';
  }

  const formData = new FormData();
  formData.append('company_id', COMPANY_ID);
  formData.append('client_name', document.getElementById('clientName').value);
  formData.append('client_phone', document.getElementById('clientPhone').value);
  formData.append('client_email', document.getElementById('clientEmail').value);
  formData.append('client_address', document.getElementById('clientAddress').value);
  formData.append('payment_method', paymentMethod);
  formData.append('transaction_id', transactionId);
  formData.append('items', JSON.stringify(cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, variant_ids: c.variant_ids || [] }))));
  
  if (paymentProofFile) {
    formData.append('payment_proof', paymentProofFile);
  }

  try {
    const res    = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      body: formData // Pas de Content-Type, le navigateur gère le multipart boundary
    });
    const result = await res.json();
    if (res.ok) {
      if (result.redirect_url) {
        showToast('✅ Redirection vers la page de paiement...', 'success');
        setTimeout(() => { window.location.href = result.redirect_url; }, 800);
        return;
      }
      closeCheckout();
      cart = []; saveCart(); renderCartDrawer(); updateCartBadge();
      document.getElementById('invoiceNum').textContent  = result.invoice_number;
      const trackLink = document.getElementById('trackingLink');
      if (trackLink) trackLink.href = `/tracking.html?order=${encodeURIComponent(result.invoice_number)}`;
      const successMsg = document.getElementById('successMsg');
      if (paymentMethod === 'wave' || paymentMethod === 'orange_money') {
        successMsg.innerHTML = `Total : ${Number(result.total).toLocaleString('fr-FR')} F CFA<br><br><span style="color:#f59e0b; font-weight:bold;">Votre paiement est en attente de validation par le vendeur.<br>Merci pour votre patience.</span>`;
      } else {
        successMsg.textContent = `Total : ${Number(result.total).toLocaleString('fr-FR')} F CFA`;
      }
      document.getElementById('successOverlay').classList.add('open');
      document.getElementById('orderForm').reset();
      document.getElementById('waveProofText').innerText = "Sélectionner une capture d'écran (Max 5Mo)";
      const omProofText = document.getElementById('omProofText');
      if (omProofText) omProofText.innerText = "Sélectionner une capture d'écran (Max 5Mo)";
      loadProducts(); // Rafraîchir les stocks
    } else {
      showToast('❌ ' + (result.error || 'Erreur lors de la commande'), 'error');
    }
  } catch {
    showToast('❌ Connexion au serveur impossible.', 'error');
  } finally {
    btn.disabled = false;
    text.textContent = '✅ Confirmer la commande';
  }
}

// ── TOAST ─────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── VARIANTES ─────────────────────────────────────────
let _varProduct  = null;
let _varSelected = {}; // { "Taille": variantObj, "Couleur": variantObj }

function openVariantModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  if (!p.variants || p.variants.length === 0) { addToCart(p.id, p.name, p.price); return; }

  _varProduct  = p;
  _varSelected = {};
  document.getElementById('varModalName').textContent  = p.name;
  document.getElementById('varModalPrice').textContent = Number(p.price).toLocaleString('fr-FR') + ' F CFA';
  document.getElementById('variantStock').textContent  = '';

  // Grouper les variantes par nom (ex: "Taille", "Couleur")
  const groups = {};
  p.variants.forEach(v => { if (!groups[v.name]) groups[v.name] = []; groups[v.name].push(v); });

  const container = document.getElementById('variantGroups');
  container.innerHTML = Object.entries(groups).map(([groupName, variants]) => `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px;">${groupName}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${variants.map(v => `<button type="button" class="var-pill"
            data-group="${groupName}" data-vid="${v.id}"
            onclick="selectVariant('${groupName}',${v.id})"
            ${v.stock_quantity <= 0 ? 'disabled' : ''}
            style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); color:${v.stock_quantity <= 0 ? '#475569' : '#e2e8f0'}; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:700; cursor:${v.stock_quantity <= 0 ? 'not-allowed' : 'pointer'}; transition:all .2s;${v.stock_quantity <= 0 ? 'text-decoration:line-through;' : ''}">
            ${v.value}${v.price_modifier > 0 ? ` +${Number(v.price_modifier).toLocaleString('fr-FR')}` : v.price_modifier < 0 ? ` ${Number(v.price_modifier).toLocaleString('fr-FR')}` : ''}
          </button>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('variantModal').style.display = 'flex';
}

function selectVariant(groupName, variantId) {
  if (!_varProduct) return;
  const v = _varProduct.variants.find(x => x.id === variantId);
  if (!v) return;
  _varSelected[groupName] = v;

  // Surligner la sélection
  document.querySelectorAll(`.var-pill[data-group="${groupName}"]`).forEach(btn => {
    const selected = parseInt(btn.dataset.vid) === variantId;
    btn.style.background    = selected ? 'var(--primary)'                    : 'rgba(255,255,255,0.05)';
    btn.style.borderColor   = selected ? 'var(--primary)'                    : 'rgba(255,255,255,0.15)';
    btn.style.color         = selected ? '#fff'                              : '#e2e8f0';
  });

  // Mettre à jour le prix affiché
  const totalMod   = Object.values(_varSelected).reduce((s, x) => s + (parseFloat(x.price_modifier) || 0), 0);
  const finalPrice = _varProduct.price + totalMod;
  document.getElementById('varModalPrice').textContent = Number(finalPrice).toLocaleString('fr-FR') + ' F CFA';

  // Stock de la variante sélectionnée
  const minStock = Math.min(...Object.values(_varSelected).map(x => x.stock_quantity));
  const stockEl  = document.getElementById('variantStock');
  if (stockEl) {
    if (minStock <= 0)       stockEl.innerHTML = '<span style="color:#ef4444">Rupture pour cette option</span>';
    else if (minStock <= 5) stockEl.innerHTML = `<span style="color:#f59e0b">Plus que ${minStock} en stock</span>`;
    else                    stockEl.textContent = `En stock (${minStock})`;
  }
}

function addVariantToCart() {
  if (!_varProduct) return;
  const groups = {};
  _varProduct.variants.forEach(v => { if (!groups[v.name]) groups[v.name] = []; });

  const missing = Object.keys(groups).find(g => !_varSelected[g]);
  if (missing) { showToast(`Choisissez : ${missing}`, 'error'); return; }

  const variantLabel = Object.entries(_varSelected).map(([k, v]) => `${k}: ${v.value}`).join(' | ');
  const totalMod     = Object.values(_varSelected).reduce((s, x) => s + (parseFloat(x.price_modifier) || 0), 0);
  const finalPrice   = _varProduct.price + totalMod;
  const variantIds   = Object.values(_varSelected).map(x => x.id).sort();
  const key          = `${_varProduct.id}-${variantIds.join('-')}`;

  const existing = cart.find(c => c.cart_key === key);
  if (existing) { existing.quantity += 1; }
  else {
    cart.push({
      cart_key:    key,
      product_id:  _varProduct.id,
      name:        `${_varProduct.name} (${variantLabel})`,
      price:       finalPrice,
      quantity:    1,
      variant_ids: variantIds,
    });
  }

  saveCart(); renderCartDrawer(); updateCartBadge();
  closeVariantModal();
  openDrawer();
  showToast(`Ajouté: ${_varProduct.name}`, 'success');
}

function closeVariantModal() {
  document.getElementById('variantModal').style.display = 'none';
  _varProduct = null; _varSelected = {};
}

// Init badge on load
updateCartBadge();

async function logVisit() {
  try {
    let isPrivate = false;
    
    // Détection du mode privé par quota de stockage
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota && estimate.quota < 120 * 1024 * 1024) {
        isPrivate = true;
      }
    }
    
    // Détection additionnelle si localStorage/sessionStorage est bloqué
    try {
      localStorage.setItem('__incognito_test__', '1');
      localStorage.removeItem('__incognito_test__');
    } catch (e) {
      isPrivate = true;
    }

    const referrer = document.referrer || 'Accès Direct';
    
    await fetch(`${API_URL}/visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: COMPANY_ID,
        referrer: referrer,
        is_private: isPrivate
      })
    });
  } catch (err) {
    console.error('Erreur log visite :', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ⚡ CINETPAY — Paiement en ligne Wave / Orange Money / Carte Bancaire
// ═══════════════════════════════════════════════════════════════════════

// Afficher ou masquer le bloc CinetPay selon la méthode de paiement choisie
function updateCinetpayBlock(paymentMethod) {
  const cinetpayBlock = document.getElementById('cinetpayBlock');
  const orSeparator = document.getElementById('orSeparator');
  const submitOrder = document.getElementById('submitOrder');

  if (!cinetpayBlock) return;

  // Afficher CinetPay pour Wave et Orange Money (les plus populaires en Afrique de l'Ouest)
  const onlineMethods = ['wave', 'orange_money', 'card'];
  if (onlineMethods.includes(paymentMethod)) {
    cinetpayBlock.style.display = 'block';
    orSeparator && (orSeparator.style.display = 'flex');
    // Mettre le submit en mode secondaire visuellement
    if (submitOrder) {
      submitOrder.style.background = 'rgba(255,255,255,0.05)';
      submitOrder.style.border = '1px solid rgba(255,255,255,0.1)';
      submitOrder.style.color = '#94a3b8';
    }
  } else {
    cinetpayBlock.style.display = 'none';
    orSeparator && (orSeparator.style.display = 'none');
    if (submitOrder) {
      submitOrder.style.background = '';
      submitOrder.style.border = '';
      submitOrder.style.color = '';
    }
  }
}

// Intercepter le changement de méthode de paiement pour gérer CinetPay
document.addEventListener('change', (e) => {
  if (e.target.name === 'payment') {
    updateCinetpayBlock(e.target.value);
  }
});

// Bouton CinetPay — Initier le paiement en ligne
document.addEventListener('DOMContentLoaded', () => {
  const cinetpayBtn = document.getElementById('cinetpayBtn');
  if (!cinetpayBtn) return;

  cinetpayBtn.addEventListener('click', async () => {
    // Valider le formulaire d'abord
    const clientName = document.getElementById('clientName')?.value?.trim();
    const clientPhone = document.getElementById('clientPhone')?.value?.trim();
    const clientAddress = document.getElementById('clientAddress')?.value?.trim();

    if (!clientName) { showToast('⚠️ Veuillez renseigner votre nom.', 'error'); return; }
    if (!clientPhone) { showToast('⚠️ Veuillez renseigner votre téléphone.', 'error'); return; }
    if (!clientAddress) { showToast('⚠️ Veuillez renseigner votre adresse de livraison.', 'error'); return; }
    if (!cart.length) { showToast('⚠️ Votre panier est vide.', 'error'); return; }

    const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const items = cart.map(c => ({ product_id: c.product_id, quantity: c.quantity }));

    // Désactiver le bouton et afficher le chargement
    const btnText = document.getElementById('cinetpayBtnText');
    cinetpayBtn.disabled = true;
    btnText.textContent = '⏳ Connexion au service de paiement...';

    try {
      const res = await fetch(`${API_URL}/cinetpay/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: COMPANY_ID,
          amount: total,
          customer_name: clientName,
          customer_email: document.getElementById('clientEmail')?.value || '',
          customer_phone: clientPhone,
          items
        })
      });

      const data = await res.json();

      if (data.mode === 'simulation') {
        // Mode simulation : CinetPay non configuré par le vendeur
        showToast('⚠️ Paiement en ligne non encore activé par ce vendeur. Choisissez un autre mode.', 'error');
        btnText.textContent = '💳 Payer en ligne maintenant';
        cinetpayBtn.disabled = false;
        return;
      }

      if (data.paymentUrl) {
        showToast('✅ Redirection vers la page de paiement...', 'success');
        // Sauvegarder le panier avant la redirection pour le retrouver au retour
        localStorage.setItem('cinetpay_cart', JSON.stringify(cart));
        localStorage.setItem('cinetpay_customer', JSON.stringify({ clientName, clientPhone, clientAddress }));
        // Rediriger vers CinetPay
        setTimeout(() => { window.location.href = data.paymentUrl; }, 800);
        return;
      }

      showToast('❌ ' + (data.error || 'Erreur lors de l\'initiation du paiement.'), 'error');

    } catch (err) {
      showToast('❌ Connexion impossible au service de paiement.', 'error');
    }

    btnText.textContent = '💳 Payer en ligne maintenant';
    cinetpayBtn.disabled = false;
  });
});
