// 周报生成：只基于真实记录，样本不足时明确提示，不做因果或预测表述
import type {
  BalanceSheet,
  Category,
  Goal,
  Period,
  TimeRecord,
  CategoryFlow,
} from '../types';
import {
  computeBalanceSheet,
  computeGoalProgress,
  previousPeriod,
  recordsInPeriod,
} from './metrics';
import type { GoalProgress } from './metrics';
import { daysBetween, formatMinutes, percent } from './dates';

export interface TopActivity {
  name: string;
  categoryId: string;
  categoryName: string;
  color: string;
  minutes: number;
  share: number;
  recordCount: number;
}

export interface WeeklyReport {
  period: Period;
  prevPeriod: Period;
  generatedAt: number;

  /** 样本充分度（用于提示，不影响计算） */
  sample: {
    recordCount: number;
    activeDays: number;
    periodDays: number;
    sufficient: boolean;
    note: string;
  };

  totalMinutes: number;
  prevTotalMinutes: number;
  deltaMinutes: number;

  sheet: BalanceSheet;
  categories: CategoryFlow[];
  topActivities: TopActivity[];
  goalProgress: GoalProgress[];

  /** 用户自己标记为负债（低价值重复/无意识消耗）的时间 */
  liabilityMinutes: number;
  liabilityShare: number;

  /** 自动生成的观察（描述性，非因果，非预测） */
  observations: string[];
  /** 可尝试的调整建议（明确的启发式，不是承诺） */
  suggestions: string[];
  /** 数据局限说明 */
  caveats: string[];
}

const SUFFICIENT_DAYS = 4;
const SUFFICIENT_RECORDS = 7;

