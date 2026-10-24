import { describe, it, expect } from 'vitest';
import {
  classifyRecord,
  computeBalanceSheet,
  computeDailySeries,
  computeGoalProgress,
  computeWeeklyGoalTrend,
  findOverlaps,
  makeCustomPeriod,
  makePeriod,
  previousPeriod,
  recordsInPeriod,
} from '../lib/metrics';
import type { Category, Goal, TimeRecord } from '../types';

const categories: Category[] = [
  { id: 'work', name: '工作与赚钱', color: '#3b82f6', kind: 'asset', isSystem: true },
  { id: 'learning', name: '学习与技能', color: '#8b5cf6', kind: 'asset', isSystem: true },
  { id: 'projects', name: '项目与创造', color: '#ec4899', kind: 'asset', isSystem: true },
  { id: 'health', name: '健康与休息', color: '#10b981', kind: 'neutral', isSystem: true },
  { id: 'social', name: '社交与家庭', color: '#f59e0b', kind: 'neutral', isSystem: true },
  { id: 'entertainment', name: '娱乐与放松', color: '#6366f1', kind: 'neutral', isSystem: true },
  { id: 'mindless', name: '无意识消耗', color: '#ef4444', kind: 'liability', isSystem: true },
];

let seq = 0;
function rec(partial: Partial<TimeRecord>): TimeRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    date: '2026-10-19',
    activityName: '活动',
    categoryId: 'work',
    durationMinutes: 60,
    valueScore: 3,
    energyCost: 3,
    relatedToLongTermGoal: false,
    createdAt: seq,
    updatedAt: seq,
    ...partial,
  };
}

describe('分类归属规则', () => {
  it('分类为负债时计为负债', () => {
    const r = rec({ categoryId: 'mindless' });
    expect(classifyRecord(r, categories.find((c) => c.id === 'mindless'))).toBe('liability');
  });

  it('分类为资产时计为资产', () => {
    const r = rec({ categoryId: 'learning' });
    expect(classifyRecord(r, categories.find((c) => c.id === 'learning'))).toBe('asset');
  });

  it('中性分类默认不计入资产或负债', () => {
    const r = rec({ categoryId: 'entertainment' });
    expect(classifyRecord(r, categories.find((c) => c.id === 'entertainment'))).toBe('neutral');
  });

  it('休息与家庭陪伴默认不会被判定为负债', () => {
    const health = rec({ categoryId: 'health' });
    const social = rec({ categoryId: 'social' });
    expect(classifyRecord(health, categories.find((c) => c.id === 'health'))).toBe('neutral');
    expect(classifyRecord(social, categories.find((c) => c.id === 'social'))).toBe('neutral');
  });

  it('中性分类但勾选了长期目标 → 计为资产', () => {
    const r = rec({ categoryId: 'health', relatedToLongTermGoal: true });
    expect(classifyRecord(r, categories.find((c) => c.id === 'health'))).toBe('asset');
  });

  it('负债分类即使勾选长期目标仍然是负债（负债优先）', () => {
    const r = rec({ categoryId: 'mindless', relatedToLongTermGoal: true });
    expect(classifyRecord(r, categories.find((c) => c.id === 'mindless'))).toBe('liability');
  });
});

