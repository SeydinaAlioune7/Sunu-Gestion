const Database = require('better-sqlite3');
const db = new Database('./db/app.db');

// Activer les comptes propriétaires pour 10 ans
const futureDate = new Date();
futureDate.setFullYear(futureDate.getFullYear() + 10);
const dateStr = futureDate.toISOString();

db.prepare("UPDATE companies SET subscription_status='active', trial_end_date=? WHERE id=1").run(dateStr);
db.prepare("UPDATE companies SET subscription_status='active', trial_end_date=? WHERE id=3").run(dateStr);

console.log('✅ Comptes propriétaires activés pour 10 ans :');
console.log(db.prepare('SELECT id, name, subscription_status, trial_end_date FROM companies WHERE id IN (1,3)').all());
