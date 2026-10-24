// CSV 导入 / 导出
// 采用 RFC 4180 转义规则：含逗号、引号、换行的字段用双引号包裹，内部引号翻倍。
import type { Category, TimeRecord } from '../types';
import { isValidDateKey, isValidTimeString, timeToMinutes } from './dates';

export const CSV_COLUMNS = [
  'date',
  'activityName',
  'categoryId',
  'startTime',
  'endTime',
  'durationMinutes',
  'valueScore',
  'energyCost',
  'relatedToLongTermGoal',
  'goalId',
  'notes',
  'id',
  'createdAt',
  'updatedAt',
] as const;

export const CSV_HEADER_LABEL: Record<(typeof CSV_COLUMNS)[number], string> = {
  date: '日期',
  activityName: '活动名称',
  categoryId: '分类ID',
  startTime: '开始时间',
  endTime: '结束时间',
  durationMinutes: '时长（分钟）',
  valueScore: '价值评分',
  energyCost: '精力消耗',
  relatedToLongTermGoal: '关联长期目标',
  goalId: '目标ID',
  notes: '备注',
  id: '记录ID',
  createdAt: '创建时间',
  updatedAt: '更新时间',
};

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recordsToCsv(records: TimeRecord[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = records.map((r) =>
    CSV_COLUMNS.map((c) => escapeField((r as any)[c])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

export interface CsvParseResult {
  records: TimeRecord[];
  errors: string[];
  skipped: number;
}

/** 解析 CSV 文本为记录数组，跳过非法行并报告原因 */
export function parseCsv(text: string, categories: Category[]): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = parseCsvRows(clean);
  if (rows.length === 0) return { records: [], errors: ['文件为空'], skipped: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const indexOf = (name: string, alias: string[]) => {
    const i = header.indexOf(name);
    if (i >= 0) return i;
    return header.findIndex((h) => alias.includes(h));
  };

  const idx = {
    date: indexOf('date', ['日期', 'date']),
    activityName: indexOf('activityname', ['activity', 'activity_name', '活动', '活动名称', 'name']),
    categoryId: indexOf('categoryid', ['category', 'category_id', '分类', '分类id']),
    startTime: indexOf('starttime', ['start', 'start_time', '开始时间']),
    endTime: indexOf('endtime', ['end', 'end_time', '结束时间']),
    durationMinutes: indexOf('durationminutes', ['duration', 'duration_minutes', '时长', '分钟']),
    valueScore: indexOf('valuescore', ['value', 'value_score', '价值', '价值评分']),
    energyCost: indexOf('energycost', ['energy', 'energy_cost', '精力', '精力消耗']),
    relatedToLongTermGoal: indexOf('relatedtolongtermgoal', ['goal_related', 'related', '长期目标']),
    goalId: indexOf('goalid', ['goal_id', '目标id']),
    notes: indexOf('notes', ['note', '备注']),
  };

  if (idx.date < 0) {
    return { records: [], errors: ['未找到「日期」列，请确认第一行包含 date 或 日期'], skipped: 0 };
  }

  const catIds = new Set(categories.map((c) => c.id));
  const records: TimeRecord[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue;

    const get = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '');

    const date = get(idx.date);
    if (!isValidDateKey(date)) {
      errors.push(`第 ${r + 1} 行：日期「${date || '(空)'}」无效，已跳过`);
      skipped++;
      continue;
    }

    const activityName = get(idx.activityName);
    if (!activityName) {
      errors.push(`第 ${r + 1} 行：活动名称为空，已跳过`);
      skipped++;
      continue;
    }

    let categoryId = get(idx.categoryId);
    if (!categoryId) {
      categoryId = 'work';
    }
    if (!catIds.has(categoryId)) {
      errors.push(`第 ${r + 1} 行：分类「${categoryId}」不存在，已按「工作与赚钱」处理`);
      categoryId = 'work';
    }

    const startRaw = get(idx.startTime);
    const endRaw = get(idx.endTime);
    let duration = Number(get(idx.durationMinutes));
    const hasTimes = isValidTimeString(startRaw) && isValidTimeString(endRaw);
    if (hasTimes) {
      const s = timeToMinutes(startRaw);
      const e = timeToMinutes(endRaw);
      const derived = e >= s ? e - s : 24 * 60 - s + e;
      if (!Number.isFinite(duration) || duration <= 0) duration = derived;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`第 ${r + 1} 行：时长无效，已跳过`);
      skipped++;
      continue;
    }
    if (duration > 24 * 60) {
      errors.push(`第 ${r + 1} 行：时长超过 1440 分钟，已按 1440 截断`);
      duration = 24 * 60;
    }

    const clamp = (v: number, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(5, Math.max(1, Math.round(n)));
    };

    const relatedRaw = get(idx.relatedToLongTermGoal);
    const related = ['1', 'true', 'yes', 'y', '是', 'true'].includes(relatedRaw.toLowerCase());

    const now = Date.now();
    records.push({
      id: `rec_import_${now}_${r}`,
      date,
      activityName,
      categoryId,
      startTime: hasTimes ? startRaw : null,
      endTime: hasTimes ? endRaw : null,
      durationMinutes: Math.round(duration),
      crossMidnight: hasTimes && timeToMinutes(endRaw) < timeToMinutes(startRaw),
      valueScore: clamp(Number(get(idx.valueScore)), 3),
      energyCost: clamp(Number(get(idx.energyCost)), 3),
      relatedToLongTermGoal: related,
      goalId: get(idx.goalId) || null,
      notes: get(idx.notes) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { records, errors, skipped };
}

/** 手写的 CSV 行解析器（支持引号包裹、转义双引号、CRLF） */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