describe('区间计算', () => {
  it('日/周/月区间边界正确', () => {
    expect(makePeriod('day', '2026-10-23').start).toBe('2026-10-23');
    expect(makePeriod('day', '2026-10-23').end).toBe('2026-10-23');

    const week = makePeriod('week', '2026-10-23');
    expect(week.start).toBe('2026-10-19');
    expect(week.end).toBe('2026-10-25');

    const month = makePeriod('month', '2026-10-23');
    expect(month.start).toBe('2026-10-01');
    expect(month.end).toBe('2026-10-31');
  });

  it('自定义区间会自动排序', () => {
    const p = makeCustomPeriod('2026-10-20', '2026-10-10');
    expect(p.start).toBe('2026-10-10');
    expect(p.end).toBe('2026-10-20');
  });

  it('上一周期：日→昨天，周→上周，月→上月，自定义→等长前区间', () => {
    expect(previousPeriod(makePeriod('day', '2026-10-23')).start).toBe('2026-10-22');

    const weekPrev = previousPeriod(makePeriod('week', '2026-10-23'));
    expect(weekPrev.start).toBe('2026-10-12');
    expect(weekPrev.end).toBe('2026-10-18');

    const monthPrev = previousPeriod(makePeriod('month', '2026-10-23'));
    expect(monthPrev.start).toBe('2026-09-01');
    expect(monthPrev.end).toBe('2026-09-30');

    const customPrev = previousPeriod(makeCustomPeriod('2026-10-10', '2026-10-12'));
    expect(customPrev.start).toBe('2026-10-07');
    expect(customPrev.end).toBe('2026-10-09');
  });

  it('跨月时上一月份正确', () => {
    const monthPrev = previousPeriod(makePeriod('month', '2026-01-15'));
    expect(monthPrev.start).toBe('2025-12-01');
    expect(monthPrev.end).toBe('2025-12-31');
  });

  it('recordsInPeriod 过滤正确', () => {
    const rs = [rec({ date: '2026-10-19' }), rec({ date: '2026-10-25' }), rec({ date: '2026-10-26' })];
    expect(recordsInPeriod(rs, '2026-10-19', '2026-10-25')).toHaveLength(2);
  });
});

describe('人生财报指标', () => {
  it('资产 + 负债 + 中性 = 总时长', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 120 }),
      rec({ categoryId: 'mindless', durationMinutes: 30 }),
      rec({ categoryId: 'entertainment', durationMinutes: 60 }),
      rec({ categoryId: 'health', durationMinutes: 45 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('week', '2026-10-23'));
    expect(sheet.totalMinutes).toBe(255);
    expect(sheet.assetMinutes).toBe(120);
    expect(sheet.liabilityMinutes).toBe(30);
    expect(sheet.neutralMinutes).toBe(105);
    expect(sheet.assetMinutes + sheet.liabilityMinutes + sheet.neutralMinutes).toBe(sheet.totalMinutes);
  });

  it('时间净值 = 资产 − 负债', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 90 }),
      rec({ categoryId: 'mindless', durationMinutes: 30 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('week', '2026-10-23'));
    expect(sheet.netMinutes).toBe(60);
  });

  it('与上期对比计算变化量', () => {
    const records = [
      rec({ date: '2026-10-19', durationMinutes: 60 }),
      rec({ date: '2026-10-13', durationMinutes: 30 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('week', '2026-10-23'));
    expect(sheet.totalMinutes).toBe(60);
    expect(sheet.prevTotalMinutes).toBe(30);
  });

  it('长期目标投入单独统计', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 60, relatedToLongTermGoal: true }),
      rec({ categoryId: 'learning', durationMinutes: 60 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('week', '2026-10-23'));
    expect(sheet.goalMinutes).toBe(60);
  });

  it('零数据时各指标为 0 且不报错', () => {
    const sheet = computeBalanceSheet([], categories, makePeriod('week', '2026-10-23'));
    expect(sheet.totalMinutes).toBe(0);
    expect(sheet.netMinutes).toBe(0);
    expect(sheet.categories).toHaveLength(0);
    expect(sheet.avgValue).toBe(0);
  });

  it('注意力成本按精力加权', () => {
    const records = [
      rec({ durationMinutes: 60, energyCost: 1 }),
      rec({ durationMinutes: 60, energyCost: 5 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('week', '2026-10-23'));
    // (60 * 1/3) + (60 * 5/3) = 20 + 100 = 120
    expect(sheet.attentionCost).toBeCloseTo(120, 5);
    const low = sheet.attentionByLevel.find((a) => a.level === 'low');
    const high = sheet.attentionByLevel.find((a) => a.level === 'high');
    expect(low?.minutes).toBe(60);
    expect(high?.minutes).toBe(60);
  });

  it('按日序列对缺失日期补 0，不插值', () => {
    const records = [rec({ date: '2026-10-19', durationMinutes: 60 })];
    const series = computeDailySeries(records, categories, '2026-10-19', '2026-10-25');
    expect(series).toHaveLength(7);
    expect(series[0].totalMinutes).toBe(60);
    expect(series[1].totalMinutes).toBe(0);
    expect(series[6].totalMinutes).toBe(0);
  });

  it('同一天多条记录都被计入', () => {
    const records = [
      rec({ date: '2026-10-19', durationMinutes: 30 }),
      rec({ date: '2026-10-19', durationMinutes: 45 }),
      rec({ date: '2026-10-19', durationMinutes: 25 }),
    ];
    const sheet = computeBalanceSheet(records, categories, makePeriod('day', '2026-10-19'));
    expect(sheet.totalMinutes).toBe(100);
    expect(sheet.recordCount).toBe(3);
    expect(sheet.activeDays).toBe(1);
  });
});

