const bcrypt = require('bcrypt');
const pool = require('./db/pool');

async function run() {
    try {
        const hash = await bcrypt.hash('Sabiatd2026@*', 12);
        const email = 'aliounebadaraibnabutalibdiene@gmail.com';
        
        await pool.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE email = $2',
            [hash, email]
        );
        
        console.log('--- SUCCESS: PASSWORD UPDATED IN DB ---');
        process.exit(0);
    } catch (err) {
        console.error('--- ERROR ---', err);
        process.exit(1);
    }
}

run();
