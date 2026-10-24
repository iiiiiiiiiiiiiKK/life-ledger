/**
 * 分享图生成：把「我的人生财报」渲染到 Canvas，导出 PNG。
 * - 支持 1:1 方图（1080x1080）与 3:4 竖图（1080x1440）
 * - 用户主动选择要展示的分类；备注默认永不进入分享图
 */
import type { BalanceSheet, Category } from '../types';
import { formatMinutes, percent } from './dates';

export interface ShareOptions {
  ratio: '1:1' | '3:4';
  title: string;
  subtitle?: string;
  /** 要展示的分类 id；空数组表示不展示分类明细 */
  visibleCategoryIds: string[];
  /** 是否展示负债摘要 */
  showLiability: boolean;
  /** 是否展示活动排行榜 */
  showTopActivities: boolean;
  topActivityNames: string[];
  theme: 'dark' | 'light';
}

export const SHARE_SIZES: Record<'1:1' | '3:4', { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '3:4': { w: 1080, h: 1440 },
};

const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, baseSize: number, weight = 700) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

/** 生成分享图 DataURL */
export function renderShareImage(
  sheet: BalanceSheet,
  _categories: Category[],
  opts: ShareOptions
): string {
  const { w, h } = SHARE_SIZES[opts.ratio];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建绘图上下文');

  const dark = opts.theme === 'dark';
  const bg = dark ? '#0b0f19' : '#f7f8fb';
  const panel = dark ? '#131a2a' : '#ffffff';
  const border = dark ? '#1f2a3d' : '#e3e7ef';
  const textMain = dark ? '#f1f5f9' : '#0f172a';
  const textSub = dark ? '#8b9bb4' : '#64748b';
  const accent = dark ? '#4ade80' : '#16a34a';
  const warn = dark ? '#f87171' : '#dc2626';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 顶部标题区
  const pad = 64;
  let y = pad + 40;

  ctx.fillStyle = textSub;
  ctx.font = `500 26px ${FONT_STACK}`;
  ctx.fillText('我的人生财报', pad, y);
  y += 58;

  const titleSize = fitText(ctx, opts.title, w - pad * 2, 54);
  ctx.fillStyle = textMain;
  ctx.font = `800 ${titleSize}px ${FONT_STACK}`;
  ctx.fillText(opts.title, pad, y);
  y += 44;

  if (opts.subtitle) {
    ctx.fillStyle = textSub;
    ctx.font = `400 26px ${FONT_STACK}`;
    ctx.fillText(opts.subtitle, pad, y);
    y += 42;
  }

  // 主指标卡
  const cardH = 260;
  roundRect(ctx, pad, y, w - pad * 2, cardH, 28);
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();

  const colW = (w - pad * 2 - 60) / 3;
  const metrics: { label: string; value: string; color: string }[] = [
    {
      label: '时间资产',
      value: formatMinutes(sheet.assetMinutes),
      color: accent,
    },
    {
      label: '时间负债',
      value: opts.showLiability ? formatMinutes(sheet.liabilityMinutes) : '—',
      color: opts.showLiability ? warn : textSub,
    },
    {
      label: '时间净值',
      value: formatMinutes(sheet.netMinutes),
      color: sheet.netMinutes >= 0 ? accent : warn,
    },
  ];

  metrics.forEach((m, i) => {
    const x = pad + 30 + colW * i;
    const my = y + 62;
    ctx.fillStyle = textSub;
    ctx.font = `500 24px ${FONT_STACK}`;
    ctx.fillText(m.label, x, my);
    ctx.fillStyle = m.color;
    const size = fitText(ctx, m.value, colW - 20, 52);
    ctx.font = `800 ${size}px ${FONT_STACK}`;
    ctx.fillText(m.value, x, my + 62);
  });

  // 总时长行
  ctx.fillStyle = textSub;
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.fillText(
    `本期总记录 ${formatMinutes(sheet.totalMinutes)} · ${sheet.recordCount} 条记录 · ${sheet.activeDays} 天`,
    pad + 30,
    y + cardH - 34
  );

  y += cardH + 40;

  // 分类明细条形
  const visible = sheet.categories.filter((c) => opts.visibleCategoryIds.includes(c.categoryId));
  if (visible.length > 0) {
    ctx.fillStyle = textMain;
    ctx.font = `700 32px ${FONT_STACK}`;
    ctx.fillText('时间分配', pad, y);
    y += 34;

    const maxMinutes = Math.max(...visible.map((c) => c.minutes), 1);
    const barMaxW = w - pad * 2 - 260;

    for (const c of visible) {
      if (y > h - 220) break;
      ctx.fillStyle = textSub;
      ctx.font = `500 26px ${FONT_STACK}`;
      ctx.fillText(c.name, pad, y + 26);

      const barX = pad + 260;
      const barW = Math.max(6, (c.minutes / maxMinutes) * barMaxW);
      roundRect(ctx, barX, y + 4, barW, 26, 13);
      ctx.fillStyle = c.color;
      ctx.fill();

      ctx.fillStyle = textMain;
      ctx.font = `600 26px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `${formatMinutes(c.minutes)}  ${percent(c.minutes, sheet.totalMinutes)}`,
        w - pad,
        y + 27
      );
      ctx.textAlign = 'left';
      y += 46;
    }
    y += 24;
  }

  // 活动排行榜
  if (opts.showTopActivities && opts.topActivityNames.length > 0) {
    if (y > h - 260) {
      y = h - 260;
    }
    ctx.fillStyle = textMain;
    ctx.font = `700 32px ${FONT_STACK}`;
    ctx.fillText('本周投入排行', pad, y);
    y += 36;

    opts.topActivityNames.slice(0, 5).forEach((name, i) => {
      if (y > h - 180) return;
      ctx.fillStyle = textSub;
      ctx.font = `700 28px ${FONT_STACK}`;
      ctx.fillText(`${i + 1}`, pad, y + 26);
      ctx.fillStyle = textMain;
      ctx.font = `500 28px ${FONT_STACK}`;
      ctx.fillText(name, pad + 44, y + 26);
      y += 42;
    });
    y += 20;
  }

  // 页脚
  ctx.fillStyle = textSub;
  ctx.font = `400 22px ${FONT_STACK}`;
  ctx.fillText(
    '数据来自本地记录 · 个人生产力资产负债表',
    pad,
    h - pad + 6
  );
  ctx.textAlign = 'right';
  ctx.fillText(`${sheet.period.start} ~ ${sheet.period.end}`, w - pad, h - pad + 6);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

export function downloadShareImage(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
