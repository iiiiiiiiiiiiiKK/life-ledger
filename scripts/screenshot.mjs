import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = '_shots';
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'mobile-dashboard', w: 390, h: 844, hash: '#/' },
  { name: 'mobile-records', w: 390, h: 844, hash: '#/records' },
  { name: 'mobile-reports', w: 390, h: 844, hash: '#/reports' },
  { name: 'mobile-settings', w: 390, h: 844, hash: '#/settings' },
  { name: 'mobile-goals', w: 390, h: 844, hash: '#/goals' },
  { name: 'desktop-dashboard', w: 1440, h: 900, hash: '#/' },
  { name: 'desktop-records', w: 1440, h: 900, hash: '#/records' },
  { name: 'desktop-reports', w: 1440, h: 900, hash: '#/reports' },
  { name: 'desktop-settings', w: 1440, h: 900, hash: '#/settings' },
  { name: 'desktop-goals', w: 1440, h: 900, hash: '#/goals' },
  { name: 'mobile-empty-dark', w: 390, h: 844, hash: '#/', empty: true, dark: true },
  { name: 'desktop-empty', w: 1440, h: 900, hash: '#/', empty: true },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 2 });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar');

  if (!s.empty) {
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
        ['写项目文档', 'projects', 120, 5, 4, true],
        ['读技术书', 'learning', 60, 4, 3, true],
        ['短视频刷屏', 'mindless', 45, 1, 2, false],
        ['和家人吃饭', 'social', 90, 5, 1, false],
        ['跑步', 'health', 40, 4, 4, false],
        ['处理邮件', 'work', 35, 3, 3, false],
        ['看纪录片', 'entertainment', 55, 3, 2, false],
      ];

      const records = [];
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
            startTime: d === 0 ? `0${9 + i}:00` : null,
            endTime: null,
            crossMidnight: false,
            notes: '用于检查布局的备注文本。',
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
        {
          id: 'g2',
          name: '每周写一篇复盘长文',
          categoryId: 'projects',
          targetMinutesPerWeek: 180,
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

      await new Promise((res, rej) => {
        const tx = db.transaction(['records', 'categories', 'goals', 'templates'], 'readwrite');
        ['records', 'categories', 'goals', 'templates'].forEach((n) => tx.objectStore(n).clear());
        cats.forEach((c) => tx.objectStore('categories').put(c));
        records.forEach((r) => tx.objectStore('records').put(r));
        goals.forEach((g) => tx.objectStore('goals').put(g));
        templates.forEach((t) => tx.objectStore('templates').put(t));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    });
  } else {
    await page.evaluate(async () => {
      const open = () =>
        new Promise((res, rej) => {
          const r = indexedDB.open('ppbs', 1);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      const db = await open();
      await new Promise((res, rej) => {
        const tx = db.transaction(['records', 'categories', 'goals'], 'readwrite');
        ['records', 'categories', 'goals'].forEach((n) => tx.objectStore(n).clear());
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    });
  }

  if (s.dark) {
    await page.evaluate(() => localStorage.setItem('ppbs-theme', 'dark'));
  } else {
    await page.evaluate(() => localStorage.setItem('ppbs-theme', 'light'));
  }

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar');
  await page.evaluate((h) => { window.location.hash = h; }, s.hash);
  await new Promise((r) => setTimeout(r, 1500));

  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: false });
  console.log('shot', s.name);
  await page.close();
}

await browser.close();
console.log('done');
