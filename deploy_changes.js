const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');
const fs = require('fs');

const config = { host: '187.124.113.21', port: 22, username: 'root', password: 'Sabiatd2010Sabiatd@', readyTimeout: 30000 };

const REMOTE_BASE = '/var/www/alioune-gestion';
const LOCAL_BASE = path.join(__dirname);

const files = [
  { local: 'backend/server.js',               remote: `${REMOTE_BASE}/backend/server.js` },
  { local: 'backend/routes/auth.js',           remote: `${REMOTE_BASE}/backend/routes/auth.js` },
  { local: 'backend/routes/admin.js',          remote: `${REMOTE_BASE}/backend/routes/admin.js` },
  { local: 'backend/middleware/trialCheck.js', remote: `${REMOTE_BASE}/backend/middleware/trialCheck.js` },
  { local: 'backend/utils/mailer.js',          remote: `${REMOTE_BASE}/backend/utils/mailer.js` },
  { local: 'frontend/register.html',           remote: `${REMOTE_BASE}/frontend/register.html` },
  { local: 'frontend/super-admin.html',        remote: `${REMOTE_BASE}/frontend/super-admin.html` },
  { local: 'frontend/assets/js/api.js',        remote: `${REMOTE_BASE}/frontend/assets/js/api.js` },
  { local: 'frontend/billing.html',            remote: `${REMOTE_BASE}/frontend/billing.html` },
];

async function main() {
  try {
    console.log('Connexion SSH...');
    await ssh.connect(config);
    console.log('Connecté !\n');

    for (const f of files) {
      const localPath = path.join(LOCAL_BASE, f.local);
      if (!fs.existsSync(localPath)) { console.log(`⚠  Introuvable: ${localPath}`); continue; }
      await ssh.putFile(localPath, f.remote);
      console.log(`✅ ${f.local}`);
    }

    console.log('\nRedémarrage PM2...');
    const restart = await ssh.execCommand('pm2 restart abd-gestion-backend');
    console.log(restart.stdout || restart.stderr);
    console.log('\n🚀 Déploiement terminé avec succès !');
  } catch (err) {
    console.error('Erreur :', err.message);
  } finally {
    ssh.dispose();
  }
}
main();
