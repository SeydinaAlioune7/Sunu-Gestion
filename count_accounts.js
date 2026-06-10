const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);
try {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM companies').get();
  console.log('Nombre de comptes :', row.cnt);
} catch (e) {
  console.error('Erreur lors de la requête:', e.message);
}
process.exit();
