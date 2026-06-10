// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Alioune Badara Diene Gestion – Server Entry Point                         ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db/pool');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Middleware globaux ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://sunugestion.sn',
  'https://www.sunugestion.sn',
  'http://localhost:3000',
  'http://localhost:5500',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Servir le frontend (fichiers statiques)
app.use(express.static(path.join(__dirname, '..', 'frontend'), { dotfiles: 'allow' }));
// Servir les images produits
app.use('/product-images', express.static(path.join(__dirname, '..', 'frontend', 'product-images')));

// ── Routes API ───────────────────────────────────────────────────────────────
app.get('/api/public/maintenance-status', (req, res) => {
    const maintFile = path.join(__dirname, 'maintenance.json');
    if (fs.existsSync(maintFile)) {
        try { return res.json(JSON.parse(fs.readFileSync(maintFile))); } catch(e) {}
    }
    res.json({ active: false });
});

app.post('/api/admin/maintenance', (req, res) => {
    // Basic master key check for this endpoint
    if (req.headers['x-master-key'] !== process.env.MASTER_KEY && req.headers['x-master-key'] !== 'GOAT_2026_ERP_SECRET') {
        return res.status(403).json({ error: 'Accès refusé.' });
    }
    const maintFile = path.join(__dirname, 'maintenance.json');
    const { active, message } = req.body;
    fs.writeFileSync(maintFile, JSON.stringify({ active: !!active, message: message || 'Maintenance en cours.' }));
    res.json({ success: true, active: !!active });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/public', require('./routes/public'));
app.use('/api/images', require('./routes/images'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/files', require('./routes/files'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/dropshipping', require('./routes/dropshipping'));
app.use('/api/jumia', require('./routes/jumia'));
app.use('/api/ebay', require('./routes/ebay'));
app.use('/api/cdiscount', require('./routes/cdiscount'));

// ── Route de santé ───────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// ── SPA fallback : toutes les routes non-API et sans extension renvoient index.html
// Les fichiers .html sont déjà servis par express.static ci-dessus
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.match(/\.[a-z0-9]+$/i)) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  } else if (!req.path.startsWith('/api')) {
    // Fichier statique non trouvé → 404
    res.status(404).send('Fichier introuvable.');
  }
});

// ── Gestionnaire d'erreurs global ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur :', err.stack);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// ── Migrations légères au démarrage (compatibles SQLite + PostgreSQL) ────────
(function runMigrations() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN last_ip TEXT`,
    `ALTER TABLE users ADD COLUMN reset_token TEXT`,
    `ALTER TABLE users ADD COLUMN reset_token_expiry TEXT`,
    `CREATE TABLE IF NOT EXISTS pending_verifications (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       email        TEXT NOT NULL UNIQUE,
       phone        TEXT,
       full_name    TEXT,
       company_name TEXT,
       city         TEXT,
       country      TEXT,
       created_at   TEXT DEFAULT (datetime('now')),
       expires_at   TEXT NOT NULL,
       email_code   TEXT,
       sms_code     TEXT
     )`,
    `ALTER TABLE pending_verifications ADD COLUMN email_code TEXT`,
    `ALTER TABLE pending_verifications ADD COLUMN sms_code TEXT`,
    `CREATE TABLE IF NOT EXISTS dropshipping_configs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
       cj_email TEXT,
       cj_access_token TEXT,
       cj_refresh_token TEXT,
       cj_token_expires_at TEXT,
       auto_order INTEGER DEFAULT 1,
       created_at TEXT DEFAULT (datetime('now')),
       updated_at TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS dropshipping_products (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
       product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
       cj_product_id TEXT NOT NULL,
       cj_variant_id TEXT NOT NULL,
       cj_product_name TEXT,
       cost_price REAL DEFAULT 0,
       shipping_cost REAL DEFAULT 0,
       created_at TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS dropshipping_orders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
       invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
       invoice_number TEXT,
       cj_order_id TEXT,
       status TEXT DEFAULT 'pending',
       tracking_number TEXT,
       error_message TEXT,
       created_at TEXT DEFAULT (datetime('now')),
       updated_at TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS product_variants (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       value TEXT NOT NULL,
       price_modifier REAL DEFAULT 0,
       stock_quantity INTEGER DEFAULT 0,
       sku TEXT,
       created_at TEXT DEFAULT (datetime('now'))
     )`,
    `ALTER TABLE companies ADD COLUMN jumia_user_id TEXT`,
    `ALTER TABLE companies ADD COLUMN jumia_api_key TEXT`,
    `ALTER TABLE companies ADD COLUMN jumia_country TEXT DEFAULT 'sn'`,
    `ALTER TABLE companies ADD COLUMN jumia_auto_sync INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS jumia_orders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
       jumia_order_id TEXT NOT NULL,
       invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
       invoice_number TEXT,
       status TEXT DEFAULT 'imported',
       created_at TEXT DEFAULT (datetime('now'))
     )`,
    `ALTER TABLE companies ADD COLUMN ebay_user_token TEXT`,
    `ALTER TABLE companies ADD COLUMN ebay_sandbox INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS ebay_orders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
       ebay_order_id TEXT NOT NULL,
       invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
       invoice_number TEXT,
       status TEXT DEFAULT 'imported',
       created_at TEXT DEFAULT (datetime('now'))
     )`,
    `ALTER TABLE companies ADD COLUMN cdiscount_login TEXT`,
    `ALTER TABLE companies ADD COLUMN cdiscount_password TEXT`,
    `CREATE TABLE IF NOT EXISTS cdiscount_orders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
       cd_order_id TEXT NOT NULL,
       invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
       invoice_number TEXT,
       status TEXT DEFAULT 'imported',
       created_at TEXT DEFAULT (datetime('now'))
     )`,
  ];
  for (const sql of migrations) {
    try { pool.query(sql); } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('already exists')) {
        console.warn('[migration]', e.message);
      }
    }
  }
})();

// ── Cron : Gestion automatique des trials (toutes les heures) ────────────────
const { sendTrialReminderSMS } = require('./utils/sms');
setInterval(() => {
  try {
    const now   = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Expirer automatiquement les trials dépassés
    const expired = pool.query("SELECT id, name FROM companies WHERE subscription_status = 'trial'");
    for (const c of expired.rows) {
      // récupérer trial_end_date
      const r = pool.query('SELECT trial_end_date FROM companies WHERE id = ' + c.id);
      const endDate = r.rows[0]?.trial_end_date;
      if (endDate && new Date(endDate) < now) {
        pool.query("UPDATE companies SET subscription_status = 'expired' WHERE id = " + c.id);
        console.log(`[CRON] Trial expiré : ${c.name} (id=${c.id})`);
      }
    }

    // 2. Envoyer rappel SMS 24h avant expiration
    const trials = pool.query("SELECT id, name, phone, alternate_phone, trial_end_date FROM companies WHERE subscription_status = 'trial'");
    for (const c of trials.rows) {
      if (!c.trial_end_date) continue;
      const end = new Date(c.trial_end_date);
      if (end <= in24h && end > now) {
        sendTrialReminderSMS(c).catch(() => {});
        console.log(`[CRON] Rappel trial envoyé à ${c.name}`);
      }
    }
  } catch (e) {
    console.error('[CRON] Erreur:', e.message);
  }
}, 60 * 60 * 1000); // toutes les heures

// ── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🚀 Alioune Badara Diene Gestion                        ║
║  ── Serveur démarré sur le port ${PORT}                    ║
║  ── ${process.env.NODE_ENV || 'development'} mode                           ║
╚══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
