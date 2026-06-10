const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'db/app.db'));

const user = db.prepare("SELECT id, email, company_id FROM users WHERE email='aliounebadaraibnabutalibdiene@gmail.com'").get();
console.log('User:', user);

const products = db.prepare("SELECT id, name, not_for_sale, company_id FROM products").all();
console.log('Products:', products);
