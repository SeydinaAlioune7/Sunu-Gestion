const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const config = {
  host: '187.124.113.21',
  port: 22,
  username: 'root',
  password: 'Sabiatd2010Sabiatd@',
  readyTimeout: 30000
};

ssh.connect(config).then(async () => {
  await ssh.execCommand(`cat << 'EOF' > /var/www/alioune-gestion/backend/update_ams.js
const pool = require('./db/pool');
(async () => {
  try {
    const res = await pool.query("SELECT id, name FROM companies WHERE name ILIKE '%ams%'");
    console.log('Companies found:', res.rows);
    if(res.rows.length > 0) {
      const d = new Date(); d.setDate(d.getDate() + 7);
      const update = await pool.query("UPDATE companies SET subscription_status = 'trial', trial_end_date = '" + d.toISOString() + "' WHERE name ILIKE '%ams%' RETURNING id, name, subscription_status, trial_end_date");
      console.log('Updated:', update.rows);
    }
  } catch(e) { console.error(e); } finally { process.exit(0); }
})();
EOF`);
  const res = await ssh.execCommand('node update_ams.js', { cwd: '/var/www/alioune-gestion/backend' });
  console.log(res.stdout);
  if(res.stderr) console.error('ERR:', res.stderr);
  ssh.dispose();
}).catch(console.error);
