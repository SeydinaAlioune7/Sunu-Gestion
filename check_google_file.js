const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const config = { host: '187.124.113.21', port: 22, username: 'root', password: 'Sabiatd2010Sabiatd@', readyTimeout: 30000 };
async function main() {
  try {
    await ssh.connect(config);
    const ufwRes = await ssh.execCommand('ufw status');
    console.log('UFW:', ufwRes.stdout || ufwRes.stderr);
    const iptablesRes = await ssh.execCommand('iptables -L -n | grep 80');
    console.log('IPTABLES:', iptablesRes.stdout || iptablesRes.stderr);
  } catch (err) { console.error('Error:', err); } finally { ssh.dispose(); }
}
main();
