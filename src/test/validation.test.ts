import { describe, it, expect } from 'vitest';
import { draftToRecord, emptyDraft, recordToDraft, validateDraft } from '../lib/validation';
import type { Category, TimeRecord } from '../types';

const categories: Category[] = [
  { id: 'work', name: '工作与赚钱', color: '#3b82f6', kind: 'asset', isSystem: true },
  { id: 'mindless', name: '无意识消耗', color: '#ef4444', kind: 'liability', isSystem: true },
];

function baseDraft(overrides = {}) {
  return { ...emptyDraft('2026-10-23', 'work'), ...overrides };
}

describe('记录校验', () => {
  it('时长为 0 时报错', () => {
    const issues = validateDraft(baseDraft({ durationMinutes: 0 }), categories[0], []);
    expect(issues.some((i) => i.field === 'durationMinutes')).toBe(true);
  });

  it('负数时长报错', () => {
    const issues = validateDraft(baseDraft({ durationMinutes: -30 }), categories[0], []);
    expect(issues.some((i) => i.field === 'durationMinutes')).toBe(true);
  });

  it('超过 24 小时报错', () => {
    const issues = validateDraft(baseDraft({ durationMinutes: 1500 }), categories[0], []);
    expect(issues.some((i) => i.field === 'durationMinutes')).toBe(true);
  });

  it('活动名称为空报错', () => {
    const issues = validateDraft(baseDraft({ activityName: '  ' }), categories[0], []);
    expect(issues.some((i) => i.field === 'activityName')).toBe(true);
  });

  it('非法日期报错', () => {
    const issues = validateDraft(baseDraft({ date: '2026-13-40' }), categories[0], []);
    expect(issues.some((i) => i.field === 'date')).toBe(true);
  });

  it('评分超出范围报错', () => {
    const issues = validateDraft(baseDraft({ valueScore: 9 as any }), categories[0], []);
    expect(issues.some((i) => i.field === 'valueScore')).toBe(true);
  });

  it('起止时间相同报错', () => {
    const issues = validateDraft(
      baseDraft({ mode: 'times', startTime: '09:00', endTime: '09:00' }),
      categories[0],
      []
    );
    expect(issues.some((i) => i.field === 'endTime')).toBe(true);
  });

  it('时间格式非法报错', () => {
    const issues = validateDraft(
      baseDraft({ mode: 'times', startTime: '9am', endTime: '10:00' }),
      categories[0],
      []
    );
    expect(issues.some((i) => i.field === 'startTime')).toBe(true);
  });

  it('重叠时间给出提示', () => {
    const existing: TimeRecord = {
      id: 'existing',
      date: '2026-10-23',
      activityName: '已有记录',
      categoryId: 'work',
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      valueScore: 3,
      energyCost: 3,
      relatedToLongTermGoal: false,
      createdAt: 1,
      updatedAt: 1,
    };
    const issues = validateDraft(
      baseDraft({ mode: 'times', startTime: '09:30', endTime: '10:30' }),
      categories[0],
      [existing]
    );
    const overlapIssue = issues.find((i) => i.field === 'startTime');
    expect(overlapIssue).toBeTruthy();
    expect(overlapIssue?.message).toContain('已有记录');
  });

  it('编辑自身时不与自己比较', () => {
    const existing: TimeRecord = {
      id: 'self',
      date: '2026-10-23',
      activityName: '自己',
      categoryId: 'work',
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      valueScore: 3,
      energyCost: 3,
      relatedToLongTermGoal: false,
      createdAt: 1,
      updatedAt: 1,
    };
    const issues = validateDraft(
      baseDraft({ mode: 'times', startTime: '09:30', endTime: '10:30' }),
      categories[0],
      [existing],
      'self'
    );
    expect(issues.some((i) => i.field === 'startTime')).toBe(false);
  });

  it('合法输入没有错误', () => {
    const issues = validateDraft(
      baseDraft({ activityName: '写代码', durationMinutes: 90 }),
      categories[0],
      []
    );
    expect(issues).toHaveLength(0);
  });
});

describe('草稿与记录转换', () => {
  it('时长模式生成记录', () => {
    const draft = baseDraft({ activityName: '  写代码  ', durationMinutes: 90 });
    const record = draftToRecord(draft, 'x');
    expect(record.durationMinutes).toBe(90);
    expect(record.activityName).toBe('写代码');
    expect(record.startTime).toBeNull();
  });

  it('起止时间模式自动推导时长', () => {
    const draft = baseDraft({ mode: 'times', startTime: '09:00', endTime: '10:30' });
    const record = draftToRecord(draft, 'x');
    expect(record.durationMinutes).toBe(90);
    expect(record.startTime).toBe('09:00');
    expect(record.crossMidnight).toBe(false);
  });

  it('跨午夜记录标记 crossMidnight', () => {
    const draft = baseDraft({ mode: 'times', startTime: '23:00', endTime: '01:00' });
    const record = draftToRecord(draft, 'x');
    expect(record.durationMinutes).toBe(120);
    expect(record.crossMidnight).toBe(true);
  });

  it('记录可以还原为草稿', () => {
    const draft = baseDraft({ mode: 'times', startTime: '09:00', endTime: '10:30', notes: '备注' });
    const record = draftToRecord(draft, 'x');
    const back = recordToDraft(record);
    expect(back.mode).toBe('times');
    expect(back.startTime).toBe('09:00');
    expect(back.notes).toBe('备注');
  });

  it('评分数值被限制在 1-5', () => {
    const draft = baseDraft({ valueScore: 99 as any, energyCost: -4 as any });
    const record = draftToRecord(draft, 'x');
    expect(record.valueScore).toBe(5);
    expect(record.energyCost).toBe(1);
  });
});
