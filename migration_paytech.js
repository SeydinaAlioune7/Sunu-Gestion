const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'backend', 'db', 'app.db');
const db = new Database(dbPath);

console.log('🏁 Running database migrations for PayTech...');
try {
  db.prepare("ALTER TABLE companies ADD COLUMN paytech_api_key TEXT").run();
  console.log('✅ Column paytech_api_key added to companies table.');
} catch (e) {
  if (e.message.includes('duplicate column name')) {
    console.log('ℹ️ Column paytech_api_key already exists.');
  } else {
    console.error('❌ Error adding paytech_api_key:', e.message);
  }
}

try {
  db.prepare("ALTER TABLE companies ADD COLUMN paytech_api_secret TEXT").run();
  console.log('✅ Column paytech_api_secret added to companies table.');
} catch (e) {
  if (e.message.includes('duplicate column name')) {
    console.log('ℹ️ Column paytech_api_secret already exists.');
  } else {
    console.error('❌ Error adding paytech_api_secret:', e.message);
  }
}
db.close();
console.log('🎉 Migration completed.');
