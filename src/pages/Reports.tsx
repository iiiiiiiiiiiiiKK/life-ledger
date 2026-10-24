import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useData } from '../store/DataContext';
import { buildWeeklyReport, reportToMarkdown } from '../lib/reports';
import { makePeriod } from '../lib/metrics';
import { formatMinutes } from '../lib/dates';
import { downloadFile } from '../lib/utils';
import { renderReportImage } from '../lib/reportImage';
import { ShareCard } from '../components/ShareCard';

export function Reports() {
  const { records, categories, goals } = useData();

  const [anchorDate, setAnchorDate] = useState(() => {
    const d = new Date();
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  });
  const [customTitle, setCustomTitle] = useState('');
  const [customObs, setCustomObs] = useState('');
  const [customSug, setCustomSug] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [showShare, setShowShare] = useState(false);

  const period = useMemo(() => makePeriod('week', anchorDate), [anchorDate]);
  const report = useMemo(
    () => buildWeeklyReport(records, categories, goals, period),
    [records, categories, goals, period]
  );

  function shiftWeek(delta: number) {
    const d = new Date(anchorDate + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setAnchorDate(d.toISOString().slice(0, 10));
  }

  function exportMarkdown() {
    const md = reportToMarkdown(report, {
      title: customTitle || undefined,
      observations: customObs || undefined,
      suggestions: customSug || undefined,
      notes: customNotes || undefined,
    });
    downloadFile(md, `周报-${period.start}.md`, 'text/markdown;charset=utf-8');
    toast.success('周报已导出为 Markdown');
  }

  function exportReportImage() {
    try {
      const dataUrl = renderReportImage(report, customTitle || undefined);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `周报-${period.start}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('周报图片已导出');
    } catch (e) {
      toast.error(`导出失败：${e instanceof Error ? e.message : e}`);
    }
  }

  function exportReportJson() {
    const payload = {
      period: report.period,
      prevPeriod: report.prevPeriod,
      generatedAt: new Date(report.generatedAt).toISOString(),
      totalMinutes: report.totalMinutes,
      assetMinutes: report.sheet.assetMinutes,
      liabilityMinutes: report.liabilityMinutes,
      neutralMinutes: report.sheet.neutralMinutes,
      netMinutes: report.sheet.netMinutes,
      goalMinutes: report.sheet.goalMinutes,
      recordCount: report.sample.recordCount,
      activeDays: report.sample.activeDays,
      categories: report.categories,
      topActivities: report.topActivities,
      goalProgress: report.goalProgress.map((g) => ({
        goalId: g.goal.id,
        name: g.goal.name,
        actualMinutes: g.actualMinutes,
        targetMinutes: g.targetMinutes,
      })),
      observations: customObs ? customObs.split('\n') : report.observations,
      suggestions: customSug ? customSug.split('\n') : report.suggestions,
      caveats: report.caveats,
    };
    downloadFile(
      JSON.stringify(payload, null, 2),
      `周报-${period.start}.json`,
      'application/json'
    );
    toast.success('周报数据已导出为 JSON');
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            周报
            <span className="h1-en">WEEKLY REPORT</span>
          </h1>
          <p className="subtitle">基于你记录的真实数据生成描述性报告。不做预测，重在复盘。</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-small" onClick={exportMarkdown}>导出 Markdown</button>
          <button className="btn btn-small" onClick={exportReportImage}>导出图片</button>
          <button className="btn btn-small" onClick={exportReportJson}>导出 JSON</button>
          <button className="btn btn-small btn-primary" onClick={() => setShowShare((v) => !v)}>
            {showShare ? '收起分享图' : '生成分享图'}
          </button>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">01</span>
            本期概览
          </h2>
          <span className="chart-meta">对比 {report.prevPeriod.start} ~ {report.prevPeriod.end}</span>
        </div>

        <div className="period-nav">
          <button className="btn btn-small" onClick={() => shiftWeek(-1)}>
            ← 上一周
          </button>
          <span className="period-label">
            {period.start} — {period.end}
          </span>
          <button className="btn btn-small" onClick={() => shiftWeek(1)}>
            下一周 →
          </button>
        </div>

        <div className="report-overview" style={{ marginTop: 12 }}>
          <div className="stat-item">
            <span className="stat-label">总时长</span>
            <span className="stat-value">{formatMinutes(report.totalMinutes)}</span>
            <span className="stat-sub">上期 {formatMinutes(report.prevTotalMinutes)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">资产</span>
            <span className="stat-value">{formatMinutes(report.sheet.assetMinutes)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">负债</span>
            <span className="stat-value">{formatMinutes(report.sheet.liabilityMinutes)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">净值</span>
            <span className="stat-value">{formatMinutes(report.sheet.netMinutes)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">样本</span>
            <span className="stat-value">
              {report.sample.recordCount} / {report.sample.activeDays} 天
            </span>
          </div>
        </div>

        {report.sample.note && (
          <p
            className={report.sample.sufficient ? 'muted small' : 'notice inline-notice'}
            style={{ marginTop: 10 }}
          >
            {report.sample.note}
          </p>
        )}
      </section>

      {showShare && (
        <ShareCard
          sheet={report.sheet}
          categories={categories}
          topActivityNames={report.topActivities.map((a) => a.name)}
          defaultTitle={`${period.start} ~ ${period.end} 的时间账单`}
        />
      )}

      <div className="card-duo">
        <section className="card">
          <div className="card-head">
            <h2>
              <span className="panel-index" aria-hidden="true">02</span>
              本期观察
            </h2>
            <span className="chart-meta">描述性 · 不做因果推断</span>
          </div>
          <ul className="bullet-list">
            {report.observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <span className="panel-index" aria-hidden="true">03</span>
              下周可以试试
            </h2>
            <span className="chart-meta">只是可选方向</span>
          </div>
          <ul className="bullet-list suggestions">
            {report.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="muted small">以上建议由本地数据推导，不代表会发生什么。</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">04</span>
            投入最多的活动
          </h2>
          <span className="chart-meta">按总时长排序</span>
        </div>
        {report.topActivities.length === 0 ? (
          <div className="empty-chart">
            <p>本期没有记录。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>活动</th>
                  <th>分类</th>
                  <th>时长</th>
                  <th>占比</th>
                  <th>条数</th>
                </tr>
              </thead>
              <tbody>
                {report.topActivities.map((a) => (
                  <tr key={`${a.categoryId}-${a.name}`}>
                    <td>{a.name}</td>
                    <td>
                      <span className="dot" style={{ background: a.color }} />
                      {a.categoryName}
                    </td>
                    <td>{formatMinutes(a.minutes)}</td>
                    <td>{(a.share * 100).toFixed(1)}%</td>
                    <td>{a.recordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">05</span>
            长期目标完成情况
          </h2>
          <span className="chart-meta">实际 ÷ 本期折算目标</span>
        </div>
        {report.goalProgress.length === 0 ? (
          <div className="empty-chart">
            <p>尚未创建长期目标。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>目标</th>
                  <th>实际投入</th>
                  <th>本期折算目标</th>
                  <th>完成度</th>
                </tr>
              </thead>
              <tbody>
                {report.goalProgress.map((g) => (
                  <tr key={g.goal.id}>
                    <td>{g.goal.name}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">06</span>
            手动修改
          </h2>
          <span className="chart-meta">仅影响导出的文字</span>
        </div>
        <p className="muted small">修改后的文字会用于导出，图表数字仍来自原始记录。</p>
        <div className="card-duo">
          <label className="full">
            标题
            <input
              type="text"
              placeholder="给报告起个名字"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </label>
          <label className="full">
            备忘
            <input
              type="text"
              placeholder="这周的其他想法"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
            />
          </label>
          <label className="full">
            我的观察
            <textarea
              rows={3}
              placeholder="在此添加你自己的观察"
              value={customObs}
              onChange={(e) => setCustomObs(e.target.value)}
            />
          </label>
          <label className="full">
            我的建议
            <textarea
              rows={3}
              placeholder="给出自己这周的建议"
              value={customSug}
              onChange={(e) => setCustomSug(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">07</span>
            数据说明
          </h2>
          <span className="chart-meta">口径与局限</span>
        </div>
        <ul className="bullet-list">
          {report.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
