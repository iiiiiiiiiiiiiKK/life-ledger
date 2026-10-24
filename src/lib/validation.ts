// 记录校验：异常输入、负数时长、重叠时间
import type { Category, EnergyCost, TimeRecord, ValueScore } from '../types';
import { durationFromTimes, isCrossMidnight, isValidDateKey, isValidTimeString, MINUTES_PER_DAY } from './dates';
import { findOverlaps } from './metrics';

export interface DraftRecord {
  date: string;
  activityName: string;
  categoryId: string;
  mode: 'duration' | 'times';
  durationMinutes: number | '';
  startTime: string;
  endTime: string;
  valueScore: number;
  energyCost: number;
  relatedToLongTermGoal: boolean;
  goalId?: string | null;
  notes?: string;
}

export interface ValidationIssue {
  field: keyof DraftRecord | 'general';
  message: string;
}

export const MAX_DURATION_MINUTES = 24 * 60;

export function emptyDraft(date: string, categoryId = 'work'): DraftRecord {
  return {
    date,
    activityName: '',
    categoryId,
    mode: 'duration',
    durationMinutes: 60,
    startTime: '',
    endTime: '',
    valueScore: 3,
    energyCost: 3,
    relatedToLongTermGoal: false,
    goalId: null,
    notes: '',
  };
}

export function draftToRecord(
  draft: DraftRecord,
  id: string,
  now = Date.now()
): TimeRecord {
  const hasTimes = draft.mode === 'times' && isValidTimeString(draft.startTime) && isValidTimeString(draft.endTime);
  const duration = hasTimes
    ? durationFromTimes(draft.startTime, draft.endTime)
    : Number(draft.durationMinutes) || 0;

  return {
    id,
    date: draft.date,
    activityName: draft.activityName.trim(),
    categoryId: draft.categoryId,
    startTime: hasTimes ? draft.startTime : null,
    endTime: hasTimes ? draft.endTime : null,
    durationMinutes: duration,
    crossMidnight: hasTimes ? isCrossMidnight(draft.startTime, draft.endTime) : false,
    valueScore: clampScore(draft.valueScore) as ValueScore,
    energyCost: clampScore(draft.energyCost) as EnergyCost,
    relatedToLongTermGoal: draft.relatedToLongTermGoal,
    goalId: draft.goalId ?? null,
    notes: draft.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function recordToDraft(record: TimeRecord): DraftRecord {
  const useTimes = Boolean(record.startTime && record.endTime);
  return {
    date: record.date,
    activityName: record.activityName,
    categoryId: record.categoryId,
    mode: useTimes ? 'times' : 'duration',
    durationMinutes: record.durationMinutes,
    startTime: record.startTime ?? '',
    endTime: record.endTime ?? '',
    valueScore: record.valueScore,
    energyCost: record.energyCost,
    relatedToLongTermGoal: record.relatedToLongTermGoal,
    goalId: record.goalId ?? null,
    notes: record.notes ?? '',
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * 校验草稿。otherRecords 用于重叠检测（编辑时排除自身）。
 */
export function validateDraft(
  draft: DraftRecord,
  category: Category | undefined,
  otherRecords: TimeRecord[],
  selfId?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValidDateKey(draft.date)) {
    issues.push({ field: 'date', message: '请选择有效的日期' });
  }

  if (!draft.activityName.trim()) {
    issues.push({ field: 'activityName', message: '活动名称不能为空' });
  } else if (draft.activityName.trim().length > 60) {
    issues.push({ field: 'activityName', message: '活动名称请控制在 60 字以内' });
  }

  if (!category) {
    issues.push({ field: 'categoryId', message: '请选择一个分类' });
  }

  let duration = 0;

  if (draft.mode === 'times') {
    if (!isValidTimeString(draft.startTime)) {
      issues.push({ field: 'startTime', message: '开始时间格式应为 HH:mm' });
    }
    if (!isValidTimeString(draft.endTime)) {
      issues.push({ field: 'endTime', message: '结束时间格式应为 HH:mm' });
    }
    if (isValidTimeString(draft.startTime) && isValidTimeString(draft.endTime)) {
      if (draft.startTime === draft.endTime) {
        issues.push({ field: 'endTime', message: '开始与结束时间相同，无法计算时长（如需记录 24 小时请用时长输入）' });
      } else {
        duration = durationFromTimes(draft.startTime, draft.endTime);
        if (duration <= 0) {
          issues.push({ field: 'endTime', message: '时长必须大于 0' });
        }
        if (duration > MAX_DURATION_MINUTES) {
          issues.push({ field: 'endTime', message: '单条记录不能超过 24 小时' });
        }
        // 重叠检测（以开始日的分钟区间判断）
        if (duration > 0 && duration < MINUTES_PER_DAY) {
          const startMin = Number(draft.startTime.slice(0, 2)) * 60 + Number(draft.startTime.slice(3));
          const candidate: TimeRecord = {
            id: selfId ?? '__draft__',
            date: draft.date,
            activityName: draft.activityName,
            categoryId: draft.categoryId,
            startTime: draft.startTime,
            endTime: draft.endTime,
            durationMinutes: duration,
            valueScore: 3,
            energyCost: 3,
            relatedToLongTermGoal: false,
            createdAt: 0,
            updatedAt: 0,
          };
          const others = otherRecords.filter((r) => r.id !== selfId);
          const overlaps = findOverlaps([...others, candidate]);
          const hit = overlaps.find(
            ([a, b]) => a.id === candidate.id || b.id === candidate.id
          );
          if (hit) {
            const other = hit[0].id === candidate.id ? hit[1] : hit[0];
            issues.push({
              field: 'startTime',
              message: `与「${other.activityName}」(${other.startTime} 起 ${other.durationMinutes} 分钟) 时间重叠`,
            });
          }
          if (startMin + duration > MINUTES_PER_DAY + MINUTES_PER_DAY) {
            issues.push({ field: 'durationMinutes', message: '单条记录跨度不能超过 48 小时' });
          }
        }
      }
    }
  } else {
    const raw = draft.durationMinutes;
    if (raw === '' || raw === null || raw === undefined) {
      issues.push({ field: 'durationMinutes', message: '请填写持续时长' });
    } else if (!Number.isFinite(Number(raw))) {
      issues.push({ field: 'durationMinutes', message: '时长必须是数字' });
    } else {
      duration = Number(raw);
      if (duration <= 0) {
        issues.push({ field: 'durationMinutes', message: '时长必须大于 0，负数或零无法记账' });
      } else if (duration > MAX_DURATION_MINUTES) {
        issues.push({ field: 'durationMinutes', message: '单条记录不能超过 1440 分钟（24 小时）' });
      }
    }
  }

  if (!Number.isFinite(draft.valueScore) || draft.valueScore < 1 || draft.valueScore > 5) {
    issues.push({ field: 'valueScore', message: '价值评分需在 1-5 之间' });
  }
  if (!Number.isFinite(draft.energyCost) || draft.energyCost < 1 || draft.energyCost > 5) {
    issues.push({ field: 'energyCost', message: '精力消耗需在 1-5 之间' });
  }

  return issues;
}
