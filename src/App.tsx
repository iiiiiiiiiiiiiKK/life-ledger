// App.tsx - 主应用入口
import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { DataProvider, useData } from './store/DataContext';
import { Dashboard } from './pages/Dashboard';
import { Records } from './pages/Records';
import { Goals } from './pages/Goals';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Toaster } from 'react-hot-toast';
import './index.css';

const AUTHOR_X_URL = 'https://x.com/0xkillcoin';
const SITE_NAME = '个人生产力资产负债表';

const NAV = [
  { to: '/', label: '仪表盘', en: 'DASHBOARD' },
  { to: '/records', label: '记录', en: 'LEDGER' },
  { to: '/goals', label: '目标', en: 'GOALS' },
  { to: '/reports', label: '周报', en: 'REPORT' },
  { to: '/settings', label: '设置', en: 'SETTINGS' },
];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ppbs-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      // localStorage 在隐私模式下可能不可用
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('ppbs-theme', theme);
    } catch {
      // 写入失败不影响使用
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

function Masthead() {
  const { records, isEmpty } = useData();
  const { theme, toggle } = useTheme();

  const issue = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-top">
          <span className="topbar-issue">
            <span className={isEmpty ? 'status-dot status-dot-empty' : 'status-dot'} aria-hidden="true" />
            {isEmpty ? '尚无记录 · 仅存本机' : `${records.length} 条记录 · 仅存本机`}
          </span>
          <span className="topbar-date">{issue}</span>
          <a
            className="x-link"
            href={AUTHOR_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="作者 X 主页 @0xkillcoin"
            title="作者 X 主页 @0xkillcoin"
          >
            <span aria-hidden="true">𝕏</span>
            <span className="x-handle">@0xkillcoin</span>
          </a>
        </div>

        <div className="topbar-main">
          <div className="topbar-title-wrap">
            <h1 className="topbar-brand">
              {SITE_NAME}
              <span className="topbar-dot" aria-hidden="true" />
            </h1>
            <p className="topbar-sub">
              把每天的时间当账记：资产、负债、净值，全部由你自己定义。
            </p>
          </div>

          <nav className="topbar-nav" aria-label="主导航">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-btn nav-btn-on' : 'nav-btn')}
                title={item.en}
              >
                {item.label}
                {item.to === '/records' && records.length > 0 && (
                  <span className="nav-btn-count">{records.length}</span>
                )}
              </NavLink>
            ))}
            <button
              type="button"
              className="nav-btn nav-btn-icon"
              onClick={toggle}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              title={theme === 'dark' ? '浅色模式' : '深色模式'}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}

function Colophon() {
  return (
    <footer className="colophon">
      <div className="colophon-rule" aria-hidden="true" />
      <div className="colophon-main">
        <div className="colophon-brand">
          <span className="colophon-mark" aria-hidden="true">
            账
          </span>
          <div>
            <b>{SITE_NAME}</b>
            <p>时间记账与个人成长复盘。只统计你写下的事，不推断、不预测。</p>
          </div>
        </div>
        <div className="colophon-tags">
          <span>React + TS</span>
          <span>IndexedDB</span>
          <span>离线可用</span>
          <span>v1.0.0</span>
        </div>
      </div>
      <div className="colophon-bottom">
        <span>数据只保存在这台设备的浏览器里</span>
        <span>LOCAL LEDGER · NO DATA COLLECTED</span>
      </div>
    </footer>
  );
}

function AppShell() {
  return (
    <div className="app-root">
      <Masthead />
      <div className="app-body">
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/records" element={<Records />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <Colophon />
        </main>
      </div>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: '2px',
            fontFamily: 'var(--sans)',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: 'var(--shadow)',
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </Router>
  );
}
