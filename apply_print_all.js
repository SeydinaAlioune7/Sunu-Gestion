const fs = require('fs');
const path = require('path');
const frontendDir = path.join(__dirname, 'frontend');

const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(frontendDir, file), 'utf-8');
    
    // 1. Inject CSS link
    if (!content.includes('print.css')) {
        content = content.replace('</head>', '    <link rel="stylesheet" href="/assets/css/print.css">\n</head>');
    }
    
    // 2. Add no-print to navbar
    content = content.replace(/<nav class="glass([^"]*)"/g, '<nav class="glass$1 no-print"');
    
    // 3. Add print button near H1 if it doesn't exist
    if (!content.includes('window.print()') && content.includes('<h1')) {
        // Simple injection after the h1 parent div if possible or after h1
        content = content.replace(/(<h1[^>]*>.*?<\/h1>)/s, '$1\n            <button @click="window.print()" class="mt-4 no-print flex items-center gap-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition border border-indigo-500/30"><span>🖨️</span> Imprimer en Couleur</button>');
    }
    
    fs.writeFileSync(path.join(frontendDir, file), content);
    console.log(`Updated ${file}`);
});
