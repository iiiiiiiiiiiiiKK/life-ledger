/**
 * 日期工具：全部以「本地日期字符串 YYYY-MM-DD」为准，
 * 避免 UTC 偏移导致跨时区/跨月统计错位。
 */

export const MINUTES_PER_DAY = 24 * 60;
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 把 YYYY-MM-DD 解析为本地时间当天 12:00（规避 DST 边界） */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function isValidDateKey(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseLocalDate(s);
  return toDateKey(d) === s;
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function addMonths(dateStr: string, months: number): string {
  const d = parseLocalDate(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toDateKey(d);
}

/** 周一为一周起点（ISO 8601） */
export function startOfWeekKey(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
}

export function endOfWeekKey(dateStr: string): string {
  return addDays(startOfWeekKey(dateStr), 6);
}

export function startOfMonthKey(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function endOfMonthKey(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${dateStr.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function daysBetween(start: string, end: string): number {
  const a = parseLocalDate(start).getTime();
  const b = parseLocalDate(end).getTime();
  return Math.round((b - a) / 86400000);
}

/** 含首尾的日期区间列表 */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 2000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

export function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function formatShortDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatLongDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}`;
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

// ── 时间字符串 ──

export function isValidTimeString(s: string): boolean {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const norm = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

/** 由起止时间推导时长（分钟），支持跨午夜 */
export function durationFromTimes(startTime: string, endTime: string): number {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return e >= s ? e - s : MINUTES_PER_DAY - s + e;
}

export function isCrossMidnight(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) < timeToMinutes(startTime);
}

/**
 * 把一条记录展开为「绝对分钟区间」，以 date 当天 00:00 为 0。
 * 跨午夜记录的第二段落在次日。
 */
export function recordSegments(
  _date: string,
  startTime: string,
  durationMinutes: number
): { start: number; end: number }[] {
  const startAbs = timeToMinutes(startTime);
  const endAbs = startAbs + durationMinutes;
  if (endAbs <= MINUTES_PER_DAY) return [{ start: startAbs, end: endAbs }];
  const segs = [{ start: startAbs, end: MINUTES_PER_DAY }];
  let rest = endAbs - MINUTES_PER_DAY;
  let cursorDay = 1;
  while (rest > 0) {
    const chunk = Math.min(rest, MINUTES_PER_DAY);
    segs.push({ start: cursorDay * MINUTES_PER_DAY, end: cursorDay * MINUTES_PER_DAY + chunk });
    rest -= chunk;
    cursorDay++;
  }
  return segs;
}

// ── 格式化 ──

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}分钟`;
  if (mm === 0) return `${h}小时`;
  return `${h}小时${mm}分`;
}

export function formatHours(minutes: number, digits = 1): string {
  return (minutes / 60).toFixed(digits);
}

/** 带符号的时长差异 */
export function formatDelta(minutes: number): string {
  const abs = Math.abs(minutes);
  const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : '±';
  if (abs === 0) return '持平';
  return `${sign}${formatMinutes(abs)}`;
}

export function percent(part: number, total: number, digits = 0): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(digits)}%`;
}
