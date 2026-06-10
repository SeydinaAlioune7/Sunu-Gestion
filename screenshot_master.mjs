import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('https://sunugestion.sn/login.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="email"]', 'alioune@diene.sn');
await page.fill('input[type="password"]', 'Admin2026!');
await page.click('button[type="submit"]');
await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(2000);

// Click Master Access
const masterBtn = await page.$('text=Master Access System');
if (masterBtn) {
    await masterBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_master_modal.png' });
    console.log('Modal opened');

    // Fill and submit
    await page.fill('input[type="email"]', 'alioune@diene.sn');
    await page.fill('input[type="password"]', 'GOAT_2026_ERP_SECRET');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    console.log('After submit URL:', page.url());
    await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_after_master.png' });
} else {
    console.log('Master button not found, taking full page screenshot');
    await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/scratch/alioune-gestion/screen_master_modal.png', fullPage: true });
}

await browser.close();
