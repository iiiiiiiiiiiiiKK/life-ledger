import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useData, uid } from '../store/DataContext';
import { ENERGY_LABEL, KIND_LABEL } from '../types';
import type { TimeRecord } from '../types';
import {
  durationFromTimes,
  formatMinutes,
  isValidTimeString,
  todayKey,
} from '../lib/dates';
import {
  draftToRecord,
  emptyDraft,
  recordToDraft,
  validateDraft,
} from '../lib/validation';
import type { DraftRecord } from '../lib/validation';
import { classifyRecord, findOverlaps } from '../lib/metrics';
import { useTimer } from '../hooks/useTimer';
import { parseCsv, recordsToCsv } from '../lib/csv';
import { downloadFile } from '../lib/utils';

const VALUE_LABEL: Record<number, string> = {
  1: '几乎没意义',
  2: '意义较小',
  3: '一般',
  4: '有意义',
  5: '很有意义',
};

function ScoreInput({
  value,
  onChange,
  labels,
  name,
}: {
  value: number;
  onChange: (v: number) => void;
  labels: Record<number, string>;
  name: string;
}) {
  return (
    <div className="score-input" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={value === n ? 'score-btn active' : 'score-btn'}
          onClick={() => onChange(n)}
          title={labels[n]}
        >
          {n}
        </button>
      ))}
      <span className="score-hint">{labels[value]}</span>
    </div>
  );
}

