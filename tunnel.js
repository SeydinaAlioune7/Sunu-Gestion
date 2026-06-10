// Tunnel permanent pour Pro Gestion
const localtunnel = require('localtunnel');
const http        = require('http');

const PORT      = process.argv[2] || 3001;
const SUBDOMAIN = process.argv[3] || 'pro-gestion-erp';

let tunnel = null;

function printUrl(url) {
  console.log('\n' + '═'.repeat(58));
  console.log('  ✅ TUNNEL ACTIF — PRO GESTION');
  console.log('  🌐 URL   : ' + url);
  console.log('  🔑 Login : ' + url + '/login.html');
  console.log('═'.repeat(58));
  console.log('\n  ⚠️  1ère visite ? Entrez votre IP sur la page tunnel.');
  console.log('  👉 Votre IP : https://loca.lt/mytunnelpassword\n');
}

async function startTunnel() {
  try {
    console.log('🔄 Connexion au tunnel...');
    tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
    printUrl(tunnel.url);

    const ping = setInterval(() => {
      http.get('http://localhost:' + PORT + '/api/health', () => {}).on('error', () => {});
    }, 20000);

    tunnel.on('error', err => {
      console.error('⚠️  Erreur tunnel :', err.message);
    });

    tunnel.on('close', () => {
      clearInterval(ping);
      console.log('🔴 Tunnel fermé. Reconnexion dans 3s...');
      setTimeout(startTunnel, 3000);
    });

  } catch (err) {
    console.error('❌ Tunnel échoué :', err.message, '— Nouvelle tentative dans 5s...');
    setTimeout(startTunnel, 5000);
  }
}

process.on('uncaughtException', err => {
  console.error('⚠️  Exception non gérée dans le script du tunnel :', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Rejet non géré dans le script du tunnel :', reason);
});

http.get('http://localhost:' + PORT + '/api/health', res => {
    console.log('✅ Serveur local détecté sur le port ' + PORT);
    startTunnel();
}).on('error', () => {
  console.error('❌ Serveur non démarré sur le port ' + PORT);
  process.exit(1);
});
