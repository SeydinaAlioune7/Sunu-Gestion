import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const logs = [];
page.on('console', m => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });

// Login
await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});

// Super admin
await page.goto('https://sunugestion.sn/super-admin.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

console.log('URL finale:', page.url());
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/superadmin_screen.png', fullPage: false });
console.log('Screenshot sauvegardé');

if (logs.length) console.log('Console:', logs.slice(0,5).join('\n'));

await browser.close();
