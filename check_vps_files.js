const { Client } = require('ssh2');
const conn = new Client();

const config = {
  host: '187.124.113.21',
  port: 22,
  username: 'root',
  password: 'Sabiatd2010Sabiatd@',
  readyTimeout: 30000
};

conn.on('ready', () => {
  console.log('🟢 SSH Connecté !');
  
  conn.exec('ls -la /var/www && ls -la /var/www/alioune-gestion && ls -la /var/www/alioune-gestion/backend && ls -la /var/www/alioune-gestion/frontend', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log(`\n🎉 Fini avec code : ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('❌ Erreur SSH :', err);
}).connect(config);
