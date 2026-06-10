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
  const psqlQuery = `su - postgres -c "psql -d alioune_gestion -c \\"UPDATE companies SET subscription_status = 'trial', trial_end_date = CURRENT_DATE + INTERVAL '7 days' WHERE name ILIKE '%ams%';\\""`;
  const res = await ssh.execCommand(psqlQuery);
  console.log('STDOUT:', res.stdout);
  console.log('STDERR:', res.stderr);
  
  const psqlCheck = `su - postgres -c "psql -d alioune_gestion -c \\"SELECT id, name, subscription_status, trial_end_date FROM companies;\\""`;
  const res2 = await ssh.execCommand(psqlCheck);
  console.log('STDOUT:', res2.stdout);
  ssh.dispose();
}).catch(console.error);
