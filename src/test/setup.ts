/**
 * 测试环境准备：为 jsdom 补齐浏览器 API（matchMedia、ResizeObserver 等）。
 */
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as any;
  }

  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!(window as any).scrollTo) {
    (window as any).scrollTo = () => {};
  }

  // Recharts 依赖 getComputedStyle 的 SVG 相关度量，jsdom 已支持大部分，这里补一个安全垫
  if (typeof Element !== 'undefined' && !Element.prototype.getBoundingClientRect) {
    Element.prototype.getBoundingClientRect = () => ({
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as any;
  }
}

export {};
