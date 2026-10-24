/**
 * 计时器的纯逻辑（与 UI 无关，方便单测）。
 *
 * 计时语义：
 * - start：在暂停状态下开启新的一段计时；运行中调用是 no-op（重复启动保护）。
 * - pause：把当前段的经过时间累加到 accumulatedMs，并记录 pausedAt。
 * - stop：返回最终累计毫秒并清空状态。
 * - elapsed：运行中按 now - startedAt 推算；系统时钟回拨时按 0 处理。
 */
export interface TimerState {
  /** 当前计时段的开始时间戳 */
  startedAt: number;
  /** 已完成段落累计毫秒 */
  accumulatedMs: number;
  running: boolean;
  /** 最近一次暂停时间戳 */
  pausedAt: number | null;
  /** 计时器启动时的本地日期，用于默认归属日 */
  startedDate: string;
  /** 检测到的时钟异常提示 */
  clockWarning?: string | null;
}

export const EMPTY_TIMER: TimerState = {
  startedAt: 0,
  accumulatedMs: 0,
  running: false,
  pausedAt: null,
  startedDate: '',
  clockWarning: null,
};

export function startTimer(state: TimerState, now: number, today: string): TimerState {
  if (state.running) return state; // 重复启动保护
  return {
    ...state,
    startedAt: now,
    pausedAt: null,
    running: true,
    startedDate: state.startedDate || today,
    clockWarning: null,
  };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (!state.running) return state;
  const delta = now >= state.startedAt ? now - state.startedAt : 0;
  return {
    ...state,
    accumulatedMs: state.accumulatedMs + delta,
    running: false,
    pausedAt: now,
    clockWarning: now < state.startedAt ? '检测到系统时间被回拨，本段按 0 计时' : null,
  };
}

export function stopTimer(state: TimerState, now: number): { state: TimerState; totalMs: number } {
  let total = state.accumulatedMs;
  if (state.running && state.startedAt > 0 && now >= state.startedAt) {
    total += now - state.startedAt;
  }
  return { state: { ...EMPTY_TIMER }, totalMs: total };
}

/** 当前已走时长（毫秒）。 */
export function elapsedMs(state: TimerState, now: number): number {
  if (state.running && state.startedAt > 0) {
    const delta = now - state.startedAt;
    if (delta < 0) return state.accumulatedMs;
    return state.accumulatedMs + delta;
  }
  return state.accumulatedMs;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