export function buildWeeklyReport(
  records: TimeRecord[],
  categories: Category[],
  goals: Goal[],
  period: Period,
  now = Date.now()
): WeeklyReport {
  const prevPeriod = previousPeriod(period);
  const sheet = computeBalanceSheet(records, categories, period, prevPeriod);
  const inPeriod = recordsInPeriod(records, period.start, period.end);
  const periodDays = daysBetween(period.start, period.end) + 1;
  const activeDays = sheet.activeDays;

  const catById = new Map(categories.map((c) => [c.id, c]));

  // 活动排行
  const byActivity = new Map<string, TopActivity>();
  for (const r of inPeriod) {
    const key = `${r.categoryId}::${r.activityName.trim()}`;
    const cat = catById.get(r.categoryId);
    const existing = byActivity.get(key);
    if (existing) {
      existing.minutes += Math.max(0, r.durationMinutes);
      existing.recordCount += 1;
    } else {
      byActivity.set(key, {
        name: r.activityName.trim(),
        categoryId: r.categoryId,
        categoryName: cat?.name ?? r.categoryId,
        color: cat?.color ?? '#94a3b8',
        minutes: Math.max(0, r.durationMinutes),
        share: 0,
        recordCount: 1,
      });
    }
  }
  const total = sheet.totalMinutes;
  const topActivities = [...byActivity.values()]
    .map((a) => ({ ...a, share: total > 0 ? a.minutes / total : 0 }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6);

  const goalProgress = computeGoalProgress(records, goals, period);

  const sufficient = activeDays >= SUFFICIENT_DAYS && sheet.recordCount >= SUFFICIENT_RECORDS;
  const sampleNote = sufficient
    ? `本期覆盖 ${activeDays}/${periodDays} 天，共 ${sheet.recordCount} 条记录，样本量足以做描述性复盘。`
    : `本期仅覆盖 ${activeDays}/${periodDays} 天，共 ${sheet.recordCount} 条记录。样本偏少，以下数字只反映已记录的部分，不代表整周真实分布。`;

  const observations: string[] = [];
  const suggestions: string[] = [];
  const caveats: string[] = [
    '所有指标来自你自己填写的时间记录，未记录的时段不会被推算。',
    '资产/负债是按你为分类设置的价值判断聚合出来的内部口径，不是对个人价值的评价。',
    '本期与上期的差异是描述性对比，不构成因果结论，也不预测未来表现。',
  ];

  if (sheet.recordCount === 0) {
    observations.push('本期没有任何记录，无法生成分析。');
    suggestions.push('先完成几次 10 秒即可录入的记录，下周的复盘才有依据。');
  } else {
    observations.push(
      `本期共记录 ${formatMinutes(sheet.totalMinutes)}，其中资产 ${formatMinutes(sheet.assetMinutes)}、负债 ${formatMinutes(sheet.liabilityMinutes)}、中性 ${formatMinutes(sheet.neutralMinutes)}。`
    );
    if (topActivities[0]) {
      const top = topActivities[0];
      observations.push(
        `投入最多的活动是「${top.name}」（${top.categoryName}），${formatMinutes(top.minutes)}，占本期记录的 ${percent(top.minutes, total)}。`
      );
    }
    const delta = sheet.totalMinutes - sheet.prevTotalMinutes;
    if (sheet.prevTotalMinutes > 0) {
      observations.push(
        `与上一周期（${formatMinutes(sheet.prevTotalMinutes)}）相比，记录总量${delta === 0 ? '持平' : delta > 0 ? `增加 ${formatMinutes(delta)}` : `减少 ${formatMinutes(Math.abs(delta))}`}。`
      );
    } else {
      observations.push('上一周期没有记录，无法做环比对比。');
    }

    // 结构变化最大的分类
    const changed = sheet.categories
      .filter((c) => c.prevMinutes > 0 || c.minutes > 0)
      .map((c) => ({ ...c, absDelta: Math.abs(c.deltaMinutes) }))
      .sort((a, b) => b.absDelta - a.absDelta)[0];
    if (changed && changed.absDelta > 0) {
      observations.push(
        `变化最大的是「${changed.name}」：本周期 ${formatMinutes(changed.minutes)}，上周期 ${formatMinutes(changed.prevMinutes)}（${changed.deltaMinutes > 0 ? '+' : ''}${formatMinutes(changed.deltaMinutes)}）。`
      );
    }

    if (sheet.goalMinutes > 0) {
      observations.push(`标记为服务长期目标的时间共 ${formatMinutes(sheet.goalMinutes)}，占本期 ${percent(sheet.goalMinutes, total)}。`);
    } else {
      observations.push('本期没有标记为服务长期目标的时间。');
    }

    const done = goalProgress.filter((g) => g.targetMinutes > 0 && g.actualMinutes >= g.targetMinutes);
    if (goalProgress.length > 0) {
      observations.push(
        `在 ${goalProgress.length} 个进行中的目标里，${done.length} 个达到本周期折算目标。`
      );
    }

    // 建议：基于真实数据的启发式，不承诺效果
    const liabilityShare = total > 0 ? sheet.liabilityMinutes / total : 0;
    if (liabilityShare >= 0.2) {
      suggestions.push(
        `负债类时间占 ${percent(sheet.liabilityMinutes, total)}（${formatMinutes(sheet.liabilityMinutes)}）。可以只挑其中一段固定出现的时间，试着替换成一件 15 分钟就能启动的小事。`
      );
    }
    if (sheet.prevTotalMinutes > 0 && total < sheet.prevTotalMinutes * 0.6) {
      suggestions.push('本期记录量比上期少很多。若确实是记录变少而非投入变少，可以考虑把录入固定在每天的同一个时刻。');
    }
    const lagging = goalProgress.filter((g) => g.targetMinutes > 0 && g.completion < 0.5);
    if (lagging.length > 0) {
      suggestions.push(
        `${lagging.slice(0, 2).map((g) => `「${g.goal.name}」`).join('、')} 的本期投入低于折算目标的一半。可以把目标周投入下调到更接近现实的水平，或拆成一个更小的下一步。`
      );
    }
    if (!sufficient) {
      suggestions.push('样本偏少时，优先补充记录的完整性，而不是据此大幅调整计划。');
    }
    if (suggestions.length === 0) {
      suggestions.push('本期没有明显异常。可以从「记录准确性」入手：是否有长时间段让你觉得难以归类？');
    }
  }

  return {
    period,
    prevPeriod,
    generatedAt: now,
    sample: {
      recordCount: sheet.recordCount,
      activeDays,
      periodDays,
      sufficient,
      note: sampleNote,
    },
    totalMinutes: sheet.totalMinutes,
    prevTotalMinutes: sheet.prevTotalMinutes,
    deltaMinutes: sheet.totalMinutes - sheet.prevTotalMinutes,
    sheet,
    categories: sheet.categories,
    topActivities,
    goalProgress,
    liabilityMinutes: sheet.liabilityMinutes,
    liabilityShare: total > 0 ? sheet.liabilityMinutes / total : 0,
    observations,
    suggestions,
    caveats,
  };
}

/** 导出为 Markdown（用户编辑后的文本优先） */
export function reportToMarkdown(
  report: WeeklyReport,
  custom?: { title?: string; observations?: string; suggestions?: string; notes?: string }
): string {
  const lines: string[] = [];
  const title = custom?.title?.trim() || `人生周报 ${report.period.start} ~ ${report.period.end}`;
  lines.push(`# ${title}`, '');
  lines.push(`> 数据区间：${report.period.start} ~ ${report.period.end}（对比：${report.prevPeriod.start} ~ ${report.prevPeriod.end}）`);
  lines.push(`> 生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}`, '');

  lines.push('## 一、时间总量', '');
  lines.push(`| 项目 | 本周期 | 上一周期 |`, `| --- | --- | --- |`);
  lines.push(`| 总记录时长 | ${formatMinutes(report.totalMinutes)} | ${formatMinutes(report.prevTotalMinutes)} |`);
  lines.push(`| 时间资产 | ${formatMinutes(report.sheet.assetMinutes)} | — |`);
  lines.push(`| 时间负债 | ${formatMinutes(report.sheet.liabilityMinutes)} | — |`);
  lines.push(`| 中性时间 | ${formatMinutes(report.sheet.neutralMinutes)} | — |`);
  lines.push(`| 时间净值 | ${formatMinutes(report.sheet.netMinutes)} | — |`);
  lines.push(`| 长期目标投入 | ${formatMinutes(report.sheet.goalMinutes)} | — |`, '');

  lines.push('## 二、时间分配', '');
  if (report.categories.length === 0) {
    lines.push('（本期无记录）', '');
  } else {
    lines.push('| 分类 | 时长 | 占比 | 较上期 |', '| --- | --- | --- | --- |');
    for (const c of report.categories) {
      const delta = c.deltaMinutes;
      lines.push(
        `| ${c.name} | ${formatMinutes(c.minutes)} | ${(c.share * 100).toFixed(1)}% | ${delta > 0 ? '+' : ''}${formatMinutes(delta)} |`
      );
    }
    lines.push('');
  }

  lines.push('## 三、投入最多的活动', '');
  if (report.topActivities.length === 0) lines.push('（本期无记录）', '');
  else {
    report.topActivities.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.name}（${a.categoryName}）— ${formatMinutes(a.minutes)}，占 ${(a.share * 100).toFixed(1)}%`);
    });
    lines.push('');
  }

  lines.push('## 四、长期目标进度', '');
  if (report.goalProgress.length === 0) lines.push('（尚未创建长期目标）', '');
  else {
    lines.push('| 目标 | 实际投入 | 本周期折算目标 | 完成度 |', '| --- | --- | --- | --- |');
    for (const g of report.goalProgress) {
      lines.push(
        `| ${g.goal.name} | ${formatMinutes(g.actualMinutes)} | ${formatMinutes(g.targetMinutes)} | ${(g.completion * 100).toFixed(0)}% |`
      );
    }
    lines.push('');
  }

  const obs = custom?.observations?.trim() || report.observations.map((o) => `- ${o}`).join('\n');
  lines.push('## 五、本期观察', '', obs, '');

  const sug = custom?.suggestions?.trim() || report.suggestions.map((s) => `- ${s}`).join('\n');
  lines.push('## 六、下周可以试试', '', sug, '');

  if (custom?.notes?.trim()) {
    lines.push('## 七、我的补充', '', custom.notes.trim(), '');
  }

  lines.push('---', '');
  lines.push('**数据说明**', '');
  report.caveats.forEach((c) => lines.push(`- ${c}`));
  lines.push(`- 样本：${report.sample.note}`);
  lines.push('- 本报告由本地记录自动生成，无云端上传。');
  return lines.join('\n');
}
