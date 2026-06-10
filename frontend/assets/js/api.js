// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  API Client – Gestion des appels fetch vers le backend                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const API_BASE = '/api';

// --- Global Maintenance Check ---
if (!window.location.pathname.includes('maintenance.html') && 
    !window.location.pathname.includes('super-admin.html') && 
    !window.location.pathname.includes('login.html')) {
    
    fetch('/api/public/maintenance-status')
        .then(r => r.json())
        .then(data => {
            if (data.active) {
                // Si on a un utilisateur connecté, on vérifie si c'est le propriétaire
                const rawUser = localStorage.getItem('user');
                if (rawUser) {
                    try {
                        const user = JSON.parse(rawUser);
                        const ownerEmails = ['alioune@diene.sn', 'aliounebadaraibnabutalibdiene@gmail.com'];
                        if (ownerEmails.includes(user.email)) return; // Propriétaire = Bypass !
                    } catch(e) {}
                }
                // Rediriger tout le reste
                window.location.href = '/maintenance.html';
            }
        }).catch(e => console.log('Check maintenance failed.'));
}
// --------------------------------

/**
 * Récupère le token d'accès depuis le localStorage.
 */
function getToken() {
  return localStorage.getItem('accessToken');
}

/**
 * Sauvegarde les tokens et infos utilisateur.
 */
function saveAuth(data) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
}

/**
 * Déconnecte l'utilisateur.
 */
function logout() {
  localStorage.clear();
  const dest = window.location.pathname.includes('super-admin') ? '/login.html?redirect=super-admin' : '/login.html';
  window.location.href = dest;
}

/**
 * Récupère les infos utilisateur sauvegardées.
 */
function getUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

/**
 * Vérifie si l'utilisateur est connecté, sinon redirige.
 */
function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

/**
 * Appel API générique avec gestion du token et du refresh.
 */
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  // Si le token est expiré, tenter un refresh
  if (response.status === 401) {
    const data = await response.json();
    if (data.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${getToken()}`;
        response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      } else {
        logout();
        return null;
      }
    } else {
      logout();
      return null;
    }
  }

  // Essai expiré ou abonnement expiré
  if (response.status === 403) {
    const data = await response.json();
    if (data.code === 'TRIAL_EXPIRED' || data.code === 'SUBSCRIPTION_EXPIRED' || data.code === 'PENDING_PAYMENT') {
      window.location.href = '/billing.html?expired=true';
      return null;
    }
    if (data.code === 'PENDING_APPROVAL') {
      window.location.href = '/billing.html?pending_approval=true';
      return null;
    }
    if (data.code === 'SUSPECT_TRIAL_EXPIRED') {
      window.location.href = '/billing.html?suspect=true';
      return null;
    }
  }

  return response;
}

/**
 * Rafraîchit le token d'accès.
 */
async function refreshToken() {
  try {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formatte un nombre en FCFA.
 */
function formatCFA(amount) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' F CFA';
}

/**
 * Formatte un nombre d'octets en taille lisible.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Formatte une date ISO en format FR lisible.
 */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Affiche une notification temporaire (Toast).
 */
function showToast(message, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl font-bold text-sm shadow-2xl transition-all duration-300 opacity-0 translate-y-4 pointer-events-none';
        document.body.appendChild(toast);
    }
    
    const colors = {
        success: 'bg-emerald-600 text-white shadow-emerald-500/20',
        error: 'bg-red-600 text-white shadow-red-500/20',
        info: 'bg-indigo-600 text-white shadow-indigo-500/20'
    };
    
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl font-bold text-sm shadow-2xl transition-all duration-300 ${colors[type] || colors.success}`;
    toast.textContent = message;
    
    // Show
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    }, 10);
    
    // Hide
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    }, 3000);
}
