const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

const host = "187.124.113.21";
const passwords = ["Sabiatd1998", "Sabiatd1998;"];
const users = ["root", "alioune", "ubuntu", "sunugev"];

async function testConnections() {
    for (const user of users) {
        for (const password of passwords) {
            try {
                console.log(`Trying connection: ${user}@${host} with password ${password}...`);
                await ssh.connect({
                    host: host,
                    username: user,
                    password: password,
                    readyTimeout: 10000
                });
                console.log(`✅ SUCCESS! Connected as ${user}@${host}`);
                
                // Chercher où est installé le projet
                console.log("Checking project directories...");
                const result = await ssh.execCommand('ls -la /var/www /home /root');
                console.log("Directories listing:\n", result.stdout);
                
                // Trouver le chemin de pm2
                const pm2Res = await ssh.execCommand('which pm2 || find / -name pm2 2>/dev/null');
                console.log("PM2 Path:", pm2Res.stdout);
                
                ssh.dispose();
                return { user, password };
            } catch (err) {
                console.log(`❌ Failed: ${user}@${host} - ${err.message}`);
            }
        }
    }
    console.log("❌ All combinations failed.");
    return null;
}

testConnections();
