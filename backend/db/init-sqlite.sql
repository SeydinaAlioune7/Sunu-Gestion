-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Alioune Badara Diene Gestion – Schéma SQLite                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo_url TEXT,
    currency TEXT DEFAULT 'XOF',
    start_date TEXT,
    website TEXT,
    phone TEXT,
    alternate_phone TEXT,
    country TEXT,
    city TEXT,
    zip_code TEXT,
    landmark TEXT,
    timezone TEXT DEFAULT 'Africa/Abidjan',
    tax_rate REAL DEFAULT 0,
    fiscal_year_start TEXT,
    subscription_status TEXT DEFAULT 'trial',
    trial_end_date TEXT,
    storage_used_bytes INTEGER DEFAULT 0,
    payment_info TEXT,
    payment_proof TEXT,
    email TEXT,
    wave_number TEXT,
    om_number TEXT,
    bank_iban TEXT,
    custom_domain TEXT,
    cinetpay_api_key TEXT,
    cinetpay_site_id TEXT,
    paytech_api_key TEXT,
    paytech_api_secret TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    registration_status TEXT DEFAULT 'active',
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    barcode_type TEXT DEFAULT 'C128',
    unit TEXT,
    brand TEXT,
    category TEXT,
    sub_category TEXT,
    manage_stock INTEGER DEFAULT 1,
    alert_threshold INTEGER DEFAULT 5,
    description TEXT,
    image_url TEXT,
    brochure_url TEXT,
    has_imei INTEGER DEFAULT 0,
    not_for_sale INTEGER DEFAULT 0,
    weight REAL,
    prep_time INTEGER,
    tax_rate REAL DEFAULT 0,
    tax_type TEXT DEFAULT 'exclusive',
    product_type TEXT DEFAULT 'single',
    purchase_price_exc_tax REAL DEFAULT 0,
    margin_percent REAL DEFAULT 25,
    selling_price_exc_tax REAL NOT NULL,
    price REAL NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment')),
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL,
    client_address TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    payment_method TEXT,
    payment_proof TEXT,
    pdf_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total REAL
);

-- Trigger pour calculer le total des lignes de facture
CREATE TRIGGER IF NOT EXISTS calc_invoice_item_total
AFTER INSERT ON invoice_items
BEGIN
    UPDATE invoice_items SET total = NEW.quantity * NEW.unit_price WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS encrypted_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT DEFAULT 'enterprise',
    status TEXT,
    current_period_end TEXT
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    is_private INTEGER DEFAULT 0,
    visited_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT DEFAULT 'Autre',
    expense_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Migration: ajouter client_phone aux factures (ignoré si existe déjà)
CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS visitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    location TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    page_visited TEXT,
    referrer TEXT,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
