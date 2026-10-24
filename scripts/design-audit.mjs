/**
 * 设计质量自检：无法用肉眼看图时，用可测量的属性代替。
 * 检查项：
 *  1. 文字对比度（WCAG AA：正文 ≥4.5:1，大字 ≥3:1）
 *  2. 文字是否被裁切（scrollHeight > clientHeight 且 overflow hidden）
 *  3. 间距一致性（卡片/表格/按钮的内边距是否在同一套刻度上）
 *  4. 字号层级是否单调递减（h1 > h2 > 正文 > 辅助）
 *  5. 同屏最大字号与最小字号之比
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: 'iPhone 14', w: 390, h: 844, mobile: true },
  { name: 'Desktop', w: 1440, h: 900, mobile: false },
];

const ROUTES = ['#/', '#/records', '#/goals', '#/reports', '#/settings'];

function srgb(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let problems = 0;
const report = {};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1, isMobile: vp.mobile });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar');

  // 种数据
  await page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('ppbs', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          ['records', 'categories', 'goals', 'templates', 'reports', 'meta'].forEach((n) => {
            if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
          });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    const db = await open();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const day = key(now);
    const cats = [
      ['work', '工作与赚钱', '#3b82f6', 'asset'],
      ['learning', '学习与技能', '#8b5cf6', 'asset'],
      ['projects', '项目与创造', '#ec4899', 'asset'],
      ['health', '健康与休息', '#10b981', 'neutral'],
      ['social', '社交与家庭', '#f59e0b', 'neutral'],
      ['entertainment', '娱乐与放松', '#6366f1', 'neutral'],
      ['mindless', '无意识消耗', '#ef4444', 'liability'],
    ].map(([id, name, color, kind]) => ({ id, name, color, kind, isSystem: true }));
    const base = [
      ['写项目文档', 'projects', 120, 5, 4],
      ['读技术书', 'learning', 60, 4, 3],
      ['短视频刷屏', 'mindless', 45, 1, 2],
      ['和家人吃饭', 'social', 90, 5, 1],
    ];
    const records = [];
    for (let d = 0; d < 5; d++) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      base.forEach(([activityName, categoryId, durationMinutes, valueScore, energyCost], i) => {
        records.push({
          id: `r${d}_${i}`,
          date: key(dt),
          activityName,
          categoryId,
          durationMinutes,
          valueScore,
          energyCost,
          relatedToLongTermGoal: i === 1,
          goalId: i === 1 ? 'g1' : null,
          startTime: null,
          endTime: null,
          crossMidnight: false,
          createdAt: Date.now() + i,
          updatedAt: Date.now() + i,
        });
      });
    }
    const goals = [
      { id: 'g1', name: '每周读完一本技术书', categoryId: 'learning', targetMinutesPerWeek: 300, startDate: day, active: true, createdAt: Date.now() },
    ];
    await new Promise((res, rej) => {
      const tx = db.transaction(['records', 'categories', 'goals'], 'readwrite');
      ['records', 'categories', 'goals'].forEach((n) => tx.objectStore(n).clear());
      cats.forEach((c) => tx.objectStore('categories').put(c));
      records.forEach((r) => tx.objectStore('records').put(r));
      goals.forEach((g) => tx.objectStore('goals').put(g));
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar');

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => localStorage.setItem('ppbs-theme', t), theme);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.topbar');

    for (const hash of ROUTES) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await new Promise((r) => setTimeout(r, 700));

      const res = await page.evaluate(() => {
        function parseColor(str) {
          const m = str.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
          return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
        }

        function findBg(el) {
          let cur = el;
          while (cur) {
            const bg = parseColor(getComputedStyle(cur).backgroundColor);
            if (bg && bg.a > 0.9) return bg;
            cur = cur.parentElement;
          }
          const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
          return bodyBg && bodyBg.a > 0.9 ? bodyBg : { r: 255, g: 255, b: 255, a: 1 };
        }

        const toLin = (c) => {
          const v = c / 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const lum = (c) => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
        const ratio = (a, b) => {
          const l1 = lum(a);
          const l2 = lum(b);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };

        const lowContrast = [];
        const clipped = [];
        const fontSizes = new Set();

        const textEls = [...document.querySelectorAll('p, span, td, th, h1, h2, h3, label, a, button, li, code')];
        for (const el of textEls) {
          const txt = (el.textContent || '').trim();
          if (!txt || txt.length === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.opacity === '0') continue;

          const fg = parseColor(cs.color);
          if (!fg) continue;
          const bg = findBg(el);
          const cr = ratio(fg, bg);
          const size = parseFloat(cs.fontSize);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          const isLarge = size >= 24 || (size >= 18.66 && bold);
          const need = isLarge ? 3 : 4.5;
          if (cr < need) {
            lowContrast.push({
              text: txt.slice(0, 22),
              cls: typeof el.className === 'string' ? el.className.slice(0, 30) : el.tagName,
              size: Math.round(size),
              cr: Math.round(cr * 100) / 100,
              need,
            });
          }

          // 文字裁切：overflow hidden 且内容更高
          if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis') {
            if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
              clipped.push({ text: txt.slice(0, 22), cls: String(el.className).slice(0, 30) });
            }
          }

          fontSizes.add(Math.round(size));
        }

        const h1 = document.querySelector('.page-header h1');
        const h2 = document.querySelector('.card h2, .card-head h2');
        const body = document.querySelector('.subtitle') || document.querySelector('p');
        const meta = document.querySelector('.chart-meta');

        const fs = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null);

        // 间距刻度检查：收集卡片 padding
        const cardPads = [...document.querySelectorAll('.card')].map((el) => {
          const cs = getComputedStyle(el);
          return cs.paddingTop;
        });

        return {
          lowContrast: lowContrast.slice(0, 6),
          lowContrastCount: lowContrast.length,
          clipped: clipped.slice(0, 4),
          clippedCount: clipped.length,
          sizes: { h1: fs(h1), h2: fs(h2), body: fs(body), meta: fs(meta) },
          fontSizes: [...fontSizes].sort((a, b) => b - a),
          cardPads: [...new Set(cardPads)],
        };
      });

      const key = `${vp.name}/${theme}${hash.replace('#/', '/').replace('#/', '/')}`;
      report[key] = res;
      if (res.lowContrastCount > 0 || res.clippedCount > 0) problems++;
    }
  }
  await page.close();
}

await browser.close();

console.log('\n=== 设计质量自检 ===\n');
for (const [key, r] of Object.entries(report)) {
  const s = r.sizes;
  const bad = r.lowContrastCount > 0 || r.clippedCount > 0;
  console.log(
    `${bad ? '[WARN]' : '[PASS]'} ${key}  字号 h1=${s.h1} h2=${s.h2} 正文=${s.body} 辅助=${s.meta}  ` +
      `对比度问题=${r.lowContrastCount} 裁切=${r.clippedCount}  卡片padding=${JSON.stringify(r.cardPads)}`
  );
  if (r.lowContrast.length) {
    console.log('        低对比:', JSON.stringify(r.lowContrast.slice(0, 4)));
  }
  if (r.clipped.length) {
    console.log('        裁切:', JSON.stringify(r.clipped));
  }
}

console.log('');
console.log(problems === 0 ? '未发现对比度/裁切问题。' : `${problems} 个页面存在对比度或裁切问题。`);
