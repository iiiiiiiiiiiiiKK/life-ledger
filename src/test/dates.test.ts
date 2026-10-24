import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  eachDate,
  endOfMonthKey,
  endOfWeekKey,
  formatMinutes,
  isValidDateKey,
  isValidTimeString,
  minutesToTime,
  startOfMonthKey,
  startOfWeekKey,
  timeToMinutes,
  toDateKey,
  durationFromTimes,
  isCrossMidnight,
} from '../lib/dates';

describe('日期工具', () => {
  it('周以周一为起点', () => {
    // 2026-10-23 是周五
    expect(startOfWeekKey('2026-10-23')).toBe('2026-10-19');
    expect(endOfWeekKey('2026-10-23')).toBe('2026-10-25');
  });

  it('周日归属上一个周一', () => {
    // 2026-10-25 是周日
    expect(startOfWeekKey('2026-10-25')).toBe('2026-10-19');
  });

  it('跨月计算正确', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // 闰年
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('月初月末正确', () => {
    expect(startOfMonthKey('2026-10-17')).toBe('2026-10-01');
    expect(endOfMonthKey('2026-10-17')).toBe('2026-10-31');
    expect(endOfMonthKey('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonthKey('2024-02-10')).toBe('2024-02-29');
    expect(endOfMonthKey('2026-12-01')).toBe('2026-12-31');
  });

  it('daysBetween 为含首尾的天数差', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-07')).toBe(6);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });

  it('eachDate 含首尾', () => {
    const days = eachDate('2026-10-01', '2026-10-03');
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(eachDate('2026-10-01', '2026-10-01')).toEqual(['2026-10-01']);
  });

  it('日期字符串校验', () => {
    expect(isValidDateKey('2026-10-23')).toBe(true);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('not-a-date')).toBe(false);
    expect(isValidDateKey('2026-10-23T00:00')).toBe(false);
  });

  it('时间字符串校验与转换', () => {
    expect(isValidTimeString('09:30')).toBe(true);
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('9:30')).toBe(false);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1500)).toBe('01:00'); // 跨天取模
  });

  it('时长推导支持跨午夜', () => {
    expect(durationFromTimes('09:00', '10:30')).toBe(90);
    expect(durationFromTimes('23:00', '01:00')).toBe(120);
    expect(isCrossMidnight('23:00', '01:00')).toBe(true);
    expect(isCrossMidnight('09:00', '10:00')).toBe(false);
  });

  it('格式化时长', () => {
    expect(formatMinutes(0)).toBe('0分钟');
    expect(formatMinutes(60)).toBe('1小时');
    expect(formatMinutes(90)).toBe('1小时30分');
  });

  it('toDateKey 输出本地日期', () => {
    expect(toDateKey(new Date(2026, 9, 23, 23, 30))).toBe('2026-10-23');
    expect(toDateKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});
