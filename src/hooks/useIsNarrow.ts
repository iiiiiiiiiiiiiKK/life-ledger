import { useEffect, useState } from 'react';

/** 判断当前视口是否窄于给定像素（默认 560px），用于图表在移动端简化标注 */
export function useIsNarrow(maxWidth = 560): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    // 老版 Safari
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [maxWidth]);

  return narrow;
}
