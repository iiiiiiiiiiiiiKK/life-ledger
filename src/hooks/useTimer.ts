/**
 * 计时器 Hook —— 正确的持久化语义
 *
 * 设计要点：
 * 1. 页面刷新后仍能继续：计时状态（startedAt / accumulatedMs / running）持久化到
 *    IndexedDB 的 meta store，重新加载时用「当前时间 - startedAt」还原已走时长。
 * 2. 计时中断：暂停时把当前段累加到 accumulatedMs 并记录 pausedAt；
 *    刷新后如果处于暂停状态，不会自己跑起来（必须由用户显式继续）。
 * 3. 重复启动：start() 在 running 状态下是 no-op，不会累加时长。
 * 4. 系统时钟回拨：若 now < startedAt（用户改了系统时间），按 0 处理并给出警告。
 * 5. 计时器只是辅助录入方式：它只记录「时长」，绝不推断用户在做什么，
 *    活动名称、分类、评分全部需要用户自己填写。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMeta, setMeta } from '../store/db';
import {
  EMPTY_TIMER,
  elapsedMs as computeElapsed,
  formatElapsed as formatElapsedMs,
  pauseTimer,
  startTimer,
  stopTimer,
} from '../lib/timer';
import type { TimerState } from '../lib/timer';

const TIMER_KEY = 'activeTimer';

export type { TimerState };

export function useTimer() {
  const [state, setState] = useState<TimerState>(EMPTY_TIMER);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef<TimerState>(EMPTY_TIMER);
  const tickRef = useRef<number | null>(null);

  const persist = useCallback(async (next: TimerState) => {
    stateRef.current = next;
    setState(next);
    await setMeta(TIMER_KEY, next);
  }, []);

  // 初始化：从 IndexedDB 恢复
  useEffect(() => {
    (async () => {
      const saved = await getMeta<TimerState>(TIMER_KEY);
      if (saved && typeof saved.startedAt === 'number') {
        const restored: TimerState = { ...EMPTY_TIMER, ...saved };
        stateRef.current = restored;
        setState(restored);
      }
      setLoaded(true);
    })();
  }, []);

  // 计时 tick
  useEffect(() => {
    if (state.running) {
      tickRef.current = window.setInterval(() => {
        const s = stateRef.current;
        if (!s.running) return;
        setState({ ...s });
      }, 250);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state.running]);

  const start = useCallback(async () => {
    const next = startTimer(stateRef.current, Date.now(), new Date().toISOString().slice(0, 10));
    if (next === stateRef.current) return; // 重复启动保护
    await persist(next);
  }, [persist]);

  const pause = useCallback(async () => {
    const next = pauseTimer(stateRef.current, Date.now());
    if (next === stateRef.current) return;
    await persist(next);
  }, [persist]);

  const stop = useCallback(async (): Promise<number> => {
    const { state: next, totalMs } = stopTimer(stateRef.current, Date.now());
    await persist(next);
    return totalMs;
  }, [persist]);

  const reset = useCallback(async () => {
    await persist({ ...EMPTY_TIMER });
  }, [persist]);

  return {
    loaded,
    running: state.running,
    paused: !state.running && state.accumulatedMs > 0,
    elapsedMs: computeElapsed(state, Date.now()),
    elapsedMinutes: Math.floor(computeElapsed(state, Date.now()) / 60000),
    startedDate: state.startedDate,
    clockWarning: state.clockWarning,
    start,
    pause,
    stop,
    reset,
    formatElapsed: formatElapsedMs,
  };
}
