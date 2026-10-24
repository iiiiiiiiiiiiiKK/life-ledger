// ── 核心数据类型（schemaVersion 记录在 IndexedDB meta 中，用于后续迁移）──

export type CategoryKind = 'asset' | 'neutral' | 'liability';

/** 1-5 的整数评分 */
export type ValueScore = 1 | 2 | 3 | 4 | 5;
export type EnergyCost = 1 | 2 | 3 | 4 | 5;

/** 分类。kind 是用户自定义的价值判断，系统不会替用户判定休息/娱乐为负债。 */
export interface Category {
  id: string;
  name: string;
  color: string;
  kind: CategoryKind;
  isSystem: boolean;
  hint?: string;
  archived?: boolean;
}

export interface TimeRecord {
  id: string;
  /** 本地日期 YYYY-MM-DD（记录归属日，跨午夜记录归入开始日） */
  date: string;
  activityName: string;
  categoryId: string;
  /** HH:mm，可选 */
  startTime?: string | null;
  endTime?: string | null;
  /** 实际时长（分钟）。有起止时间时由起止时间推导，否则手填。 */
  durationMinutes: number;
  /** 跨午夜标记（endTime < startTime） */
  crossMidnight?: boolean;
  /** 主观价值 1-5 */
  valueScore: number;
  /** 精力消耗 1-5 */
  energyCost: number;
  /** 是否服务于长期目标 */
  relatedToLongTermGoal: boolean;
  /** 关联的长期目标 id（可选） */
  goalId?: string | null;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  name: string;
  categoryId: string;
  /** 期望每周投入分钟数 */
  targetMinutesPerWeek: number;
  startDate: string;
  endDate?: string | null;
  notes?: string;
  active: boolean;
  createdAt: number;
}

export interface ActivityTemplate {
  id: string;
  name: string;
  categoryId: string;
  defaultDurationMinutes: number;
  defaultValueScore: number;
  defaultEnergyCost: number;
  useCount: number;
}

export type PeriodKind = 'day' | 'week' | 'month' | 'custom';

export interface Period {
  kind: PeriodKind;
  /** 含首尾的本地日期 YYYY-MM-DD */
  start: string;
  end: string;
  label: string;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  kind: CategoryKind;
  minutes: number;
  share: number;
}

export interface CategoryFlow extends CategoryTotal {
  prevMinutes: number;
  deltaMinutes: number;
}

/** 人生财报核心指标（全部基于用户实际记录，单位分钟/小时） */
export interface BalanceSheet {
  period: Period;
  prevPeriod: Period;

  totalMinutes: number;
  prevTotalMinutes: number;

  assetMinutes: number;
  liabilityMinutes: number;
  neutralMinutes: number;
  /** 时间净值 = 资产 - 负债 */
  netMinutes: number;

  /** 长期目标投入分钟数 */
  goalMinutes: number;

  /** 记录天数（去重） */
  activeDays: number;
  recordCount: number;

  categories: CategoryFlow[];

  /** 注意力成本：按精力消耗加权的时间，单位"等效分钟" */
  attentionCost: number;
  attentionByLevel: { level: 'low' | 'medium' | 'high'; minutes: number; share: number }[];

  /** 平均主观价值（1-5，按时长加权） */
  avgValue: number;
  /** 平均精力消耗（1-5，按时长加权） */
  avgEnergy: number;
}

export interface DailyPoint {
  date: string;
  totalMinutes: number;
  assetMinutes: number;
  liabilityMinutes: number;
  goalMinutes: number;
}

export const SCHEMA_VERSION = 2;

export const SYSTEM_CATEGORIES: Category[] = [
  { id: 'work', name: '工作与赚钱', color: '#3b82f6', kind: 'asset', isSystem: true, hint: '职业工作、兼职、外包交付' },
  { id: 'learning', name: '学习与技能', color: '#8b5cf6', kind: 'asset', isSystem: true, hint: '读书、课程、技能练习' },
  { id: 'projects', name: '项目与创造', color: '#ec4899', kind: 'asset', isSystem: true, hint: '个人项目、写作、作品输出' },
  { id: 'health', name: '健康与休息', color: '#10b981', kind: 'neutral', isSystem: true, hint: '运动、冥想、睡眠、放空' },
  { id: 'social', name: '社交与家庭', color: '#f59e0b', kind: 'neutral', isSystem: true, hint: '家人、朋友、陪伴' },
  { id: 'entertainment', name: '娱乐与放松', color: '#6366f1', kind: 'neutral', isSystem: true, hint: '影视、游戏、休闲' },
  { id: 'mindless', name: '无意识消耗', color: '#ef4444', kind: 'liability', isSystem: true, hint: '无目的刷屏、反复拖延' },
];

export const KIND_LABEL: Record<CategoryKind, string> = {
  asset: '计入资产',
  neutral: '不计入（中性）',
  liability: '计入负债',
};

export const ENERGY_LABEL: Record<number, string> = {
  1: '几乎不费神',
  2: '较轻',
  3: '中等',
  4: '较耗神',
  5: '极耗神',
};
