const fs = require('fs');
const path = require('path');

const logPath = `C:\\Users\\User\\.gemini\\antigravity\\brain\\0942ed44-04c3-48e6-8a05-290b0f58d447\\.system_generated\\logs\\overview.txt`;
const content = fs.readFileSync(logPath, 'utf8');

console.log("File length:", content.length);

const terms = ["187.", "ssh", "pm2", "deploy", "ovh", "ftp"];
for (const term of terms) {
    const regex = new RegExp(term, 'gi');
    const matches = content.match(regex);
    console.log(`Term "${term}" matches:`, matches ? matches.length : 0);
}

// Print some lines containing "187." or "ssh"
const lines = content.split('\n');
console.log("\nSample matches:");
lines.forEach((line, index) => {
    if (line.includes("187.124.113.21") || line.toLowerCase().includes("pm2") || line.toLowerCase().includes("serveur")) {
        console.log(`${index}: ${line.trim()}`);
    }
});
