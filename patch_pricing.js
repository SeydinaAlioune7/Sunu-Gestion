const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, 'frontend', 'pricing.html'), 'utf8');

// Replace 10 000 with 5 000
content = content.replace(/10 000/g, '5 000');
// Replace 15 with 7.5 (euro equivalent, roughly)
content = content.replace(/'15'/g, "'7.5'");
// Replace 100 000 with 50 000 (if exists)
content = content.replace(/100 000/g, '50 000');

fs.writeFileSync(path.join(__dirname, 'frontend', 'pricing.html'), content, 'utf8');
console.log('pricing.html updated');
