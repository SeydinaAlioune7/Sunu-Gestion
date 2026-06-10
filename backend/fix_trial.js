const pool = require('./db/pool');

async function run() {
    try {
        const email = 'aliounebadaraibnabutalibdiene@gmail.com';
        const future = new Date();
        future.setDate(future.getDate() + 14);
        
        await pool.query(
            "UPDATE companies SET subscription_status = 'trial', trial_end_date = $1 WHERE id IN (SELECT company_id FROM users WHERE email = $2)",
            [future.toISOString(), email]
        );
        
        console.log('--- SUCCESS: TRIAL RESET TO 14 DAYS ---');
        process.exit(0);
    } catch (err) {
        console.error('--- ERROR ---', err);
        process.exit(1);
    }
}

run();
