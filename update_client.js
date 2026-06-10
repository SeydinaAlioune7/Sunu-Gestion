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
  const query1 = `const pool = require('./db/pool'); pool.query("SELECT id, name, subscription_status FROM companies WHERE name ILIKE '%ams%'").then(r => console.log('Found:', r.rows)).catch(console.error).finally(()=>process.exit(0));`;
  const res1 = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "${query1}"`);
  console.log(res1.stdout);
  
  const query2 = `const pool = require('./db/pool'); const d = new Date(); d.setDate(d.getDate() + 7); pool.query("UPDATE companies SET subscription_status = 'trial', trial_end_date = $1 WHERE name ILIKE '%ams%'", [d.toISOString()]).then(r => console.log('Updated:', r.rowCount)).catch(console.error).finally(()=>process.exit(0));`;
  const res2 = await ssh.execCommand(`cd /var/www/alioune-gestion/backend && node -e "${query2}"`);
  console.log(res2.stdout);
  
  ssh.dispose();
}).catch(console.error);
