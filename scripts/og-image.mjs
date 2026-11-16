// Renders scripts/og-image.html into public/og-image.png (1200 × 630), the
// image link previews show (index.html, og:image). Uses an installed Chrome
// through playwright-core; set CHROME to its path if it isn't in the usual
// place for macOS.
import { chromium } from 'playwright-core';

const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: chrome });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-image.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.locator('.card').screenshot({ path: new URL('../public/og-image.png', import.meta.url).pathname });
await browser.close();
console.log('public/og-image.png');
