const Database = require('better-sqlite3');
const db = new Database('./db/app.db');

// 1. last_ip sur users
try { db.exec('ALTER TABLE users ADD COLUMN last_ip TEXT'); console.log('+ last_ip ajouté'); }
catch(e) { console.log('  last_ip déjà présent:', e.message); }

// 2. reset_token sur users
try { db.exec('ALTER TABLE users ADD COLUMN reset_token TEXT'); console.log('+ reset_token ajouté'); }
catch(e) { console.log('  reset_token:', e.message); }
try { db.exec('ALTER TABLE users ADD COLUMN reset_token_expiry TEXT'); console.log('+ reset_token_expiry ajouté'); }
catch(e) { console.log('  reset_token_expiry:', e.message); }

// 3. Table pending_verifications
db.exec(`CREATE TABLE IF NOT EXISTS pending_verifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL UNIQUE,
  phone        TEXT,
  full_name    TEXT,
  company_name TEXT,
  city         TEXT,
  country      TEXT,
  created_at   TEXT    DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL
)`);
console.log('+ pending_verifications OK');

// 4. Résumé
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const ucols = db.prepare('PRAGMA table_info(users)').all();
console.log('\nTables:', tables.map(t => t.name).join(', '));
console.log('Users cols:', ucols.map(c => c.name).join(', '));

// 5. Stats
['companies','users','visitor_logs','pending_verifications'].forEach(t => {
  const n = db.prepare('SELECT COUNT(*) as n FROM ' + t).get().n;
  console.log(t + ': ' + n + ' lignes');
});

db.close();
console.log('\n✅ Migrations terminées');
