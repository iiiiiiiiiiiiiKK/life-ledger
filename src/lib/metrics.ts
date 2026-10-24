/**
 * 人生财报指标引擎。
 *
 * 设计原则（全部在界面上同步展示）：
 * 1. 只使用用户实际填写的记录，不做任何推断、补全或预测。
 * 2. 资产的判定来自用户为分类设置的「价值判断」（kind），
 *    系统不会自动把休息、娱乐、家庭陪伴判为负债。
 * 3. 每条记录只归入一个桶：负债 > 资产 > 中性（按顺序优先命中），
 *    因此 资产 + 负债 + 中性 = 总时长 恒成立。
 * 4. 这是产品内部的分析口径，不是衡量个人价值的科学公式。
 */

import type {
  BalanceSheet,
  Category,
  CategoryFlow,
  Goal,
  Period,
  TimeRecord,
  DailyPoint,
} from '../types';
import {
  addDays,
  addMonths,
  daysBetween,
  eachDate,
  endOfMonthKey,
  endOfWeekKey,
  isWithin,
  parseLocalDate,
  startOfMonthKey,
  startOfWeekKey,
  toDateKey,
  MINUTES_PER_DAY,
} from './dates';

export type Bucket = 'asset' | 'liability' | 'neutral';

export function classifyRecord(record: TimeRecord, category?: Category): Bucket {
  if (category?.kind === 'liability') return 'liability';
  if (category?.kind === 'asset') return 'asset';
  if (record.relatedToLongTermGoal) return 'asset';
  return 'neutral';
}

export function recordsInPeriod(records: TimeRecord[], start: string, end: string): TimeRecord[] {
  return records.filter((r) => isWithin(r.date, start, end));
}

export function totalMinutes(records: TimeRecord[]): number {
  return records.reduce((sum, r) => sum + Math.max(0, r.durationMinutes), 0);
}

/** 上一个周期：日→前一天，周→上一周，月→上个月，自定义→紧邻的等长区间 */
export function previousPeriod(period: Period): Period {
  const { start, end, kind } = period;
  if (kind === 'day') {
    const prev = addDays(start, -1);
    return { kind, start: prev, end: prev, label: `前一天 ${prev}` };
  }
  if (kind === 'week') {
    const prevStart = addDays(start, -7);
    const prevEnd = addDays(end, -7);
    return { kind, start: prevStart, end: prevEnd, label: `上一周 ${prevStart} ~ ${prevEnd}` };
  }
  if (kind === 'month') {
    const prevStart = startOfMonthKey(addMonths(start, -1));
    const prevEnd = endOfMonthKey(prevStart);
    return { kind, start: prevStart, end: prevEnd, label: `上个月 ${prevStart.slice(0, 7)}` };
  }
  const len = daysBetween(start, end) + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { kind, start: prevStart, end: prevEnd, label: `前一区间 ${prevStart} ~ ${prevEnd}` };
}

export function makePeriod(
  kind: 'day' | 'week' | 'month',
  anchor: string
): Period {
  if (kind === 'day') return { kind, start: anchor, end: anchor, label: `单日 ${anchor}` };
  if (kind === 'week') {
    const start = startOfWeekKey(anchor);
    const end = endOfWeekKey(anchor);
    return { kind, start, end, label: `${start} ~ ${end}` };
  }
  const start = startOfMonthKey(anchor);
  const end = endOfMonthKey(anchor);
  return { kind, start, end, label: `${start.slice(0, 7)}` };
}

export function makeCustomPeriod(start: string, end: string): Period {
  const [s, e] = start <= end ? [start, end] : [end, start];
  return { kind: 'custom', start: s, end: e, label: `${s} ~ ${e}` };
}

function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

function aggregateByCategory(records: TimeRecord[], categories: Category[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + Math.max(0, r.durationMinutes));
  }
  // 保证所有分类都有键，便于对比
  for (const c of categories) if (!map.has(c.id)) map.set(c.id, 0);
  return map;
}

