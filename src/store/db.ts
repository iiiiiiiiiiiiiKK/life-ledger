// IndexedDB 持久化层：单库多表 + schema 版本号 + 迁移
import { SCHEMA_VERSION, SYSTEM_CATEGORIES } from '../types';
import type { Category, Goal, TimeRecord, ActivityTemplate } from '../types';

export const DB_NAME = 'ppbs';
export const DB_VERSION = 1;

export const STORE = {
  records: 'records',
  categories: 'categories',
  goals: 'goals',
  templates: 'templates',
  reports: 'reports',
  meta: 'meta',
} as const;

type StoreName = (typeof STORE)[keyof typeof STORE];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name: string) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      };
      mk(STORE.records);
      mk(STORE.categories);
      mk(STORE.goals);
      mk(STORE.templates);
      mk(STORE.reports);
      mk(STORE.meta);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function putAll<T>(store: StoreName, items: T[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  for (const item of items) tx.objectStore(store).put(item as any);
  await done(tx);
}

export async function put<T>(store: StoreName, item: T): Promise<void> {
  return putAll(store, [item]);
}

export async function remove(store: StoreName, ids: string[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  for (const id of ids) tx.objectStore(store).delete(id);
  await done(tx);
}

export async function clearStores(stores: StoreName[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await done(tx);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE.meta, 'readonly');
    const req = tx.objectStore(STORE.meta).get(key);
    req.onsuccess = () => resolve((req.result as any)?.value as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).put({ id: key, value });
  await done(tx);
}

export async function clearMeta(): Promise<void> {
  await clearStores([STORE.meta]);
}

/**
 * 首次运行写入系统分类；同时执行 schema 迁移。
 * 迁移策略：读取 meta.schemaVersion，逐级 upgrade，v1 -> v2 补齐 kind / crossMidnight 等字段。
 */
export async function bootstrapDatabase(): Promise<void> {
  await openDB();

  const [cats, schemaVersion] = await Promise.all([
    getAll<Category>(STORE.categories),
    getMeta<number>('schemaVersion'),
  ]);

  if (cats.length === 0) {
    await putAll(STORE.categories, SYSTEM_CATEGORIES);
  }

  if (!schemaVersion || schemaVersion < SCHEMA_VERSION) {
    // v1 -> v2：老记录补齐新字段，老分类补齐 kind
    const [records, goals] = await Promise.all([
      getAll<any>(STORE.records),
      getAll<any>(STORE.goals),
    ]);
    const patchedRecords = records.map((r) => ({
      ...r,
      crossMidnight: r.crossMidnight ?? false,
      goalId: r.goalId ?? null,
      valueScore: r.valueScore ?? 3,
      energyCost: r.energyCost ?? 3,
    }));
    if (patchedRecords.length) await putAll(STORE.records, patchedRecords as TimeRecord[]);
    const patchedGoals = goals.map((g) => ({
      ...g,
      active: g.active ?? true,
      targetMinutesPerWeek: g.targetMinutesPerWeek ?? 0,
    }));
    if (patchedGoals.length) await putAll(STORE.goals, patchedGoals as Goal[]);
    const existing = await getAll<Category>(STORE.categories);
    if (existing.some((c) => !c.kind)) {
      await putAll(
        STORE.categories,
        existing.map((c) => ({ ...c, kind: c.kind ?? 'neutral' }))
      );
    }
    await setMeta('schemaVersion', SCHEMA_VERSION);
  }
}

export interface BackupFile {
  app: 'personal-productivity-balance-sheet';
  schemaVersion: number;
  exportedAt: string;
  records: TimeRecord[];
  categories: Category[];
  goals: Goal[];
  templates: ActivityTemplate[];
  reports: unknown[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [records, categories, goals, templates, reports] = await Promise.all([
    getAll<TimeRecord>(STORE.records),
    getAll<Category>(STORE.categories),
    getAll<Goal>(STORE.goals),
    getAll<ActivityTemplate>(STORE.templates),
    getAll<unknown>(STORE.reports),
  ]);
  return {
    app: 'personal-productivity-balance-sheet',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    records,
    categories,
    goals,
    templates,
    reports,
  };
}

/** 危险操作：整体替换。调用方需要二次确认。 */
export async function importBackup(data: Partial<BackupFile>, mode: 'replace' | 'merge'): Promise<void> {
  const db = await openDB();
  const stores: StoreName[] = [
    STORE.records,
    STORE.categories,
    STORE.goals,
    STORE.templates,
    STORE.reports,
  ];
  if (mode === 'replace') await clearStores(stores);

  const tx = db.transaction(stores, 'readwrite');
  for (const r of data.records ?? []) tx.objectStore(STORE.records).put(r);
  for (const c of data.categories ?? []) tx.objectStore(STORE.categories).put(c);
  for (const g of data.goals ?? []) tx.objectStore(STORE.goals).put(g);
  for (const t of data.templates ?? []) tx.objectStore(STORE.templates).put(t);
  await done(tx);

  if (mode === 'replace' && (data.categories ?? []).length === 0) {
    await putAll(STORE.categories, SYSTEM_CATEGORIES);
  }
  await setMeta('schemaVersion', SCHEMA_VERSION);
}

export async function wipeAllUserData(): Promise<void> {
  await clearStores([
    STORE.records,
    STORE.goals,
    STORE.templates,
    STORE.reports,
    STORE.meta,
  ]);
  // 分类重置为系统默认
  await clearStores([STORE.categories]);
  await putAll(STORE.categories, SYSTEM_CATEGORIES);
  await setMeta('schemaVersion', SCHEMA_VERSION);
}
