const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const config = { host: '187.124.113.21', port: 22, username: 'root', password: 'Sabiatd2010Sabiatd@', readyTimeout: 30000 };

async function main() {
  try {
    await ssh.connect(config);

    const res = await ssh.execCommand(
      `cd /var/www/alioune-gestion/backend && node -e ` +
      `"const db=require('better-sqlite3')('./db/app.db');` +
      // Détails complet de la company 11
      `const co=db.prepare('SELECT * FROM companies WHERE id=11').get();` +
      `console.log('COMPANY:',JSON.stringify(co));` +
      // Activités du compte suspect
      `const acts=db.prepare('SELECT * FROM activity_logs WHERE company_id=11 ORDER BY created_at DESC LIMIT 20').all();` +
      `acts.forEach(a=>console.log('ACT:',JSON.stringify(a)));` +
      // Vérifier si il a créé des produits, factures etc
      `const prods=db.prepare('SELECT COUNT(*) as n FROM products WHERE company_id=11').get();` +
      `const invs=db.prepare('SELECT COUNT(*) as n FROM invoices WHERE company_id=11').get();` +
      `const files=db.prepare('SELECT COUNT(*) as n FROM encrypted_files WHERE company_id=11').get();` +
      `console.log('Stats:',JSON.stringify({products:prods.n,invoices:invs.n,files:files.n}));` +
      // Aussi voir la company 10 (joniw58123 - aussi suspect)
      `const co10=db.prepare('SELECT * FROM companies WHERE id=10').get();` +
      `console.log('COMPANY10:',JSON.stringify(co10));` +
      `db.close();"`
    );
    console.log(res.stdout || res.stderr);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    ssh.dispose();
  }
}
main();
