/**
 * 响应式自检：用无头 Chrome 在多个视口下打开应用，逐页检测
 *  - 文档级横向溢出
 *  - 越界元素（排除可滚动容器内的元素）
 *  - 过小的点击目标
 *  - 关键布局数值（顶栏高度、导航是否换行/横滚、字号）
 *
 * 运行：node scripts/responsive-check.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true },
  { name: 'iPhone 14', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932, dpr: 3, mobile: true },
  { name: 'iPad mini', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'Laptop', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'Desktop', width: 1920, height: 1080, dpr: 1, mobile: false },
];

const ROUTES = [
  { hash: '#/', name: 'dashboard' },
  { hash: '#/records', name: 'records' },
  { hash: '#/goals', name: 'goals' },
  { hash: '#/reports', name: 'reports' },
  { hash: '#/settings', name: 'settings' },
];

/** 直接写入 IndexedDB 种子数据，保证在「有数据」状态下检查布局 */
async function seedData(page) {
  await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('ppbs', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          ['records', 'categories', 'goals', 'templates', 'reports', 'meta'].forEach((n) => {
            if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
          });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
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
      ['写项目文档', 'projects', 120, 5, 4, true],
      ['读技术书', 'learning', 60, 4, 3, true],
      ['短视频刷屏', 'mindless', 45, 1, 2, false],
      ['和家人吃饭', 'social', 90, 5, 1, false],
      ['跑步', 'health', 40, 4, 4, false],
      ['处理邮件', 'work', 35, 3, 3, false],
      ['看纪录片', 'entertainment', 55, 3, 2, false],
    ];

    const records = [];
    // 铺满一周，让图表有足够数据点
    for (let d = 0; d < 7; d++) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      base.forEach(([activityName, categoryId, durationMinutes, valueScore, energyCost, goal], i) => {
        records.push({
          id: `r${d}_${i}`,
          date: key(dt),
          activityName,
          categoryId,
          durationMinutes,
          valueScore,
          energyCost,
          relatedToLongTermGoal: goal,
          goalId: goal ? 'g1' : null,
          startTime: null,
          endTime: null,
          crossMidnight: false,
          notes: '这是一条用于检查布局的长备注，看看换行与截断是否正常。',
          createdAt: Date.now() + i,
          updatedAt: Date.now() + i,
        });
      });
    }

    const goals = [
      {
        id: 'g1',
        name: '每周读完一本技术书',
        categoryId: 'learning',
        targetMinutesPerWeek: 300,
        startDate: day,
        active: true,
        createdAt: Date.now(),
      },
    ];

    const templates = [
      {
        id: 't1',
        name: '写项目文档',
        categoryId: 'projects',
        defaultDurationMinutes: 90,
        defaultValueScore: 5,
        defaultEnergyCost: 4,
        useCount: 3,
      },
    ];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'categories', 'goals', 'templates'], 'readwrite');
      ['records', 'categories', 'goals', 'templates'].forEach((n) => tx.objectStore(n).clear());
      cats.forEach((c) => tx.objectStore('categories').put(c));
      records.forEach((r) => tx.objectStore('records').put(r));
      goals.forEach((g) => tx.objectStore('goals').put(g));
      templates.forEach((t) => tx.objectStore('templates').put(t));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function auditViewport(browser, vp) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar', { timeout: 15000 });
  await seedData(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  const results = [];

  for (const route of ROUTES) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, route.hash);
    await new Promise((r) => setTimeout(r, 1000));

    const audit = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const scrollW = document.documentElement.scrollWidth;

      const inScrollableAncestor = (el) => {
        let p = el.parentElement;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
          p = p.parentElement;
        }
        return false;
      };

      const overflow = [];
      document.querySelectorAll('body *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
        if (inScrollableAncestor(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right > docW + 1.5) {
          overflow.push({
            tag: el.tagName.toLowerCase(),
            cls: typeof el.className === 'string' ? el.className.slice(0, 50) : el.tagName,
            right: Math.round(r.right),
          });
        }
      });

      const small = [];
      document.querySelectorAll('button, a, input[type="checkbox"], .nav-btn').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // explain-btn 视觉 16px，但用伪元素把命中区扩到 36px，属可接受例外
        if (el.classList.contains('explain-btn')) return;
        // 复选框若被 label 包裹，则以 label 的尺寸作为真实可点区域
        if (el.tagName === 'INPUT' && el.type === 'checkbox') {
          const label = el.closest('label');
          if (label) {
            const lr = label.getBoundingClientRect();
            if (lr.height >= 36 && lr.width >= 32) return;
          }
        }
        if (r.height < 28) {
          small.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 16),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      });

      const topbar = document.querySelector('.topbar');
      const nav = document.querySelector('.topbar-nav');
      const brand = document.querySelector('.topbar-brand');
      const xLink = document.querySelector('.x-link');
      const main = document.querySelector('.main');
      const h1 = document.querySelector('.page-header h1');

      const navStyle = nav ? getComputedStyle(nav) : null;
      const mainStyle = main ? getComputedStyle(main) : null;

      return {
        docW,
        scrollW,
        hOverflow: scrollW - docW,
        overflowCount: overflow.length,
        overflowSample: overflow.slice(0, 4),
        smallCount: small.length,
        smallSample: small.slice(0, 5),
        topbarH: topbar ? Math.round(topbar.getBoundingClientRect().height) : null,
        navScrollable: nav ? nav.scrollWidth > nav.clientWidth + 1 : null,
        navDir: navStyle ? navStyle.flexDirection : null,
        brandSize: brand ? Math.round(parseFloat(getComputedStyle(brand).fontSize)) : null,
        xSize: xLink
          ? {
              w: Math.round(xLink.getBoundingClientRect().width),
              h: Math.round(xLink.getBoundingClientRect().height),
              href: xLink.getAttribute('href'),
            }
          : null,
        mainPadX: mainStyle ? Math.round(parseFloat(mainStyle.paddingLeft)) : null,
        h1Size: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
      };
    });

    results.push({ route: route.name, ...audit });
  }

  // 生产级也检查一下 body 是否有水平滚动条造成的内容位移
  const bodyOverflow = await page.evaluate(() => {
    const b = document.body;
    return { scrollW: b.scrollWidth, clientW: b.clientWidth };
  });

  await page.close();
  return { viewport: vp, results, pageErrors, bodyOverflow };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const report = [];
