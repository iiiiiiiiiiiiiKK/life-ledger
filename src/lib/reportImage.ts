/**
 * 周报图片导出：把周报关键内容渲染成 PNG（Canvas 本地绘制，不经过任何服务器）。
 * 与分享图不同，这里呈现的是完整周报结构（总量 / 分配 / 活动 / 目标 / 建议）。
 */
import type { WeeklyReport } from './reports';
import { formatMinutes } from './dates';

const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 99
): number {
  const chars = Array.from(text);
  let line = '';
  let lines = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines++;
      line = chars[i];
      if (lines >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function renderReportImage(report: WeeklyReport, title?: string): string {
  const W = 900;
  const H = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建绘图上下文');

  const bg = '#f6f7f9';
  const panel = '#ffffff';
  const border = '#e2e6ec';
  const text = '#111827';
  const soft = '#5b6472';
  const faint = '#8a93a1';
  const accent = '#2563eb';
  const up = '#0f9d58';
  const down = '#d93025';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const pad = 48;
  let y = 72;

  // 标题
  ctx.fillStyle = faint;
  ctx.font = `500 20px ${FONT_STACK}`;
  ctx.fillText('人生周报', pad, y);
  y += 44;

  ctx.fillStyle = text;
  ctx.font = `800 40px ${FONT_STACK}`;
  const heading = title?.trim() || `${report.period.start} ~ ${report.period.end}`;
  ctx.fillText(heading, pad, y);
  y += 34;

  ctx.fillStyle = faint;
  ctx.font = `400 18px ${FONT_STACK}`;
  ctx.fillText(
    `对比区间 ${report.prevPeriod.start} ~ ${report.prevPeriod.end} · 样本 ${report.sample.recordCount} 条 / ${report.sample.activeDays} 天`,
    pad,
    y
  );
  y += 34;

  if (!report.sample.sufficient) {
    roundRect(ctx, pad, y - 22, W - pad * 2, 40, 8);
    ctx.fillStyle = '#fff8e6';
    ctx.fill();
    ctx.strokeStyle = '#f5d491';
    ctx.stroke();
    ctx.fillStyle = '#8a6d3b';
    ctx.font = `500 16px ${FONT_STACK}`;
    ctx.fillText('样本偏少：以下数字只反映已记录的部分', pad + 14, y + 4);
    y += 44;
  }

  // 核心指标
  const cardH = 130;
  roundRect(ctx, pad, y, W - pad * 2, cardH, 14);
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.stroke();

  const metrics: { label: string; value: string; color: string }[] = [
    { label: '总时长', value: formatMinutes(report.totalMinutes), color: text },
    { label: '时间资产', value: formatMinutes(report.sheet.assetMinutes), color: up },
    { label: '时间负债', value: formatMinutes(report.sheet.liabilityMinutes), color: down },
    { label: '时间净值', value: formatMinutes(report.sheet.netMinutes), color: report.sheet.netMinutes >= 0 ? up : down },
  ];
  const colW = (W - pad * 2 - 48) / 4;
  metrics.forEach((m, i) => {
    const x = pad + 24 + colW * i;
    ctx.fillStyle = faint;
    ctx.font = `500 16px ${FONT_STACK}`;
    ctx.fillText(m.label, x, y + 40);
    ctx.fillStyle = m.color;
    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.fillText(m.value, x, y + 84);
  });
  y += cardH + 36;

  // 时间分配
  ctx.fillStyle = text;
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText('时间分配', pad, y);
  y += 24;

  if (report.categories.length === 0) {
    ctx.fillStyle = faint;
    ctx.font = `400 17px ${FONT_STACK}`;
    ctx.fillText('（本期无记录）', pad, y + 8);
    y += 30;
  } else {
    const maxMinutes = Math.max(...report.categories.map((c) => c.minutes), 1);
    const labelW = 130;
    const barMaxW = W - pad * 2 - labelW - 250;
    for (const c of report.categories.slice(0, 8)) {
      ctx.fillStyle = soft;
      ctx.font = `500 17px ${FONT_STACK}`;
      ctx.fillText(c.name, pad, y + 18);
      const barW = Math.max(4, (c.minutes / maxMinutes) * barMaxW);
      roundRect(ctx, pad + labelW, y + 4, barW, 18, 9);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.fillStyle = text;
      ctx.font = `600 17px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `${formatMinutes(c.minutes)}  ${(c.share * 100).toFixed(1)}%`,
        W - pad,
        y + 19
      );
      ctx.textAlign = 'left';
      y += 30;
    }
    y += 18;
  }

  // 活动排行
  ctx.fillStyle = text;
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText('投入最多的活动', pad, y);
  y += 26;
  if (report.topActivities.length === 0) {
    ctx.fillStyle = faint;
    ctx.font = `400 17px ${FONT_STACK}`;
    ctx.fillText('（本期无记录）', pad, y + 6);
    y += 28;
  } else {
    for (const a of report.topActivities.slice(0, 5)) {
      ctx.fillStyle = faint;
      ctx.font = `700 17px ${FONT_STACK}`;
      ctx.fillText(`${report.topActivities.indexOf(a) + 1}`, pad, y + 16);
      ctx.fillStyle = text;
      ctx.font = `500 17px ${FONT_STACK}`;
      ctx.fillText(a.name, pad + 28, y + 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = soft;
      ctx.fillText(formatMinutes(a.minutes), W - pad, y + 16);
      ctx.textAlign = 'left';
      y += 26;
    }
    y += 18;
  }

  // 目标进度
  if (report.goalProgress.length > 0) {
    ctx.fillStyle = text;
    ctx.font = `700 22px ${FONT_STACK}`;
    ctx.fillText('长期目标进度', pad, y);
    y += 26;
    for (const g of report.goalProgress.slice(0, 4)) {
      ctx.fillStyle = text;
      ctx.font = `500 17px ${FONT_STACK}`;
      ctx.fillText(g.goal.name, pad, y + 14);
      const trackW = 320;
      const trackX = pad + 260;
      roundRect(ctx, trackX, y + 3, trackW, 14, 7);
      ctx.fillStyle = '#eef0f4';
      ctx.fill();
      roundRect(ctx, trackX, y + 3, Math.max(4, Math.min(g.completion, 1) * trackW), 14, 7);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = soft;
      ctx.font = `500 16px ${FONT_STACK}`;
      ctx.fillText(
        `${formatMinutes(g.actualMinutes)} / ${formatMinutes(g.targetMinutes)}`,
        W - pad,
        y + 16
      );
      ctx.textAlign = 'left';
      y += 28;
    }
    y += 18;
  }

  // 观察与建议
  ctx.fillStyle = text;
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText('本期观察', pad, y);
  y += 26;
  ctx.fillStyle = soft;
  ctx.font = `400 16px ${FONT_STACK}`;
  for (const o of report.observations.slice(0, 5)) {
    y = wrapText(ctx, `· ${o}`, pad, y + 6, W - pad * 2, 24, 3);
  }
  y += 14;

  ctx.fillStyle = text;
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText('下周可以试试', pad, y);
  y += 26;
  ctx.fillStyle = soft;
  ctx.font = `400 16px ${FONT_STACK}`;
  for (const s of report.suggestions.slice(0, 4)) {
    y = wrapText(ctx, `· ${s}`, pad, y + 6, W - pad * 2, 24, 3);
  }

  // 页脚
  ctx.fillStyle = faint;
  ctx.font = `400 15px ${FONT_STACK}`;
  ctx.fillText('数据来自本地记录 · 个人生产力资产负债表', pad, H - 40);
  ctx.textAlign = 'right';
  ctx.fillText(report.period.start, W - pad, H - 40);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
