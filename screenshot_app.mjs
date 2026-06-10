import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// 1. Page login
await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_login.png' });
console.log('Login screenshotted');

// 2. Page register
await page.goto('https://sunugestion.sn/register.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_register.png' });
console.log('Register screenshotted');

// 3. Dashboard (login first)
await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_dashboard.png' });
console.log('Dashboard screenshotted');

await browser.close();
