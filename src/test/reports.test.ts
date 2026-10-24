import { describe, it, expect } from 'vitest';
import { buildWeeklyReport, reportToMarkdown } from '../lib/reports';
import { makePeriod } from '../lib/metrics';
import type { Category, Goal, TimeRecord } from '../types';

const categories: Category[] = [
  { id: 'work', name: '工作与赚钱', color: '#3b82f6', kind: 'asset', isSystem: true },
  { id: 'learning', name: '学习与技能', color: '#8b5cf6', kind: 'asset', isSystem: true },
  { id: 'mindless', name: '无意识消耗', color: '#ef4444', kind: 'liability', isSystem: true },
];

const goals: Goal[] = [
  {
    id: 'g1',
    name: '每周读书',
    categoryId: 'learning',
    targetMinutesPerWeek: 120,
    startDate: '2026-10-01',
    active: true,
    createdAt: 1,
  },
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

describe('周报生成', () => {
  it('零数据时给出提示而不是编造数据', () => {
    const report = buildWeeklyReport([], categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.totalMinutes).toBe(0);
    expect(report.sample.sufficient).toBe(false);
    expect(report.observations.join('')).toContain('没有任何记录');
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it('样本不足时明确提示', () => {
    const records = [rec({ date: '2026-10-19' })];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.sample.sufficient).toBe(false);
    expect(report.sample.note).toContain('样本');
  });

  it('样本充分时 sufficient 为 true', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      rec({ date: `2026-10-${String(19 + i).padStart(2, '0')}` })
    );
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.sample.sufficient).toBe(true);
    expect(report.sample.activeDays).toBe(7);
  });

  it('汇总数字与原始记录一致', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 120 }),
      rec({ categoryId: 'mindless', durationMinutes: 30 }),
      rec({ categoryId: 'work', durationMinutes: 45 }),
    ];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.totalMinutes).toBe(195);
    // learning(120) + work(45) 都是资产分类
    expect(report.sheet.assetMinutes).toBe(165);
    expect(report.liabilityMinutes).toBe(30);
    expect(report.sheet.neutralMinutes).toBe(0);
    expect(report.sheet.netMinutes).toBe(135);
    expect(report.sheet.assetMinutes + report.sheet.liabilityMinutes + report.sheet.neutralMinutes).toBe(
      report.totalMinutes
    );
  });

  it('活动排行榜按时长降序', () => {
    const records = [
      rec({ activityName: '短', durationMinutes: 10 }),
      rec({ activityName: '长', durationMinutes: 120 }),
    ];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.topActivities[0].name).toBe('长');
    expect(report.topActivities[0].minutes).toBe(120);
  });

  it('包含目标进度', () => {
    const records = [
      rec({ categoryId: 'learning', durationMinutes: 60, relatedToLongTermGoal: true, goalId: 'g1' }),
    ];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.goalProgress).toHaveLength(1);
    expect(report.goalProgress[0].actualMinutes).toBe(60);
  });

  it('提示语不把相关性说成因果，也不做预测', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      rec({ date: `2026-10-${String(19 + i).padStart(2, '0')}`, categoryId: 'mindless', durationMinutes: 60 })
    );
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    // 观察段落本身不得出现因果或预测措辞
    expect(report.observations.join(' ')).not.toMatch(/因为|导致|将会|预计|预测|一定会/);
    // 说明段落要显式声明不做因果推断、不做预测
    expect(report.caveats.join('')).toContain('不构成因果结论');
    expect(report.caveats.join('')).toContain('不预测未来表现');
  });

  it('与上一周期对比', () => {
    const records = [
      rec({ date: '2026-10-19', durationMinutes: 60 }),
      rec({ date: '2026-10-13', durationMinutes: 30 }),
    ];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    expect(report.totalMinutes).toBe(60);
    expect(report.prevTotalMinutes).toBe(30);
    expect(report.deltaMinutes).toBe(30);
  });
});

describe('周报 Markdown 导出', () => {
  it('包含关键章节', () => {
    const records = [rec({ categoryId: 'learning', durationMinutes: 60 })];
    const report = buildWeeklyReport(records, categories, goals, makePeriod('week', '2026-10-23'));
    const md = reportToMarkdown(report);
    expect(md).toContain('# 人生周报');
    expect(md).toContain('## 一、时间总量');
    expect(md).toContain('## 二、时间分配');
    expect(md).toContain('## 三、投入最多的活动');
    expect(md).toContain('## 四、长期目标进度');
    expect(md).toContain('## 五、本期观察');
    expect(md).toContain('## 六、下周可以试试');
    expect(md).toContain('数据说明');
  });

  it('用户自定义文字覆盖自动生成内容', () => {
    const report = buildWeeklyReport([rec({})], categories, goals, makePeriod('week', '2026-10-23'));
    const md = reportToMarkdown(report, {
      title: '我的标题',
      observations: '我自己写的观察',
      suggestions: '我自己写的建议',
      notes: '备忘内容',
    });
    expect(md).toContain('# 我的标题');
    expect(md).toContain('我自己写的观察');
    expect(md).toContain('我自己写的建议');
    expect(md).toContain('备忘内容');
  });
});
