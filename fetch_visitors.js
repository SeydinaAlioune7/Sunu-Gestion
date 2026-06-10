const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

ssh.connect({
  host: '187.124.113.21',
  port: 22,
  username: 'root',
  password: 'Sabiatd2010Sabiatd@',
  readyTimeout: 30000
}).then(async () => {
  const code = `
    const Database = require('better-sqlite3');
    const db = new Database('/var/www/alioune-gestion/backend/db/app.db');
    const rows = db.prepare("SELECT ip_address, location, device_type, browser, visited_at FROM visitor_logs").all();
    console.log(JSON.stringify(rows));
  `;
  const res = await ssh.execCommand(`node -e "${code.replace(/\n/g, ' ')}"`);
  const data = JSON.parse(res.stdout);
  console.log("VISITORS COUNT:", data.length);
  const others = data.filter(r => r.ip_address !== '127.0.0.1' && !r.location.includes('Paris')); // Assuming user is in Paris or Dakar
  console.log("OTHER VISITORS:", others);
  ssh.dispose();
}).catch(console.error);
