/**
 * 验收测试：模拟真实录入场景，核对汇总数字与原始记录一致。
 */
import { describe, it, expect } from 'vitest';
import { computeBalanceSheet, computeDailySeries, computeGoalProgress, makePeriod } from '../lib/metrics';
import { buildWeeklyReport } from '../lib/reports';
import { classifyRecord, findOverlaps } from '../lib/metrics';
import { draftToRecord, emptyDraft, validateDraft } from '../lib/validation';
import { SYSTEM_CATEGORIES } from '../types';
import type { Goal, TimeRecord } from '../types';

let seq = 0;
function makeRecord(
  date: string,
  activityName: string,
  categoryId: string,
  durationMinutes: number,
  extra: Partial<TimeRecord> = {}
): TimeRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    date,
    activityName,
    categoryId,
    durationMinutes,
    valueScore: 3,
    energyCost: 3,
    relatedToLongTermGoal: false,
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

describe('验收场景：汇总数字与原始记录一致', () => {
  const records: TimeRecord[] = [
    // 同一天多条
    makeRecord('2026-10-19', '写代码', 'work', 120),
    makeRecord('2026-10-19', '刷手机', 'mindless', 45),
    makeRecord('2026-10-19', '散步', 'health', 30),
    // 同一天第三条
    makeRecord('2026-10-20', '读技术书', 'learning', 60, { relatedToLongTermGoal: true, goalId: 'g1' }),
    makeRecord('2026-10-21', '和家人吃饭', 'social', 90),
    makeRecord('2026-10-22', '看电影', 'entertainment', 120),
    // 上周
    makeRecord('2026-10-13', '写代码', 'work', 60),
    makeRecord('2026-10-14', '刷手机', 'mindless', 30),
    // 跨午夜
    makeRecord('2026-10-23', '夜跑', 'health', 120, {
      startTime: '23:00',
      endTime: '01:00',
      crossMidnight: true,
    }),
  ];

  const goals: Goal[] = [
    {
      id: 'g1',
      name: '技术学习',
      categoryId: 'learning',
      targetMinutesPerWeek: 120,
      startDate: '2026-10-01',
      active: true,
      createdAt: 1,
    },
  ];

  const week = makePeriod('week', '2026-10-23'); // 2026-10-19 ~ 2026-10-25

  it('本周总时长等于本周所有记录时长之和', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    const manual = records
      .filter((r) => r.date >= '2026-10-19' && r.date <= '2026-10-25')
      .reduce((s, r) => s + r.durationMinutes, 0);
    expect(sheet.totalMinutes).toBe(manual);
    expect(manual).toBe(120 + 45 + 30 + 60 + 90 + 120 + 120);
  });

  it('资产 + 负债 + 中性 = 总时长', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    expect(sheet.assetMinutes + sheet.liabilityMinutes + sheet.neutralMinutes).toBe(sheet.totalMinutes);
  });

  it('分类明细之和等于总时长', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    const sum = sheet.categories.reduce((s, c) => s + c.minutes, 0);
    expect(sum).toBe(sheet.totalMinutes);
  });

  it('与上周对比正确', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    const prevManual = records
      .filter((r) => r.date >= '2026-10-12' && r.date <= '2026-10-18')
      .reduce((s, r) => s + r.durationMinutes, 0);
    expect(sheet.prevTotalMinutes).toBe(prevManual);
    expect(sheet.prevTotalMinutes).toBe(90);
    expect(sheet.totalMinutes - sheet.prevTotalMinutes).toBe(495);
  });

  it('各分类占比之和为 100%', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    const share = sheet.categories.reduce((s, c) => s + c.share, 0);
    expect(share).toBeCloseTo(1, 6);
  });

  it('注意力成本分档之和等于总时长', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    const sum = sheet.attentionByLevel.reduce((s, a) => s + a.minutes, 0);
    expect(sum).toBe(sheet.totalMinutes);
  });

  it('长期目标投入与目标进度一致', () => {
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    expect(sheet.goalMinutes).toBe(60);

    const progress = computeGoalProgress(records, goals, week);
    expect(progress[0].actualMinutes).toBe(60);
    expect(progress[0].targetMinutes).toBe(120);
    expect(progress[0].completion).toBeCloseTo(0.5, 6);
  });

  it('日统计：跨午夜记录计入开始日', () => {
    const day = makePeriod('day', '2026-10-23');
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, day);
    expect(sheet.totalMinutes).toBe(120);
    expect(sheet.recordCount).toBe(1);
  });

  it('月统计：覆盖 2026-10-19 到 10-23 的所有记录', () => {
    const month = makePeriod('month', '2026-10-23');
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, month);
    const manual = records
      .filter((r) => r.date.startsWith('2026-10'))
      .reduce((s, r) => s + r.durationMinutes, 0);
    expect(sheet.totalMinutes).toBe(manual);
  });

  it('自定义区间：10-19 到 10-21', () => {
    const custom = { kind: 'custom' as const, start: '2026-10-19', end: '2026-10-21', label: '' };
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, custom);
    expect(sheet.totalMinutes).toBe(120 + 45 + 30 + 60 + 90);
  });

  it('每日序列之和等于总时长', () => {
    const series = computeDailySeries(records, SYSTEM_CATEGORIES, week.start, week.end);
    const sum = series.reduce((s, d) => s + d.totalMinutes, 0);
    expect(sum).toBe(computeBalanceSheet(records, SYSTEM_CATEGORIES, week).totalMinutes);
    expect(series).toHaveLength(7);
  });

  it('周报汇总与财报一致', () => {
    const report = buildWeeklyReport(records, SYSTEM_CATEGORIES, goals, week);
    const sheet = computeBalanceSheet(records, SYSTEM_CATEGORIES, week);
    expect(report.totalMinutes).toBe(sheet.totalMinutes);
    expect(report.liabilityMinutes).toBe(sheet.liabilityMinutes);
    expect(report.sheet.netMinutes).toBe(sheet.netMinutes);
  });

  it('周报活动排行时长之和不超过总时长', () => {
    const report = buildWeeklyReport(records, SYSTEM_CATEGORIES, goals, week);
    const sum = report.topActivities.reduce((s, a) => s + a.minutes, 0);
    expect(sum).toBeLessThanOrEqual(report.totalMinutes);
  });

  it('重叠检测能发现同一天的重叠', () => {
    const overlapping = [
      makeRecord('2026-10-23', 'A', 'work', 60, { startTime: '09:00' }),
      makeRecord('2026-10-23', 'B', 'work', 60, { startTime: '09:30' }),
    ];
    expect(findOverlaps(overlapping)).toHaveLength(1);
    expect(findOverlaps(records)).toHaveLength(0);
  });

  it('录入流程：草稿校验 → 生成记录 → 计入统计', () => {
    const draft = {
      ...emptyDraft('2026-10-23', 'learning'),
      activityName: '学 TypeScript',
      durationMinutes: 45,
      valueScore: 5,
      energyCost: 3,
      relatedToLongTermGoal: true,
    };
    const issues = validateDraft(draft, SYSTEM_CATEGORIES.find((c) => c.id === 'learning'), []);
    expect(issues).toHaveLength(0);

    const record = draftToRecord(draft, 'new-1');
    const bucket = classifyRecord(record, SYSTEM_CATEGORIES.find((c) => c.id === 'learning'));
    expect(bucket).toBe('asset');

    const sheet = computeBalanceSheet([record], SYSTEM_CATEGORIES, makePeriod('day', '2026-10-23'));
    expect(sheet.assetMinutes).toBe(45);
    expect(sheet.goalMinutes).toBe(45);
    expect(sheet.netMinutes).toBe(45);
  });

  it('零数据状态：所有指标为 0 且无异常', () => {
    const sheet = computeBalanceSheet([], SYSTEM_CATEGORIES, week);
    expect(sheet.totalMinutes).toBe(0);
    expect(sheet.assetMinutes).toBe(0);
    expect(sheet.liabilityMinutes).toBe(0);
    expect(sheet.netMinutes).toBe(0);
    expect(sheet.attentionCost).toBe(0);
    expect(sheet.categories).toHaveLength(0);
    expect(sheet.activeDays).toBe(0);
  });
});
