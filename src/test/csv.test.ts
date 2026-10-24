import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvRows, recordsToCsv } from '../lib/csv';
import type { Category, TimeRecord } from '../types';

const categories: Category[] = [
  { id: 'work', name: '工作与赚钱', color: '#3b82f6', kind: 'asset', isSystem: true },
  { id: 'mindless', name: '无意识消耗', color: '#ef4444', kind: 'liability', isSystem: true },
];

function rec(partial: Partial<TimeRecord>): TimeRecord {
  return {
    id: 'r1',
    date: '2026-10-23',
    activityName: '写代码',
    categoryId: 'work',
    durationMinutes: 60,
    valueScore: 3,
    energyCost: 3,
    relatedToLongTermGoal: false,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('CSV 行解析', () => {
  it('解析普通行', () => {
    expect(parseCsvRows('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('处理引号包裹的逗号', () => {
    expect(parseCsvRows('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('处理转义双引号', () => {
    expect(parseCsvRows('a,"b""c"')).toEqual([['a', 'b"c']]);
  });

  it('处理 CRLF', () => {
    expect(parseCsvRows('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('处理换行字段', () => {
    expect(parseCsvRows('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });
});

describe('CSV 导出', () => {
  it('包含表头与全部列', () => {
    const csv = recordsToCsv([rec({})]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('date');
    expect(lines[0]).toContain('durationMinutes');
    expect(lines).toHaveLength(2);
  });

  it('含逗号的字段被引号包裹', () => {
    const csv = recordsToCsv([rec({ activityName: '写代码, 调试' })]);
    expect(csv).toContain('"写代码, 调试"');
  });
});

describe('CSV 导入', () => {
  it('解析基本记录', () => {
    const csv = [
      'date,activityName,categoryId,durationMinutes,valueScore,energyCost,relatedToLongTermGoal',
      '2026-10-23,写代码,work,90,4,3,true',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].durationMinutes).toBe(90);
    expect(result.records[0].relatedToLongTermGoal).toBe(true);
    expect(result.records[0].valueScore).toBe(4);
  });

  it('支持中文列名', () => {
    const csv = ['日期,活动名称,分类ID,时长,价值,精力', '2026-10-23,读书,work,45,5,2'].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].activityName).toBe('读书');
    expect(result.records[0].durationMinutes).toBe(45);
  });

  it('从起止时间推导时长', () => {
    const csv = [
      'date,activityName,categoryId,startTime,endTime',
      '2026-10-23,夜跑,mindless,23:00,01:00',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records[0].durationMinutes).toBe(120);
    expect(result.records[0].crossMidnight).toBe(true);
  });

  it('非法日期被跳过并报告', () => {
    const csv = [
      'date,activityName,categoryId,durationMinutes',
      '2026-13-45,坏记录,work,60',
      '2026-10-23,好记录,work,60',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('第 2 行');
  });

  it('时长无效被跳过', () => {
    const csv = [
      'date,activityName,categoryId,durationMinutes',
      '2026-10-23,坏时长,work,abc',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('未知分类降级并提示', () => {
    const csv = [
      'date,activityName,categoryId,durationMinutes',
      '2026-10-23,记录,unknown-cat,60',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].categoryId).toBe('work');
    expect(result.errors[0]).toContain('不存在');
  });

  it('超过 24 小时的时长被截断', () => {
    const csv = [
      'date,activityName,categoryId,durationMinutes',
      '2026-10-23,超长,work,2000',
    ].join('\n');
    const result = parseCsv(csv, categories);
    expect(result.records[0].durationMinutes).toBe(1440);
    expect(result.errors[0]).toContain('1440');
  });

  it('缺少日期列时报错', () => {
    const result = parseCsv('name,minutes\nabc,60', categories);
    expect(result.records).toHaveLength(0);
    expect(result.errors[0]).toContain('日期');
  });

  it('导出的 CSV 可以被重新导入', () => {
    const original = [rec({ activityName: '写代码, 调试', notes: '含"引号"' })];
    const csv = recordsToCsv(original);
    const result = parseCsv(csv, categories);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].activityName).toBe('写代码, 调试');
    expect(result.records[0].notes).toBe('含"引号"');
  });
});
