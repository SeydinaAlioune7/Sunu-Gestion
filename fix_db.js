const pool = require('./backend/db/pool');
pool.query("UPDATE companies SET trial_end_date = '2099-12-31' WHERE id = 1", [], (err) => {
    if(err) console.error(err);
    console.log('✅ Base de données mise à jour : 30+ ans (Max) appliqués.');
    process.exit(0);
});
