/**
 * 交互自检：X 链接、主题切换、导航、录入表单在移动端的可用性。
 * 运行：node scripts/interaction-check.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForSelector('.topbar', { timeout: 15000 });

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// 1. 作者 X 链接
const xInfo = await page.evaluate(() => {
  const a = document.querySelector('.x-link');
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return {
    href: a.getAttribute('href'),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    text: a.textContent.trim(),
    aria: a.getAttribute('aria-label'),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
});
check('存在作者 X 链接', !!xInfo, xInfo);
check('X 链接指向 https://x.com/0xkillcoin', xInfo?.href === 'https://x.com/0xkillcoin', xInfo?.href);
check(
  'X 链接新窗口打开且含 noopener',
  xInfo?.target === '_blank' && (xInfo?.rel || '').includes('noopener'),
  xInfo?.rel
);
check('X 链接可点区域 ≥32px 高', (xInfo?.h ?? 0) >= 32, `h=${xInfo?.h}`);
check('X 链接含无障碍名称', (xInfo?.aria || '').length > 0, xInfo?.aria);

// 2. 主题切换（新版按钮是 .nav-btn-icon）
const themeBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.topbar-nav .nav-btn-icon')];
  if (!btns.length) return null;
  const r = btns[0].getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), label: btns[0].getAttribute('aria-label') };
});
check('存在主题切换按钮', !!themeBtn, themeBtn);
check('主题按钮点击区 ≥38px', (themeBtn?.h ?? 0) >= 38 && (themeBtn?.w ?? 0) >= 38, themeBtn?.h);

const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
await page.click('.topbar-nav .nav-btn-icon');
await new Promise((r) => setTimeout(r, 400));
const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
check('主题切换生效', before !== after, `${before} → ${after}`);
const persisted = await page.evaluate(() => localStorage.getItem('ppbs-theme'));
check('主题选择被持久化', persisted === after, `localStorage=${persisted}`);

// 3. 导航
const nav = await page.evaluate(() => {
  const links = [...document.querySelectorAll('.topbar-nav a.nav-btn')];
  return links.map((a) => {
    const r = a.getBoundingClientRect();
    return { text: a.textContent.trim().slice(0, 10), href: a.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height) };
  });
});
check('导航含 5 个页面入口', nav.length === 5, nav.map((n) => n.text));
check('导航项点击区 ≥38px 高', nav.every((n) => n.h >= 38), nav.map((n) => `${n.text}:${n.h}`));
check(
  '导航使用 hash 路由（静态托管可用）',
  nav.every((n) => (n.href || '').startsWith('#/')),
  nav.map((n) => n.href)
);

// 4. 跳到记录页检查表单
await page.evaluate(() => { window.location.hash = '#/records'; });
await new Promise((r) => setTimeout(r, 900));

const form = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('.record-form input, .record-form select, .record-form textarea')];
  const tooSmall = fields
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.height < 32 && el.type !== 'checkbox';
    })
    .map((el) => `${el.type || el.tagName}:${Math.round(el.getBoundingClientRect().height)}`);
  const submit = document.querySelector('.record-form button[type="submit"]');
  const scoreBtns = [...document.querySelectorAll('.record-form .score-btn')].map((el) =>
    Math.round(el.getBoundingClientRect().height)
  );
  // iOS 聚焦缩放：字体 <16px 会触发自动放大
  const smallFont = fields
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16 && el.type !== 'checkbox')
    .map((el) => `${el.type || el.tagName}:${getComputedStyle(el).fontSize}`);
  return {
    fieldCount: fields.length,
    tooSmall,
    submitH: submit ? Math.round(submit.getBoundingClientRect().height) : 0,
    scoreMin: scoreBtns.length ? Math.min(...scoreBtns) : 0,
    smallFont,
  };
});
check('录入表单字段数 ≥6', form.fieldCount >= 6, form.fieldCount);
check('表单控件高度 ≥32px', form.tooSmall.length === 0, form.tooSmall);
check('控件字号 ≥16px（避免 iOS 聚焦缩放）', form.smallFont.length === 0, form.smallFont);
check('提交按钮 ≥44px 高', form.submitH >= 44, form.submitH);
check('评分按钮 ≥40px', form.scoreMin >= 40, form.scoreMin);

// 5. 实际录入一条记录，验证保存成功
const saved = await page.evaluate(async () => {
  const setNativeValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const name = document.querySelector('.record-form input[type="text"]');
  setNativeValue(name, '自检记录');
  const dur = document.querySelector('.record-form input[type="number"]');
  setNativeValue(dur, '45');
  document.querySelector('.record-form button[type="submit"]').click();
  await new Promise((r) => setTimeout(r, 800));
  return {
    hasRow: [...document.querySelectorAll('.data-table td')].some((td) => td.textContent.includes('自检记录')),
  };
});
check('可以成功保存一条新记录', saved.hasRow, saved);

await browser.close();

let failed = 0;
console.log('\n=== 交互自检报告 ===\n');
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '[PASS]' : '[FAIL]'} ${c.name}`);
  if (!c.ok) console.log('        ', JSON.stringify(c.detail));
}
console.log('');
console.log(failed === 0 ? `全部 ${checks.length} 项通过。` : `${failed}/${checks.length} 项失败。`);
process.exit(failed === 0 ? 0 : 1);