describe('重叠检测', () => {
  it('检测同一天重叠时间段', () => {
    const records = [
      rec({ date: '2026-10-19', startTime: '09:00', durationMinutes: 60 }),
      rec({ date: '2026-10-19', startTime: '09:30', durationMinutes: 60 }),
    ];
    expect(findOverlaps(records)).toHaveLength(1);
  });

  it('相邻不重叠', () => {
    const records = [
      rec({ date: '2026-10-19', startTime: '09:00', durationMinutes: 60 }),
      rec({ date: '2026-10-19', startTime: '10:00', durationMinutes: 60 }),
    ];
    expect(findOverlaps(records)).toHaveLength(0);
  });

  it('不同日期不重叠', () => {
    const records = [
      rec({ date: '2026-10-19', startTime: '09:00', durationMinutes: 60 }),
      rec({ date: '2026-10-20', startTime: '09:00', durationMinutes: 60 }),
    ];
    expect(findOverlaps(records)).toHaveLength(0);
  });
});

describe('目标进度', () => {
  const goals: Goal[] = [
    {
      id: 'g1',
      name: '每周读书',
      categoryId: 'learning',
      targetMinutesPerWeek: 300,
      startDate: '2026-10-01',
      active: true,
      createdAt: 1,
    },
  ];

  it('按 goalId 精确匹配', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 120, relatedToLongTermGoal: true, goalId: 'g1' }),
    ];
    const progress = computeGoalProgress(records, goals, makePeriod('week', '2026-10-23'));
    expect(progress[0].actualMinutes).toBe(120);
    expect(progress[0].targetMinutes).toBe(300);
    expect(progress[0].completion).toBeCloseTo(0.4, 5);
  });

  it('未指定目标时按分类匹配', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 60, relatedToLongTermGoal: true, goalId: null }),
    ];
    const progress = computeGoalProgress(records, goals, makePeriod('week', '2026-10-23'));
    expect(progress[0].actualMinutes).toBe(60);
  });

  it('暂停的目标不计入统计', () => {
    const paused = [{ ...goals[0], active: false }];
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 60, relatedToLongTermGoal: true, goalId: 'g1' }),
    ];
    expect(computeGoalProgress(records, paused, makePeriod('week', '2026-10-23'))).toHaveLength(0);
  });

  it('月度区间按周数折算目标', () => {
    const progress = computeGoalProgress([], goals, makePeriod('month', '2026-10-23'));
    // 10 月 31 天 ≈ 4.43 周
    expect(progress[0].targetMinutes).toBeGreaterThan(300);
    expect(progress[0].periodWeeks).toBeCloseTo(31 / 7, 5);
  });
});

describe('目标投入趋势', () => {
  it('按周聚合，缺失周为 0', () => {
    const records = [rec({ date: '2026-10-19', relatedToLongTermGoal: true, durationMinutes: 90 })];
    const trend = computeWeeklyGoalTrend(records, 4, '2026-10-23');
    expect(trend).toHaveLength(4);
    expect(trend[trend.length - 1].minutes).toBe(90);
    expect(trend[0].minutes).toBe(0);
  });
});
