const fs = require('fs');
const path = require('path');

const filesToPatch = ['frontend/about.html', 'frontend/help.html', 'frontend/index.html'];

for (const f of filesToPatch) {
  let p = path.join(__dirname, f);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    content = content.replace(/href="mailto:aliounebadaraibnabutalibdiene@gmail\.com"/g, 'href="https://mail.google.com/mail/?view=cm&fs=1&to=aliounebadaraibnabutalibdiene@gmail.com" target="_blank"');
    fs.writeFileSync(p, content, 'utf8');
    console.log(f + ' updated');
  }
}