export function Records() {
  const {
    records,
    categories,
    goals,
    addRecord,
    updateRecord,
    deleteRecords,
    saveTemplate,
    templates,
    useTemplate,
    replaceRecords,
  } = useData();

  const [draft, setDraft] = useState<DraftRecord>(() => emptyDraft(todayKey()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ReturnType<typeof validateDraft>>([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const csvInputRef = useRef<HTMLInputElement>(null);

  const timer = useTimer();
  const category = categories.find((c) => c.id === draft.categoryId);

  const filtered = useMemo(() => {
    return records
      .filter((r) => (filterCategory === 'all' ? true : r.categoryId === filterCategory))
      .filter((r) => (filterFrom ? r.date >= filterFrom : true))
      .filter((r) => (filterTo ? r.date <= filterTo : true))
      .sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)
      );
  }, [records, filterCategory, filterFrom, filterTo]);

  const overlaps = useMemo(() => findOverlaps(records), [records]);

  const liveDuration =
    draft.mode === 'times' && isValidTimeString(draft.startTime) && isValidTimeString(draft.endTime)
      ? durationFromTimes(draft.startTime, draft.endTime)
      : Number(draft.durationMinutes) || 0;

  function resetForm() {
    setDraft(emptyDraft(draft.date, draft.categoryId));
    setEditingId(null);
    setIssues([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const others = records.filter((r) => r.id !== editingId);
    const found = validateDraft(draft, category, others, editingId ?? undefined);
    setIssues(found);
    if (found.length > 0) {
      toast.error(found[0].message);
      return;
    }
    if (editingId) {
      const original = records.find((r) => r.id === editingId)!;
      const next = draftToRecord(draft, editingId, original.createdAt);
      await updateRecord(next);
      toast.success('记录已更新');
    } else {
      const record = draftToRecord(draft, uid('rec'));
      await addRecord(record);
      toast.success(`已记录 ${formatMinutes(record.durationMinutes)}`);
    }
    resetForm();
  }

  function startEdit(record: TimeRecord) {
    setEditingId(record.id);
    setDraft(recordToDraft(record));
    setIssues([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(ids: string[]) {
    if (ids.length === 0) return;
    const ok = window.confirm(`确定删除 ${ids.length} 条记录吗？此操作不可撤销。`);
    if (!ok) return;
    await deleteRecords(ids);
    setSelected(new Set());
    toast.success(`已删除 ${ids.length} 条记录`);
  }

  async function handleBatchCategory(categoryId: string) {
    if (selected.size === 0) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const next = records.map((r) =>
      selected.has(r.id) ? { ...r, categoryId: cat.id, updatedAt: Date.now() } : r
    );
    await replaceRecords(next);
    toast.success(`已把 ${selected.size} 条记录移动到「${cat.name}」`);
    setSelected(new Set());
  }

  async function handleBatchDelete() {
    await handleDelete([...selected]);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

  function handleExportCsv() {
    const csv = recordsToCsv(filtered);
    downloadFile(csv, `ppbs-records-${todayKey()}.csv`, 'text/csv;charset=utf-8');
    toast.success(`已导出 ${filtered.length} 条记录`);
  }

  async function handleImportCsv(file: File) {
    const text = await file.text();
    const result = parseCsv(text, categories);
    if (result.records.length === 0) {
      toast.error(result.errors[0] ?? '没有解析到有效记录');
      return;
    }
    const mode = window.confirm(
      `解析到 ${result.records.length} 条有效记录${result.skipped ? `，跳过 ${result.skipped} 条` : ''}。\n\n点击「确定」= 替换现有记录\n点击「取消」= 追加到现有记录`
    )
      ? 'replace'
      : 'merge';
    const next = mode === 'replace' ? result.records : [...records, ...result.records];
    await replaceRecords(next);
    toast.success(`已导入 ${result.records.length} 条记录`);
    if (result.errors.length > 0) {
      toast(result.errors.slice(0, 3).join('；'), { duration: 6000 });
    }
  }

  async function stopTimerAndFill() {
    const ms = await timer.stop();
    const minutes = Math.round(ms / 60000);
    if (minutes <= 0) {
      toast.error('计时时间不足 1 分钟，未填入表单');
      return;
    }
    setDraft((d) => ({ ...d, mode: 'duration', durationMinutes: minutes }));
    toast.success(`已填入 ${minutes} 分钟，请补充活动名称与分类`);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            {editingId ? '编辑记录' : '记录时间'}
            <span className="h1-en">{editingId ? 'EDIT ENTRY' : 'NEW ENTRY'}</span>
          </h1>
          <p className="subtitle">每条记录只需几秒。所有数据仅保存在本机浏览器。</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-small" onClick={handleExportCsv}>导出 CSV</button>
          <button className="btn btn-small" onClick={() => csvInputRef.current?.click()}>导入 CSV</button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportCsv(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {overlaps.length > 0 && (
        <div className="notice warn">
          检测到 {overlaps.length} 处时间重叠（历史数据）。重叠不会阻止统计，但可能让总时长看起来偏大。
        </div>
      )}

      <section className="card timer-card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">01</span>
            快捷计时器
          </h2>
          <span className="chart-meta">只记录时长，不判断你在做什么</span>
        </div>
        <div className="timer-row">
          <span className="timer-display">{timer.formatElapsed(timer.elapsedMs)}</span>
          {!timer.running && !timer.paused && (
            <button className="btn btn-primary" onClick={timer.start}>开始计时</button>
          )}
          {timer.running && (
            <>
              <button className="btn" onClick={timer.pause}>暂停</button>
              <button className="btn btn-primary" onClick={stopTimerAndFill}>结束并填入</button>
            </>
          )}
          {timer.paused && (
            <>
              <button className="btn" onClick={timer.start}>继续</button>
              <button className="btn btn-primary" onClick={stopTimerAndFill}>结束并填入</button>
              <button className="btn btn-small" onClick={timer.reset}>丢弃</button>
            </>
          )}
        </div>
        {timer.clockWarning && <p className="warn-text">{timer.clockWarning}</p>}
        {timer.loaded && timer.paused && (
          <p className="muted small">计时处于暂停状态，刷新页面不会自动继续，需要你手动点击「继续」。</p>
        )}
        <p className="muted small">
          计时器只提供时长，活动名称、分类与评分仍需你自己填写——它不会推断你在做什么。
        </p>
      </section>

      <form className="card record-form" onSubmit={handleSubmit}>
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">02</span>
            {editingId ? '修改这条记录' : '录入一条记录'}
          </h2>
          <span className="chart-meta">必填：日期 / 分类 / 活动 / 时长</span>
        </div>
        <div className="form-row">
          <label>
            日期
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
            {issueFor('date') && <span className="field-error">{issueFor('date')}</span>}
          </label>
          <label>
            分类
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{KIND_LABEL[c.kind]}）
                </option>
              ))}
            </select>
            {issueFor('categoryId') && <span className="field-error">{issueFor('categoryId')}</span>}
          </label>
        </div>

        <label className="full">
          做了什么
          <input
            type="text"
            placeholder="例如：写项目文档"
            value={draft.activityName}
            onChange={(e) => setDraft({ ...draft, activityName: e.target.value })}
            maxLength={80}
          />
          {issueFor('activityName') && <span className="field-error">{issueFor('activityName')}</span>}
        </label>

        {templates.length > 0 && (
          <div className="template-row">
            <span className="template-label">常用：</span>
            {templates.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                onClick={() => {
                  setDraft({
                    ...draft,
                    activityName: t.name,
                    categoryId: t.categoryId,
                    durationMinutes: t.defaultDurationMinutes,
                    valueScore: t.defaultValueScore,
                    energyCost: t.defaultEnergyCost,
                  });
                  useTemplate(t.id);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="mode-switch">
          <button
            type="button"
            className={draft.mode === 'duration' ? 'tab active' : 'tab'}
            onClick={() => setDraft({ ...draft, mode: 'duration' })}
          >
            直接填时长
          </button>
          <button
            type="button"
            className={draft.mode === 'times' ? 'tab active' : 'tab'}
            onClick={() => setDraft({ ...draft, mode: 'times' })}
          >
            填起止时间
          </button>
        </div>

        {draft.mode === 'duration' ? (
          <div className="form-row">
            <label>
              时长（分钟）
              <input
                type="number"
                min={1}
                max={1440}
                value={draft.durationMinutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    durationMinutes: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
              {issueFor('durationMinutes') && (
                <span className="field-error">{issueFor('durationMinutes')}</span>
              )}
            </label>
            <div className="quick-durations">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  onClick={() => setDraft({ ...draft, durationMinutes: m })}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="form-row">
            <label>
              开始
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
              />
              {issueFor('startTime') && <span className="field-error">{issueFor('startTime')}</span>}
            </label>
            <label>
              结束
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
              />
              {issueFor('endTime') && <span className="field-error">{issueFor('endTime')}</span>}
            </label>
            <div className="duration-preview">
              时长：<strong>{liveDuration > 0 ? formatMinutes(liveDuration) : '—'}</strong>
              {draft.startTime && draft.endTime && liveDuration > 720 && (
                <span className="warn-text"> 跨夜记录按次日结束计算</span>
              )}
            </div>
          </div>
        )}

        <div className="form-row score-row">
          <div className="score-field">
            <span className="score-label">这件事的价值</span>
            <ScoreInput
              name="价值评分"
              value={draft.valueScore}
              onChange={(v) => setDraft({ ...draft, valueScore: v })}
              labels={VALUE_LABEL}
            />
          </div>
          <div className="score-field">
            <span className="score-label">精力消耗</span>
            <ScoreInput
              name="精力消耗"
              value={draft.energyCost}
              onChange={(v) => setDraft({ ...draft, energyCost: v })}
              labels={ENERGY_LABEL}
            />
          </div>
        </div>

        <div className="form-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.relatedToLongTermGoal}
              onChange={(e) =>
                setDraft({ ...draft, relatedToLongTermGoal: e.target.checked })
              }
            />
            服务于长期目标
          </label>
          {draft.relatedToLongTermGoal && goals.length > 0 && (
            <label>
              关联目标
              <select
                value={draft.goalId ?? ''}
                onChange={(e) => setDraft({ ...draft, goalId: e.target.value || null })}
              >
                <option value="">（按分类匹配）</option>
                {goals.filter((g) => g.active).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="full">
          备注（可选，不会出现在分享图里）
          <textarea
            rows={2}
            value={draft.notes ?? ''}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {editingId ? '保存修改' : '添加记录'}
          </button>
          {editingId && (
            <button type="button" className="btn" onClick={resetForm}>
              取消编辑
            </button>
          )}
          {!editingId && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!draft.activityName.trim()) {
                  toast.error('先填写活动名称再存为常用');
                  return;
                }
                await saveTemplate({
                  name: draft.activityName.trim(),
                  categoryId: draft.categoryId,
                  defaultDurationMinutes: liveDuration || 60,
                  defaultValueScore: draft.valueScore,
                  defaultEnergyCost: draft.energyCost,
                });
                toast.success('已存为常用');
              }}
            >
              存为常用
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">03</span>
            记录列表 · {filtered.length} 条
          </h2>
          {selected.size > 0 ? (
            <div className="batch-actions">
              <span className="muted">已选 {selected.size} 条</span>
              <select
                className="text-input"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBatchCategory(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">批量改分类…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-danger btn-small" onClick={handleBatchDelete}>
                删除选中
              </button>
            </div>
          ) : (
            <span className="chart-meta">勾选后可批量改分类或删除</span>
          )}
        </div>

        <div className="filters">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <span>至</span>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          {(filterFrom || filterTo || filterCategory !== 'all') && (
            <button
              className="btn btn-small"
              onClick={() => {
                setFilterFrom('');
                setFilterTo('');
                setFilterCategory('all');
              }}
            >
              清除筛选
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-chart">
            <p>没有符合条件的记录。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cell-check">
                    <label>
                      <input
                        type="checkbox"
                        aria-label="全选"
                        checked={selected.size > 0 && selected.size === filtered.length}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set()
                          )
                        }
                      />
                    </label>
                  </th>
                  <th>日期</th>
                  <th>活动</th>
                  <th>分类</th>
                  <th>时长</th>
                  <th>价值/精力</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cat = categories.find((c) => c.id === r.categoryId);
                  const bucket = classifyRecord(r, cat);
                  return (
                    <tr key={r.id}>
                      <td className="cell-check">
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            aria-label={`选择 ${r.activityName}`}
                          />
                        </label>
                      </td>
                      <td className="nowrap">{r.date}</td>
                      <td>
                        {r.activityName}
                        {r.relatedToLongTermGoal && <span className="tag">目标</span>}
                        {r.crossMidnight && <span className="tag">跨夜</span>}
                      </td>
                      <td>
                        <span className="dot" style={{ background: cat?.color }} />
                        {cat?.name ?? r.categoryId}
                        <span className={`bucket bucket-${bucket}`}>
                          {bucket === 'asset' ? '资产' : bucket === 'liability' ? '负债' : '中性'}
                        </span>
                      </td>
                      <td className="nowrap">{formatMinutes(r.durationMinutes)}</td>
                      <td>
                        {r.valueScore} / {r.energyCost}
                      </td>
                      <td>
                        <button className="link-btn" onClick={() => startEdit(r)}>
                          编辑
                        </button>
                        <button className="link-btn danger" onClick={() => handleDelete([r.id])}>
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
