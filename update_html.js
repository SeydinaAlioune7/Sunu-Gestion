const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'frontend');

function processHtmlFiles(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'assets' && file !== 'product-images') {
                processHtmlFiles(filePath);
            }
        } else if (file.endsWith('.html')) {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            // Remove emojis (basic regex for common emojis used)
            const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu;
            
            if (emojiRegex.test(content)) {
                content = content.replace(emojiRegex, '');
                modified = true;
            }

            // Insert premium.css if not present
            if (!content.includes('premium.css') && content.includes('</head>')) {
                content = content.replace('</head>', '    <link rel="stylesheet" href="/assets/css/premium.css">\n</head>');
                modified = true;
            }

            // Replace some AI-like text
            if (content.includes('🚀')) content = content.replace(/🚀/g, '');
            if (content.includes('📦')) content = content.replace(/📦/g, '');

            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated: ${file}`);
            }
        }
    });
}

processHtmlFiles(directoryPath);
console.log('Update complete.');
