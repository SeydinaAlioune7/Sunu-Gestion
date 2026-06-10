const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const config = { host: '187.124.113.21', port: 22, username: 'root', password: 'Sabiatd2010Sabiatd@', readyTimeout: 30000 };

async function main() {
  try {
    await ssh.connect(config);

    // 1. Dernières erreurs PM2
    const logs = await ssh.execCommand('pm2 logs abd-gestion-backend --lines 40 --nostream --err');
    console.log('=== ERREURS PM2 ===\n', logs.stdout || logs.stderr);

    // 2. Tables et colonnes de la DB
    const schema = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "
const db = require('better-sqlite3')('./db/app.db');
const tables = db.prepare(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").all();
tables.forEach(t => {
  const cols = db.prepare('PRAGMA table_info(' + t.name + ')').all();
  console.log(t.name + ':', cols.map(c => c.name).join(', '));
});
db.close();"`);
    console.log('\n=== STRUCTURE DB ===\n', schema.stdout || schema.stderr);

    // 3. Nombre de lignes par table
    const counts = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "
const db = require('better-sqlite3')('./db/app.db');
['companies','users','visitor_logs','pending_verifications'].forEach(t => {
  try {
    const r = db.prepare('SELECT COUNT(*) as n FROM ' + t).get();
    console.log(t + ': ' + r.n + ' lignes');
  } catch(e) { console.log(t + ': ERREUR - ' + e.message); }
});
db.close();"`);
    console.log('\n=== COMPTAGES ===\n', counts.stdout || counts.stderr);

    // 4. Les 5 dernières companies
    const companies = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "
const db = require('better-sqlite3')('./db/app.db');
try {
  const r = db.prepare('SELECT id, name, subscription_status, trial_end_date, created_at FROM companies ORDER BY created_at DESC LIMIT 5').all();
  r.forEach(c => console.log(JSON.stringify(c)));
} catch(e) { console.log('ERR:', e.message); }
db.close();"`);
    console.log('\n=== COMPANIES ===\n', companies.stdout || companies.stderr);

    // 5. Les 5 derniers users
    const users = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "
const db = require('better-sqlite3')('./db/app.db');
try {
  const r = db.prepare('SELECT id, email, company_id, role, registration_status, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  r.forEach(u => console.log(JSON.stringify(u)));
} catch(e) { console.log('ERR:', e.message); }
db.close();"`);
    console.log('\n=== USERS ===\n', users.stdout || users.stderr);

  } catch (err) { console.error('SSH Error:', err.message); }
  finally { ssh.dispose(); }
}
main();
