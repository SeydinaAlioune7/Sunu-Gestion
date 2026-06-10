-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Alioune Badara Diene Gestion – Schéma PostgreSQL                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Entreprises (tenant / locataire)
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    subscription_status VARCHAR(50) DEFAULT 'trial',
    trial_end_date TIMESTAMP,
    storage_used_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Produits
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    alert_threshold INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Mouvements de stock (historique)
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment')),
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Factures
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_address TEXT,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    pdf_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Lignes de facture
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Fichiers cryptés
CREATE TABLE IF NOT EXISTS encrypted_files (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    encrypted_key TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Abonnements Stripe
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'enterprise',
    status VARCHAR(50),
    current_period_end TIMESTAMP
);

-- Journal d'activité (audit logs)
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index de performance
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_files_company ON encrypted_files(company_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_activity_logs_company ON activity_logs(company_id);