for (const vp of VIEWPORTS) {
  report.push(await auditViewport(browser, vp));
}
await browser.close();

let failures = 0;
console.log('\n=== 响应式自检报告 ===\n');

for (const { viewport: vp, results, pageErrors, bodyOverflow } of report) {
  const worst = Math.max(0, ...results.map((r) => r.hOverflow));
  const totalOverflow = results.reduce((s, r) => s + r.overflowCount, 0);
  const totalSmall = results.reduce((s, r) => s + r.smallCount, 0);
  const bodyDiff = bodyOverflow.scrollW - bodyOverflow.clientW;

  const fail = worst > 1 || totalOverflow > 0 || pageErrors.length > 0 || bodyDiff > 1;
  if (fail) failures++;

  console.log(
    `[${fail ? 'FAIL' : 'PASS'}] ${vp.name} (${vp.width}x${vp.height} @${vp.dpr}x)  ` +
      `溢出=${worst}px  body=${bodyDiff}px  越界=${totalOverflow}  小点击区=${totalSmall}  报错=${pageErrors.length}`
  );

  const d = results[0];
  console.log(
    `        顶栏=${d.topbarH}px  导航方向=${d.navDir}  导航横滚=${d.navScrollable}  ` +
      `标题字号=${d.brandSize}px  H1=${d.h1Size}px  主区左右内边距=${d.mainPadX}px  X链接=${d.xSize?.w}x${d.xSize?.h}`
  );

  for (const r of results) {
    if (r.hOverflow > 1 || r.overflowCount > 0) {
      console.log(`    ⚠ ${r.route}: docW=${r.docW} scrollW=${r.scrollW}`);
      console.log(`        越界: ${JSON.stringify(r.overflowSample)}`);
    }
    if (r.smallCount > 0) {
      console.log(`    · ${r.route} 小点击区: ${JSON.stringify(r.smallSample)}`);
    }
  }
  if (pageErrors.length) console.log('    页面错误:', pageErrors.slice(0, 3));
  console.log('');
}

console.log(failures === 0 ? `全部 ${report.length} 个视口通过。` : `${failures} 个视口存在问题。`);
process.exit(failures === 0 ? 0 : 1);