function timeWeighted(records: TimeRecord[], pick: (r: TimeRecord) => number, fallback: number): number {
  const total = totalMinutes(records);
  if (total <= 0) return fallback;
  let sum = 0;
  for (const r of records) sum += pick(r) * Math.max(0, r.durationMinutes);
  return sum / total;
}

export function computeBalanceSheet(
  records: TimeRecord[],
  categories: Category[],
  period: Period,
  prev?: Period
): BalanceSheet {
  const prevPeriod = prev ?? previousPeriod(period);
  const catById = categoryMap(categories);

  const current = recordsInPeriod(records, period.start, period.end);
  const previous = recordsInPeriod(records, prevPeriod.start, prevPeriod.end);

  let assetMinutes = 0;
  let liabilityMinutes = 0;
  let neutralMinutes = 0;
  let goalMinutes = 0;
  let energyEquiv = 0;
  const levelMinutes = { low: 0, medium: 0, high: 0 };

  for (const r of current) {
    const minutes = Math.max(0, r.durationMinutes);
    const bucket = classifyRecord(r, catById.get(r.categoryId));
    if (bucket === 'asset') assetMinutes += minutes;
    else if (bucket === 'liability') liabilityMinutes += minutes;
    else neutralMinutes += minutes;

    if (r.relatedToLongTermGoal) goalMinutes += minutes;

    // 注意力成本：以精力消耗 3 为 1.0 基准的等效小时（分钟口径）
    const energy = Math.min(5, Math.max(1, r.energyCost));
    energyEquiv += minutes * (energy / 3);

    if (energy <= 2) levelMinutes.low += minutes;
    else if (energy === 3) levelMinutes.medium += minutes;
    else levelMinutes.high += minutes;
  }

  const total = assetMinutes + liabilityMinutes + neutralMinutes;
  const prevTotal = totalMinutes(previous);

  const curByCat = aggregateByCategory(current, categories);
  const prevByCat = aggregateByCategory(previous, categories);

  const flows: CategoryFlow[] = categories
    .map((c) => {
      const minutes = curByCat.get(c.id) ?? 0;
      const prevMinutes = prevByCat.get(c.id) ?? 0;
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        kind: c.kind,
        minutes,
        share: total > 0 ? minutes / total : 0,
        prevMinutes,
        deltaMinutes: minutes - prevMinutes,
      };
    })
    .filter((f) => f.minutes > 0 || f.prevMinutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const activeDays = new Set(current.map((r) => r.date)).size;

  return {
    period,
    prevPeriod,
    totalMinutes: total,
    prevTotalMinutes: prevTotal,
    assetMinutes,
    liabilityMinutes,
    neutralMinutes,
    netMinutes: assetMinutes - liabilityMinutes,
    goalMinutes,
    activeDays,
    recordCount: current.length,
    categories: flows,
    attentionCost: energyEquiv,
    attentionByLevel: (['low', 'medium', 'high'] as const).map((level) => ({
      level,
      minutes: levelMinutes[level],
      share: total > 0 ? levelMinutes[level] / total : 0,
    })),
    avgValue: timeWeighted(current, (r) => r.valueScore, 0),
    avgEnergy: timeWeighted(current, (r) => r.energyCost, 0),
  };
}

/** 按日序列（用于趋势图），缺失日期补 0，绝不插值。 */
export function computeDailySeries(
  records: TimeRecord[],
  categories: Category[],
  start: string,
  end: string
): DailyPoint[] {
  const catById = categoryMap(categories);
  const byDate = new Map<string, DailyPoint>();
  for (const date of eachDate(start, end)) {
    byDate.set(date, {
      date,
      totalMinutes: 0,
      assetMinutes: 0,
      liabilityMinutes: 0,
      goalMinutes: 0,
    });
  }
  for (const r of records) {
    const point = byDate.get(r.date);
    if (!point) continue;
    const minutes = Math.max(0, r.durationMinutes);
    point.totalMinutes += minutes;
    const bucket = classifyRecord(r, catById.get(r.categoryId));
    if (bucket === 'asset') point.assetMinutes += minutes;
    if (bucket === 'liability') point.liabilityMinutes += minutes;
    if (r.relatedToLongTermGoal) point.goalMinutes += minutes;
  }
  return [...byDate.values()];
}

