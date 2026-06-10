const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const cutoffTime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'logs') {
                results = results.concat(getFiles(fullPath));
            }
        } else {
            if (stat.mtimeMs > cutoffTime && !file.includes('recent_changes') && !file.includes('search_logs') && !file.includes('deploy_vps') && !file.includes('check_vps_files')) {
                results.push({
                    path: path.relative(rootDir, fullPath),
                    mtime: stat.mtime
                });
            }
        }
    });
    return results;
}

const files = getFiles(rootDir);
console.log("Recently modified files (last 3 days):");
files.forEach(f => {
    console.log(`- ${f.path} (${f.mtime})`);
});
