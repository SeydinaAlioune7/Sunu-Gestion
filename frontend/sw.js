/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  SERVICE WORKER — Sunu Gestion PWA Offline & Performance Optimizer            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const CACHE_NAME = 'sunu-gestion-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/assets/css/premium.css',
  '/assets/css/print.css',
  '/assets/js/api.js',
  '/assets/js/calculator.js',
  '/manifest.json'
];

// Installation du Service Worker et mise en cache des ressources d'initialisation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Mise en cache des ressources initiales');
      // On utilise Promise.allSettled pour s'assurer que même si une ressource optionnelle échoue,
      // le service worker s'installe correctement sans planter
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[Service Worker] Échec de mise en cache pour ${url}:`, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper pour imposer une limite de temps sur une requête réseau
function fetchWithTimeout(request, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Network timeout'));
    }, timeout);

    fetch(request).then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

// Interception des requêtes réseaux avec stratégies adaptées
self.addEventListener('fetch', (event) => {
  // Ignorer les appels API vers le backend (toujours en temps réel)
  if (event.request.url.includes('/api/')) {
    return;
  }

  const url = new URL(event.request.url);

  // STRATÉGIE 1 : Cache First pour les assets statiques et CDNs (CSS, JS, Fonts, Images)
  const isStaticAsset = 
    url.pathname.includes('/assets/') || 
    url.pathname.includes('/product-images/') ||
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'image' ||
    event.request.destination === 'font' ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net');

  if (isStaticAsset && event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Servir depuis le cache et mettre à jour en arrière-plan (Stale-While-Revalidate)
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200 || networkResponse.status === 0) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // Sinon faire un fetch classique et mettre en cache
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200 || networkResponse.status === 0) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }).catch(() => new Response('Asset indisponible hors-ligne', { status: 503 }));
      })
    );
    return;
  }

  // STRATÉGIE 2 : Network First avec Timeout court (1.5s) pour la navigation et les pages HTML
  event.respondWith(
    fetchWithTimeout(event.request, 1500)
      .then((networkResponse) => {
        if ((networkResponse.status === 200 || networkResponse.status === 0) && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // En cas de déconnexion ou de timeout, servir depuis le cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si c'est une requête de navigation HTML générale, renvoyer la page de login ou d'accueil
          const acceptHeader = event.request.headers.get('accept') || '';
          if (event.request.mode === 'navigate' || acceptHeader.includes('text/html')) {
            return caches.match('/login.html') || caches.match('/index.html') || caches.match('/');
          }
          return new Response('Connexion perdue', { status: 503 });
        });
      })
  );
});

// ── CAPABILITÉS DE SYNCHRONISATION ET PUSH ────────────────────────────────────

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    console.log('[Service Worker] Background Sync activé');
  }
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-cache') {
    console.log('[Service Worker] Periodic Sync activé');
  }
});

// Push Notifications
self.addEventListener('push', (event) => {
  const title = 'Sunu Gestion';
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification de votre boutique !',
    icon: 'https://img.icons8.com/color/192/000000/sales-performance.png',
    badge: 'https://img.icons8.com/color/96/000000/sales-performance.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
