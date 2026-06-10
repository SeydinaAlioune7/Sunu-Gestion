const pool = require('./backend/db/pool');

async function migrate() {
  try {
    console.log('Starting migration for alioune-gestion...');
    
    // Add registration_status to users
    try {
      await pool.query("ALTER TABLE users ADD COLUMN registration_status TEXT DEFAULT 'pending'");
      console.log('Added registration_status to users');
    } catch (e) {
      console.log('registration_status already exists or error:', e.message);
    }

    // Update existing users to active
    await pool.query("UPDATE users SET registration_status = 'active'");
    console.log('Updated existing users to active');

    // Add payment_info to companies
    try {
      await pool.query("ALTER TABLE companies ADD COLUMN payment_info TEXT");
      console.log('Added payment_info to companies');
    } catch (e) {
      console.log('payment_info already exists or error:', e.message);
    }

    // Add wave_number to companies
    try {
      await pool.query("ALTER TABLE companies ADD COLUMN wave_number TEXT");
      console.log('Added wave_number to companies');
    } catch (e) {
      console.log('wave_number already exists or error:', e.message);
    }

    // Add om_number to companies
    try {
      await pool.query("ALTER TABLE companies ADD COLUMN om_number TEXT");
      console.log('Added om_number to companies');
    } catch (e) {
      console.log('om_number already exists or error:', e.message);
    }

    // Add bank_iban to companies
    try {
      await pool.query("ALTER TABLE companies ADD COLUMN bank_iban TEXT");
      console.log('Added bank_iban to companies');
    } catch (e) {
      console.log('bank_iban already exists or error:', e.message);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
