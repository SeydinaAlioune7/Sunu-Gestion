import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().substring(0, 100)}`); });

// Login
await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
console.log('Connecté, URL:', page.url());

// Page produits/stock
await page.goto('https://sunugestion.sn/products.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
console.log('Products URL:', page.url());
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_products.png' });

// Vitrine
await page.goto('https://sunugestion.sn/vitrine/index.html?company_id=1', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
console.log('Vitrine URL:', page.url());
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_vitrine.png' });

if (logs.length) console.log('Erreurs console:\n' + logs.slice(0, 8).join('\n'));
await browser.close();
