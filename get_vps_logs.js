const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const config = { host: '187.124.113.21', port: 22, username: 'root', password: 'Sabiatd2010Sabiatd@', readyTimeout: 30000 };
async function main() {
  try {
    await ssh.connect(config);
    const logRes = await ssh.execCommand('pm2 logs abd-gestion-backend --lines 100 --nostream');
    console.log(logRes.stdout || logRes.stderr);
  } catch (err) { console.error('Error fetching logs:', err); } finally { ssh.dispose(); }
}
main();
