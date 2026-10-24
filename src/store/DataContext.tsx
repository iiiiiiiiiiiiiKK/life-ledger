// 全局数据上下文：加载、增删改、批量操作
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SYSTEM_CATEGORIES } from '../types';
import type { ActivityTemplate, Category, Goal, TimeRecord } from '../types';
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
  wipeAllUserData,
} from './db';
import type { BackupFile } from './db';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export { uid };

interface DataContextValue {
  ready: boolean;
  error: string | null;
  records: TimeRecord[];
  categories: Category[];
  goals: Goal[];
  templates: ActivityTemplate[];
  /** 是否存在任何用户数据（分类除外） */
  isEmpty: boolean;

  addRecord: (r: Omit<TimeRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TimeRecord>;
  updateRecord: (r: TimeRecord) => Promise<void>;
  deleteRecords: (ids: string[]) => Promise<void>;
  replaceRecords: (records: TimeRecord[]) => Promise<void>;

  addGoal: (g: Omit<Goal, 'id' | 'createdAt'>) => Promise<Goal>;
  updateGoal: (g: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  addCategory: (c: Omit<Category, 'id' | 'isSystem'>) => Promise<Category>;
  updateCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<ActivityTemplate[]>>;
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;

  saveTemplate: (t: Omit<ActivityTemplate, 'id' | 'useCount'>) => Promise<void>;
  useTemplate: (id: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  reload: () => Promise<void>;
  clearAll: () => Promise<void>;
  exportData: () => Promise<BackupFile>;
  importData: (data: any, mode: 'replace' | 'merge') => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>(SYSTEM_CATEGORIES);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);

  const reload = useCallback(async () => {
    const [recs, cats, gls, tpls] = await Promise.all([
      getAll<TimeRecord>(STORE.records),
      getAll<Category>(STORE.categories),
      getAll<Goal>(STORE.goals),
      getAll<ActivityTemplate>(STORE.templates),
    ]);
    setRecords(recs);
    setCategories(cats.length ? cats : SYSTEM_CATEGORIES);
    setGoals(gls);
    setTemplates(tpls);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await bootstrapDatabase();
        await reload();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
  }, [reload]);

  const addRecord: DataContextValue['addRecord'] = useCallback(
    async (input) => {
      const now = Date.now();
      const record: TimeRecord = { ...input, id: uid('rec'), createdAt: now, updatedAt: now };
      await put(STORE.records, record);
      setRecords((prev) => [...prev, record]);
      return record;
    },
    []
  );

  const updateRecord = useCallback(async (record: TimeRecord) => {
    const next = { ...record, updatedAt: Date.now() };
    await put(STORE.records, next);
    setRecords((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }, []);

  const deleteRecords = useCallback(async (ids: string[]) => {
    await remove(STORE.records, ids);
    const set = new Set(ids);
    setRecords((prev) => prev.filter((r) => !set.has(r.id)));
  }, []);

  const replaceRecords = useCallback(async (next: TimeRecord[]) => {
    await clearStores([STORE.records]);
    await putAll(STORE.records, next);
    setRecords(next);
  }, []);

  const addGoal: DataContextValue['addGoal'] = useCallback(async (input) => {
    const goal: Goal = { ...input, id: uid('goal'), createdAt: Date.now() };
    await put(STORE.goals, goal);
    setGoals((prev) => [...prev, goal]);
    return goal;
  }, []);

  const updateGoal = useCallback(async (goal: Goal) => {
    await put(STORE.goals, goal);
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? goal : g)));
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    await remove(STORE.goals, [id]);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const addCategory: DataContextValue['addCategory'] = useCallback(async (input) => {
    const category: Category = { ...input, id: uid('cat'), isSystem: false };
    await put(STORE.categories, category);
    setCategories((prev) => [...prev, category]);
    return category;
  }, []);

  const updateCategory = useCallback(async (category: Category) => {
    await put(STORE.categories, category);
    setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)));
  }, []);

  const deleteCategory = useCallback(
    async (id: string) => {
      const used = records.some((r) => r.categoryId === id);
      if (used) throw new Error('该分类下仍有记录，请先移动或删除这些记录');
      await remove(STORE.categories, [id]);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    },
    [records]
  );

  const saveTemplate = useCallback(async (t: Omit<ActivityTemplate, 'id' | 'useCount'>) => {
    const template: ActivityTemplate = { ...t, id: uid('tpl'), useCount: 0 };
    await put(STORE.templates, template);
    setTemplates((prev) => [...prev, template]);
  }, []);

  const useTemplate = useCallback(async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const next = { ...tpl, useCount: tpl.useCount + 1 };
    await put(STORE.templates, next);
    setTemplates((prev) => prev.map((t) => (t.id === id ? next : t)));
  }, [templates]);

  const deleteTemplate = useCallback(async (id: string) => {
    await remove(STORE.templates, [id]);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    await wipeAllUserData();
    await reload();
  }, [reload]);

  const importData = useCallback(
    async (data: any, mode: 'replace' | 'merge') => {
      await importBackup(data, mode);
      await reload();
    },
    [reload]
  );

  const isEmpty = records.length === 0 && goals.length === 0;

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      error,
      records,
      categories,
      goals,
      templates,
      isEmpty,
      addRecord,
      updateRecord,
      deleteRecords,
      replaceRecords,
      addGoal,
      updateGoal,
      deleteGoal,
      addCategory,
      updateCategory,
      deleteCategory,
      setCategories,
      setTemplates,
      setGoals,
      saveTemplate,
      useTemplate,
      deleteTemplate,
      reload,
      clearAll,
      exportData: exportBackup,
      importData,
    }),
    [
      ready,
      error,
      records,
      categories,
      goals,
      templates,
      isEmpty,
      addRecord,
      updateRecord,
      deleteRecords,
      replaceRecords,
      addGoal,
      updateGoal,
      deleteGoal,
      addCategory,
      updateCategory,
      deleteCategory,
      saveTemplate,
      useTemplate,
      deleteTemplate,
      reload,
      clearAll,
      importData,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData 必须在 DataProvider 内使用');
  return ctx;
}
