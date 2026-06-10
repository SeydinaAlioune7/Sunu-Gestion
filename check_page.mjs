import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));

// 1. Aller sur login et se connecter
console.log('1. Login...');
await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
console.log('After login URL:', page.url());

// 2. Aller sur super-admin
console.log('2. Opening super-admin...');
await page.goto('https://sunugestion.sn/super-admin.html', { waitUntil: 'networkidle', timeout: 15000 });

const finalUrl = page.url();
console.log('Final URL:', finalUrl);
console.log('Title:', await page.title());

// Check content
const bodyText = await page.textContent('body').catch(() => '');
console.log('Body (first 400 chars):', bodyText.substring(0, 400));

// Console errors
const errors = logs.filter(l => l.startsWith('[error]'));
if (errors.length) console.log('JS ERRORS:', errors.slice(0, 5));

await browser.close();
