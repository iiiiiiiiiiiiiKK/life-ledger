import { describe, it, expect } from 'vitest';
import {
  EMPTY_TIMER,
  elapsedMs,
  formatElapsed,
  pauseTimer,
  startTimer,
  stopTimer,
} from '../lib/timer';
import type { TimerState } from '../lib/timer';

const T0 = 1_700_000_000_000;

describe('计时器状态机', () => {
  it('start 在空状态开启计时', () => {
    const s = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    expect(s.running).toBe(true);
    expect(s.startedAt).toBe(T0);
    expect(s.startedDate).toBe('2026-10-23');
  });

  it('重复启动是 no-op，不会累加时长', () => {
    const first = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    const second = startTimer(first, T0 + 5000, '2026-10-23');
    expect(second).toBe(first);
    expect(elapsedMs(second, T0 + 60_000)).toBe(60_000);
  });

  it('运行中 elapsed 按当前时间推算', () => {
    const s = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    expect(elapsedMs(s, T0 + 90_000)).toBe(90_000);
  });

  it('pause 累加当前段并停止计时', () => {
    const s = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    const p = pauseTimer(s, T0 + 60_000);
    expect(p.running).toBe(false);
    expect(p.accumulatedMs).toBe(60_000);
    expect(elapsedMs(p, T0 + 600_000)).toBe(60_000); // 暂停后不再增长
  });

  it('暂停状态下 pause 是 no-op', () => {
    const s = pauseTimer(startTimer(EMPTY_TIMER, T0, '2026-10-23'), T0 + 60_000);
    expect(pauseTimer(s, T0 + 120_000)).toBe(s);
  });

  it('暂停后可继续，新时长累加到已有累计', () => {
    let s: TimerState = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    s = pauseTimer(s, T0 + 60_000);
    s = startTimer(s, T0 + 100_000, '2026-10-23');
    expect(elapsedMs(s, T0 + 160_000)).toBe(120_000);
  });

  it('stop 返回最终时长并清空状态', () => {
    const s = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    const { state, totalMs } = stopTimer(s, T0 + 300_000);
    expect(totalMs).toBe(300_000);
    expect(state).toEqual(EMPTY_TIMER);
  });

  it('stop 在暂停状态下保留已累计时长', () => {
    const s = pauseTimer(startTimer(EMPTY_TIMER, T0, '2026-10-23'), T0 + 60_000);
    const { totalMs } = stopTimer(s, T0 + 600_000);
    expect(totalMs).toBe(60_000);
  });

  it('系统时钟回拨时按 0 处理并给出警告', () => {
    const s = startTimer(EMPTY_TIMER, T0, '2026-10-23');
    const p = pauseTimer(s, T0 - 10_000);
    expect(p.accumulatedMs).toBe(0);
    expect(p.clockWarning).toContain('回拨');
    expect(elapsedMs(s, T0 - 10_000)).toBe(0);
  });

  it('格式化时:分:秒', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(61_000)).toBe('00:01:01');
    expect(formatElapsed(3_661_000)).toBe('01:01:01');
  });
});
