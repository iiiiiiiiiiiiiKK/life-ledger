import { useState } from 'react';
import { useData } from '../store/DataContext';
import { formatMinutes } from '../lib/dates';
import { computeBalanceSheet, computeGoalProgress, makePeriod } from '../lib/metrics';
import { toDateKey } from '../lib/dates';

export function Goals() {
  const { goals, categories, records, addGoal, updateGoal, deleteGoal } = useData();
  const [draft, setDraft] = useState({
    name: '',
    categoryId: 'learning',
    targetMinutesPerWeek: 120,
    startDate: toDateKey(new Date()),
    notes: '',
  });

  const period = makePeriod('week', toDateKey(new Date()));
  const progress = computeGoalProgress(records, goals, period);
  const sheet = computeBalanceSheet(records, categories, period);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      return;
    }
    await addGoal({
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      targetMinutesPerWeek: Math.max(1, Number(draft.targetMinutesPerWeek) || 1),
      startDate: draft.startDate,
      notes: draft.notes.trim() || undefined,
      active: true,
    });
    setDraft({ ...draft, name: '', notes: '' });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            长期目标
            <span className="h1-en">GOALS</span>
          </h1>
          <p className="subtitle">定义你想长期投入的方向，系统统计与目标相关的实际投入。</p>
        </div>
      </header>

      <form className="card goal-form" onSubmit={handleSubmit}>
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">01</span>
            新建目标
          </h2>
          <span className="chart-meta">期望投入按周折算</span>
        </div>
        <div className="form-row">
          <label className="full">
            目标名称
            <input
              type="text"
              placeholder="例如：每周读完 1 本书"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            关联分类
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            每周期望投入（分钟）
            <input
              type="number"
              min={1}
              value={draft.targetMinutesPerWeek}
              onChange={(e) =>
                setDraft({ ...draft, targetMinutesPerWeek: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            开始日期
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
          </label>
        </div>
        <label className="full">
          备注
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            添加目标
          </button>
        </div>
      </form>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">02</span>
            本周进度
          </h2>
          <span className="chart-meta">{period.label}</span>
        </div>
        {progress.length === 0 ? (
          <div className="empty-chart">
            <p>还没有目标，创建一个开始跟踪。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>目标</th>
                  <th>分类</th>
                  <th>实际投入</th>
                  <th>本周目标</th>
                  <th>完成度</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((g) => {
                  const cat = categories.find((c) => c.id === g.goal.categoryId);
                  return (
                    <tr key={g.goal.id}>
                      <td>
                        {g.goal.name}
                        {g.goal.notes && <div className="muted small">{g.goal.notes}</div>}
                      </td>
                      <td>
                        <span className="dot" style={{ background: cat?.color }} />
                        {cat?.name ?? g.goal.categoryId}
                      </td>
                      <td>{formatMinutes(g.actualMinutes)}</td>
                      <td>{formatMinutes(g.targetMinutes)}</td>
                      <td>
                        <div className="progress-bar">
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${Math.min(g.completion * 100, 100)}%` }}
                            />
                          </div>
                          <span>{Math.round(g.completion * 100)}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${g.goal.active ? 'badge-active' : 'badge-inactive'}`}>
                          {g.goal.active ? '进行中' : '已暂停'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => updateGoal({ ...g.goal, active: !g.goal.active })}
                        >
                          {g.goal.active ? '暂停' : '恢复'}
                        </button>
                        <button
                          className="link-btn danger"
                          onClick={() => {
                            if (window.confirm(`确定删除目标「${g.goal.name}」吗？`)) {
                              deleteGoal(g.goal.id);
                            }
                          }}
                        >
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

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">03</span>
            本周概览
          </h2>
          <span className="chart-meta">按周聚合 · 缺失周补 0</span>
        </div>
        <p className="muted small">
          本周标记为服务长期目标的时间共{' '}
          <strong className="ledger-num">{formatMinutes(sheet.goalMinutes)}</strong>
          。趋势图按周聚合，没有记录的周显示为 0，不做插值，也不预测未来。
        </p>
      </section>

      <section className="card">
        <h2>
          <span className="panel-index" aria-hidden="true">04</span>
          统计口径
        </h2>
        <ul className="bullet-list">
          <li>记录勾选「服务于长期目标」并关联某个目标 → 计入该目标的实际投入。</li>
          <li>只勾选「服务于长期目标」但没有指定目标 → 按记录的分类匹配目标。</li>
          <li>本期目标 = 每周期望投入 × 本期周数（不足一周按天数折算）。</li>
          <li>完成度 = 实际投入 ÷ 本期折算目标，可能超过 100%。</li>
        </ul>
      </section>
    </div>
  );
}
