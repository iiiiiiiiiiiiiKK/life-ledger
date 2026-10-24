import puppeteer from 'puppeteer-core';

const URL = process.argv[2];
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--ignore-certificate-errors'],
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('requestfailed', (r) => errors.push(`REQ FAIL ${r.url()} ${r.failure()?.errorText}`));

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('.topbar', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1200));

const info = await page.evaluate(() => ({
  title: document.title,
  brand: document.querySelector('.topbar-brand')?.textContent?.trim(),
  empty: !!document.querySelector('.empty-state'),
  xHref: document.querySelector('.x-link')?.getAttribute('href'),
  navCount: document.querySelectorAll('.topbar-nav a.nav-btn').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  theme: document.documentElement.getAttribute('data-theme'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
}));

console.log(JSON.stringify({ url: URL, ...info, errors }, null, 2));

// 逐页检查
const routes = ['#/records', '#/goals', '#/reports', '#/settings'];
for (const h of routes) {
  await page.evaluate((x) => { window.location.hash = x; }, h);
  await new Promise((r) => setTimeout(r, 900));
  const ok = await page.evaluate(() => {
    const h1 = document.querySelector('.page-header h1');
    return {
      h1: h1 ? h1.textContent.trim().replace(/\s+/g, ' ') : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log(`${h.padEnd(12)} h1=${ok.h1}  overflow=${ok.overflow}px`);
}

await page.screenshot({ path: '_shots/live-mobile.png' });
await browser.close();
console.log(errors.length === 0 ? '\n无页面错误' : `\n${errors.length} 个错误`);
