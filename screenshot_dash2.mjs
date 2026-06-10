import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_dash_new.png' });
console.log('Dashboard screenshotted');

// Scroll down to see Master Access
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_dash_bottom.png' });
console.log('Bottom screenshotted');

await browser.close();