/** 长期目标投入趋势（按周的累计分钟） */
export function computeWeeklyGoalTrend(
  records: TimeRecord[],
  weeks = 8,
  anchor: string = toDateKey(new Date())
): { weekStart: string; minutes: number }[] {
  const out: { weekStart: string; minutes: number }[] = [];
  const thisWeek = startOfWeekKey(anchor);
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    const we = addDays(ws, 6);
    const minutes = recordsInPeriod(records, ws, we)
      .filter((r) => r.relatedToLongTermGoal)
      .reduce((s, r) => s + Math.max(0, r.durationMinutes), 0);
    out.push({ weekStart: ws, minutes });
  }
  return out;
}

export interface GoalProgress {
  goal: Goal;
  actualMinutes: number;
  targetMinutes: number;
  /** 周期内按周折算的目标 */
  completion: number;
  periodWeeks: number;
}

export function computeGoalProgress(
  records: TimeRecord[],
  goals: Goal[],
  period: Period
): GoalProgress[] {
  const inPeriod = recordsInPeriod(records, period.start, period.end);
  const periodDays = daysBetween(period.start, period.end) + 1;
  const periodWeeks = Math.max(periodDays / 7, 1 / 7);

  return goals
    .filter((g) => g.active)
    .map((goal) => {
      let actual = 0;
      for (const r of inPeriod) {
        const linkedById = r.goalId === goal.id;
        const linkedByCategory =
          !r.goalId && r.relatedToLongTermGoal && r.categoryId === goal.categoryId;
        if (linkedById || linkedByCategory) actual += Math.max(0, r.durationMinutes);
      }
      const targetMinutes = Math.round(goal.targetMinutesPerWeek * periodWeeks);
      return {
        goal,
        actualMinutes: actual,
        targetMinutes,
        completion: targetMinutes > 0 ? actual / targetMinutes : 0,
        periodWeeks,
      };
    });
}

/** 注意力成本分档说明（用于界面解释） */
export const ATTENTION_LEVEL_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '低消耗（精力 1-2）',
  medium: '中消耗（精力 3）',
  high: '高消耗（精力 4-5）',
};

/** 校验：一个周期的记录是否重叠（同一天，分钟区间有交集） */
export function findOverlaps(records: TimeRecord[]): [TimeRecord, TimeRecord][] {
  const result: [TimeRecord, TimeRecord][] = [];
  const byDate = new Map<string, { rec: TimeRecord; start: number; end: number }[]>();

  for (const r of records) {
    if (!r.startTime || r.durationMinutes <= 0) continue;
    const [h, m] = r.startTime.split(':').map(Number);
    const start = h * 60 + m;
    const end = start + r.durationMinutes;
    const list = byDate.get(r.date) ?? [];
    list.push({ rec: r, start, end });
    byDate.set(r.date, list);
  }

  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].start >= sorted[i].end) break;
        result.push([sorted[i].rec, sorted[j].rec]);
      }
    }
  }
  return result;
}

/** 单日内跨午夜记录的实际结束时刻（用于展示） */
export function describeCrossMidnight(record: TimeRecord): string | null {
  if (!record.startTime || record.durationMinutes <= 0) return null;
  const [h, m] = record.startTime.split(':').map(Number);
  const endAbs = h * 60 + m + record.durationMinutes;
  if (endAbs <= MINUTES_PER_DAY) return null;
  const nextDay = addDays(record.date, 1);
  const endMinutes = endAbs % MINUTES_PER_DAY;
  return `次日 ${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}（${nextDay}）`;
}

/** 人类可读的周期描述 */
export function describePeriod(period: Period): string {
  if (period.kind === 'day') return parseLocalDate(period.start).toDateString();
  return period.label;
}
