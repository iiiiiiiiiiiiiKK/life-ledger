/**
 * @vitest-environment jsdom
 *
 * 冒烟测试：渲染整个 App，验证零数据空状态、添加记录后的仪表盘渲染，
 * 以及页面刷新（重新挂载）后数据仍在。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import App from '../App';
import { clearStores, STORE } from '../store/db';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await clearStores([
    STORE.records,
    STORE.categories,
    STORE.goals,
    STORE.templates,
    STORE.reports,
    STORE.meta,
  ]);
  cleanup();
  window.location.hash = '#/';
});

function renderApp() {
  return render(<App />);
}

describe('应用冒烟测试', () => {
  it('零数据时显示空状态，不显示伪造统计', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());
    expect(screen.getByText('添加第一条记录')).toBeTruthy();
    // 空状态下不应出现任何时长统计卡
    expect(screen.queryByText('本期总记录')).toBeNull();
    expect(screen.queryByText('时间资产')).toBeNull();
    expect(screen.queryByText('时间净值')).toBeNull();
  });

  it('导航包含仪表盘、记录、目标、周报、设置', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());
    expect(screen.getByText('仪表盘')).toBeTruthy();
    expect(screen.getByText('记录')).toBeTruthy();
    expect(screen.getByText('目标')).toBeTruthy();
    expect(screen.getByText('周报')).toBeTruthy();
    expect(screen.getByText('设置')).toBeTruthy();
  });

  it('顶栏有作者 X 链接，指向 https://x.com/0xkillcoin', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());

    const link = screen.getByRole('link', { name: /0xkillcoin/ });
    expect(link.getAttribute('href')).toBe('https://x.com/0xkillcoin');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('𝕏');
  });

  it('顶栏在所有页面都可见（含记录页与设置页）', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());

    fireEvent.click(screen.getByText('记录'));
    await waitFor(() => expect(screen.getByText('记录时间')).toBeTruthy());
    expect(screen.getByRole('link', { name: /0xkillcoin/ })).toBeTruthy();

    fireEvent.click(screen.getByText('设置'));
    await waitFor(() => expect(screen.getByText('设置与数据')).toBeTruthy());
    expect(screen.getByRole('link', { name: /0xkillcoin/ })).toBeTruthy();
  });

  it('切换到记录页可以填写并保存一条记录', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());

    fireEvent.click(screen.getByText('记录'));
    await waitFor(() => expect(screen.getByText('记录时间')).toBeTruthy());

    const nameInput = screen.getByPlaceholderText('例如：写项目文档') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '写周报' } });

    const durationInput = document.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: '90' } });

    fireEvent.click(screen.getByText('添加记录'));

    await waitFor(() => expect(screen.getByText(/已记录/)).toBeTruthy());
  });

  it('刷新（重新挂载）后已保存的记录仍然存在', async () => {
    const first = renderApp();
    await waitFor(() => expect(screen.getByText('还没有任何记录')).toBeTruthy());

    fireEvent.click(screen.getByText('记录'));
    await waitFor(() => expect(screen.getByText('记录时间')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('例如：写项目文档'), {
      target: { value: '读论文' },
    });
    const durationInput = document.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: '45' } });
    fireEvent.click(screen.getByText('添加记录'));
    await waitFor(() => expect(screen.getByText(/已记录/)).toBeTruthy());

    first.unmount();
    cleanup();

    // 模拟刷新：重新挂载，数据应从 IndexedDB 读回
    renderApp();
    await waitFor(() => expect(screen.getByText('读论文')).toBeTruthy());
  });
});
