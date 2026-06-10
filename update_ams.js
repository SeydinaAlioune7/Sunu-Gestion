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
  const query = `
    const pool = require('./db/pool');
    pool.query("SELECT id, name, subscription_status FROM companies WHERE name ILIKE '%ams%'").then(r => {
      console.log('Found companies:', r.rows);
      if (r.rows.length > 0) {
        const id = r.rows[0].id;
        const d = new Date(); d.setDate(d.getDate() + 7);
        return pool.query("UPDATE companies SET subscription_status = 'trial', trial_end_date = $1 WHERE id = $2 RETURNING *", [d.toISOString(), id]);
      }
    }).then(r => {
      if (r) console.log('Updated:', r.rows);
    }).catch(console.error).finally(()=>process.exit(0));
  `;
  const res = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "${query.replace(/\n/g, ' ')}"`);
  console.log('STDOUT:', res.stdout);
  console.log('STDERR:', res.stderr);
  ssh.dispose();
}).catch(console.error);
