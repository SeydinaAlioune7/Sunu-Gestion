const { NodeSSH } = require('node-ssh');
const path = require('path');
const ssh = new NodeSSH();

const config = {
  host: '187.124.113.21',
  port: 22,
  username: 'root',
  password: 'Sabiatd2010Sabiatd@',
  readyTimeout: 30000
};

async function main() {
  try {
    console.log('🔄 Connexion au VPS Hostinger (187.124.113.21)...');
    await ssh.connect(config);
    console.log('✅ SSH Connecté !');

    // 1. Déploiement du Frontend
    console.log('📂 Upload du Frontend en cours...');
    await ssh.putDirectory(
      path.join(__dirname, 'frontend'),
      '/var/www/alioune-gestion/frontend',
      {
        recursive: true,
        concurrency: 10,
        validate: (localPath) => {
          const relative = path.relative(path.join(__dirname, 'frontend'), localPath);
          const parts = relative.split(path.sep);
          // Ignorer node_modules et uploads
          if (parts.includes('node_modules') || parts.includes('uploads')) {
            return false;
          }
          return true;
        }
      }
    );
    console.log('✅ Frontend uploadé avec succès.');

    // 2. Déploiement du Backend
    console.log('📂 Upload du Backend en cours...');
    await ssh.putDirectory(
      path.join(__dirname, 'backend'),
      '/var/www/alioune-gestion/backend',
      {
        recursive: true,
        concurrency: 10,
        validate: (localPath) => {
          const relative = path.relative(path.join(__dirname, 'backend'), localPath);
          const parts = relative.split(path.sep);
          // Ignorer node_modules, uploads, db (base de données de production !), .env, logs
          if (
            parts.includes('node_modules') ||
            parts.includes('uploads') ||
            parts.includes('db') ||
            parts.includes('.env') ||
            parts.includes('logs') ||
            parts.some(p => p.endsWith('.db') || p.endsWith('.sqlite') || p.endsWith('.log'))
          ) {
            return false;
          }
          return true;
        }
      }
    );
    console.log('✅ Backend uploadé avec succès.');

    // 3. Installation des dépendances npm
    console.log('📦 Installation des dépendances npm sur le VPS...');
    const npmInstallRes = await ssh.execCommand('npm install', { cwd: '/var/www/alioune-gestion/backend' });
    console.log('NPM Output:', npmInstallRes.stdout || npmInstallRes.stderr);

    // 4. Exécution de la migration de la base de données (PayTech) sur le VPS
    console.log('🗄️ Exécution de la migration de la base de données (PayTech) sur le VPS...');
    const migrationRes = await ssh.execCommand('node migration_paytech.js', { cwd: '/var/www/alioune-gestion/backend' });
    console.log('Migration Output:', migrationRes.stdout || migrationRes.stderr);

    // 4.5 Exécution du fix de la base de données de production pour la licence illimitée
    console.log('🗄️ Application de la licence permanente (2099-12-31) sur la base de données du VPS...');
    const dbUpdateRes = await ssh.execCommand(
      `node -e "const Database = require('better-sqlite3'); const db = new Database('/var/www/alioune-gestion/backend/db/app.db'); const res = db.prepare(\\"UPDATE companies SET trial_end_date = '2099-12-31' WHERE id = 1\\").run(); console.log('Changements appliqués:', res.changes);"`,
      { cwd: '/var/www/alioune-gestion/backend' }
    );
    console.log('DB Update Output:', dbUpdateRes.stdout || dbUpdateRes.stderr);

    // 5. Redémarrage du serveur Node.js via PM2
    console.log('🚀 Redémarrage de l\'application Node.js via PM2...');
    const pm2Res = await ssh.execCommand('pm2 restart all || pm2 restart abd-gestion-backend', { cwd: '/var/www/alioune-gestion/backend' });
    console.log('PM2 Output:', pm2Res.stdout || pm2Res.stderr);

    console.log('🎉 DEPLOYMENT SUCCESSFUL! All modifications are online.');
  } catch (err) {
    console.error('❌ Erreur de déploiement:', err);
  } finally {
    ssh.dispose();
  }
}

main();
