/**
 * 存储层测试：使用 fake-indexeddb 模拟浏览器 IndexedDB。
 * 验证：首次启动写入系统分类、记录增删改查、备份导出/导入、清空数据。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  STORE,
  bootstrapDatabase,
  clearStores,
  exportBackup,
  getAll,
  importBackup,
  put,
  putAll,
  remove,
  getMeta,
  setMeta,
  wipeAllUserData,
} from '../store/db';
import type { TimeRecord } from '../types';

function rec(partial: Partial<TimeRecord>): TimeRecord {
  return {
    id: 'r1',
    date: '2026-10-23',
    activityName: '写代码',
    categoryId: 'work',
    durationMinutes: 60,
    valueScore: 4,
    energyCost: 3,
    relatedToLongTermGoal: false,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

beforeAll(() => {
  // 每个测试文件使用独立的 IDBFactory，避免用例之间互相污染
  globalThis.indexedDB = new IDBFactory();
});

beforeEach(async () => {
  await clearStores([
    STORE.records,
    STORE.categories,
    STORE.goals,
    STORE.templates,
    STORE.reports,
    STORE.meta,
  ]);
});

describe('IndexedDB 存储层', () => {
  it('首次启动写入 7 个系统分类', async () => {
    await bootstrapDatabase();
    const cats = await getAll<any>(STORE.categories);
    expect(cats).toHaveLength(7);
    expect(cats.map((c) => c.id)).toContain('mindless');
    // 休息 / 娱乐 / 家庭默认是中性，不是负债
    expect(cats.find((c) => c.id === 'health')?.kind).toBe('neutral');
    expect(cats.find((c) => c.id === 'entertainment')?.kind).toBe('neutral');
    expect(cats.find((c) => c.id === 'social')?.kind).toBe('neutral');
    expect(cats.find((c) => c.id === 'mindless')?.kind).toBe('liability');
  });

  it('记录 schemaVersion 便于后续迁移', async () => {
    await bootstrapDatabase();
    expect(await getMeta<number>('schemaVersion')).toBe(2);
  });

  it('记录的增删改查', async () => {
    await put(STORE.records, rec({}));
    let list = await getAll<TimeRecord>(STORE.records);
    expect(list).toHaveLength(1);

    await put(STORE.records, rec({ id: 'r2', activityName: '读书' }));
    list = await getAll<TimeRecord>(STORE.records);
    expect(list).toHaveLength(2);

    await put(STORE.records, rec({ id: 'r1', activityName: '改过了' }));
    list = await getAll<TimeRecord>(STORE.records);
    const found = list.find((r) => r.id === 'r1');
    expect(found?.activityName).toBe('改过了');

    await remove(STORE.records, ['r2']);
    list = await getAll<TimeRecord>(STORE.records);
    expect(list).toHaveLength(1);
  });

  it('批量写入与批量删除', async () => {
    await putAll(STORE.records, [rec({ id: 'a' }), rec({ id: 'b' }), rec({ id: 'c' })]);
    expect(await getAll(STORE.records)).toHaveLength(3);
    await remove(STORE.records, ['a', 'c']);
    expect(await getAll(STORE.records)).toHaveLength(1);
  });

  it('导出备份包含全部数据与版本号', async () => {
    await bootstrapDatabase();
    await put(STORE.records, rec({}));
    const backup = await exportBackup();
    expect(backup.schemaVersion).toBe(2);
    expect(backup.app).toBe('personal-productivity-balance-sheet');
    expect(backup.records).toHaveLength(1);
    expect(backup.categories).toHaveLength(7);
    expect(typeof backup.exportedAt).toBe('string');
  });

  it('导入备份（替换）会覆盖现有数据', async () => {
    await bootstrapDatabase();
    await put(STORE.records, rec({ id: 'old' }));

    const backup = await exportBackup();
    const next = {
      ...backup,
      records: [rec({ id: 'new' }), rec({ id: 'new2' })],
    };
    await importBackup(next, 'replace');

    const list = await getAll<TimeRecord>(STORE.records);
    expect(list).toHaveLength(2);
    expect(list.find((r) => r.id === 'old')).toBeUndefined();
  });

  it('导入备份（合并）会保留现有数据', async () => {
    await bootstrapDatabase();
    await put(STORE.records, rec({ id: 'old' }));

    const backup = await exportBackup();
    await importBackup({ ...backup, records: [rec({ id: 'new' })] }, 'merge');

    const list = await getAll<TimeRecord>(STORE.records);
    expect(list).toHaveLength(2);
  });

  it('清除全部数据后分类恢复为系统默认', async () => {
    await bootstrapDatabase();
    await put(STORE.records, rec({}));
    await putAll(STORE.categories, [
      { id: 'custom', name: '我的分类', color: '#000', kind: 'asset', isSystem: false },
    ]);

    await wipeAllUserData();

    expect(await getAll(STORE.records)).toHaveLength(0);
    const cats = await getAll<any>(STORE.categories);
    expect(cats).toHaveLength(7);
    expect(cats.find((c) => c.id === 'custom')).toBeUndefined();
  });

  it('meta 可读写', async () => {
    await setMeta('foo', { a: 1 });
    expect(await getMeta<any>('foo')).toEqual({ a: 1 });
    await setMeta('foo', null);
    expect(await getMeta('foo')).toBeNull();
  });
});
