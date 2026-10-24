import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { formatMinutes, formatShortDate, percent, toDateKey } from '../lib/dates';
import {
  computeBalanceSheet,
  computeDailySeries,
  computeWeeklyGoalTrend,
  makeCustomPeriod,
  makePeriod,
  ATTENTION_LEVEL_LABEL,
} from '../lib/metrics';
import { MetricExplain } from '../components/MetricExplain';
import { SectionTitle, EmptyChart } from '../components/SectionTitle';
import { useIsNarrow } from '../hooks/useIsNarrow';

type RangeKind = 'day' | 'week' | 'month' | 'custom';

const RANGE_LABEL: Record<RangeKind, string> = {
  day: '日',
  week: '周',
  month: '月',
  custom: '区间',
};

const CHART_TICK = { fontSize: 11, fontFamily: 'var(--mono)' } as const;

const LEGEND_WRAP = { fontSize: 11, fontFamily: 'var(--sans)', lineHeight: 1.6 };

/** 图例文字固定使用正文次级色，避免继承系列色导致对比度不足 */
const legendText = (value: string) => (
  <span style={{ color: 'var(--ink-2)' }}>{value}</span>
);

export function Dashboard() {
  const { records, categories, goals, isEmpty, ready } = useData();
  const today = toDateKey(new Date());
  const isNarrow = useIsNarrow(620);

  const [rangeKind, setRangeKind] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);

  const period = useMemo(() => {
    if (rangeKind === 'custom') return makeCustomPeriod(customStart, customEnd);
    return makePeriod(rangeKind, anchor);
  }, [rangeKind, anchor, customStart, customEnd]);

  const sheet = useMemo(
    () => computeBalanceSheet(records, categories, period),
    [records, categories, period]
  );

  const dailySeries = useMemo(
    () => computeDailySeries(records, categories, period.start, period.end),
    [records, categories, period.start, period.end]
  );

  const goalTrend = useMemo(
    () => computeWeeklyGoalTrend(records, 8, period.end),
    [records, period.end]
  );

  const todaySheet = useMemo(
    () => computeBalanceSheet(records, categories, makePeriod('day', today)),
    [records, categories, today]
  );

  const recent = useMemo(
    () =>
      [...records]
        .sort((a, b) =>
          a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)
        )
        .slice(0, 8),
    [records]
  );

  if (!ready) {
    return (
      <div className="page">
        <p className="muted">正在读取本地账本…</p>
      </div>
    );
  }

  if (isEmpty) return <EmptyState />;

  const hasData = sheet.totalMinutes > 0;
  const delta = sheet.totalMinutes - sheet.prevTotalMinutes;

  const pieData = sheet.categories.map((c) => ({
    name: c.name,
    value: c.minutes,
    color: c.color,
  }));

  const flowData = sheet.categories.slice(0, 7).map((c) => ({
    name: c.name,
    本期: c.minutes,
    上期: c.prevMinutes,
  }));

  const dailyData = dailySeries.map((d) => ({
    label: formatShortDate(d.date),
    资产: d.assetMinutes,
    负债: d.liabilityMinutes,
    目标: d.goalMinutes,
  }));

  const trendData = goalTrend.map((g) => ({
    label: formatShortDate(g.weekStart),
    分钟: g.minutes,
  }));

  const attentionData = sheet.attentionByLevel.map((a) => ({
    name: ATTENTION_LEVEL_LABEL[a.level],
    minutes: a.minutes,
    color: a.level === 'high' ? 'var(--accent)' : a.level === 'medium' ? 'var(--warn)' : 'var(--ok)',
  }));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            仪表盘
            <span className="h1-en">DASHBOARD</span>
          </h1>
          <p className="subtitle">
            统计区间 <strong>{period.label}</strong> · 对比 {sheet.prevPeriod.start} ~{' '}
            {sheet.prevPeriod.end}
          </p>
        </div>
        <div className="range-switch" role="tablist" aria-label="统计区间">
          {(Object.keys(RANGE_LABEL) as RangeKind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={rangeKind === k}
              className={rangeKind === k ? 'tab active' : 'tab'}
              onClick={() => setRangeKind(k)}
            >
              {RANGE_LABEL[k]}
            </button>
          ))}
        </div>
      </header>

      {rangeKind === 'custom' ? (
        <div className="card range-picker">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <span className="chart-meta">至</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
        </div>
      ) : (
        <div className="card range-picker">
          <button
            className="btn btn-small"
            onClick={() => shift(rangeKind, -1, anchor, setAnchor)}
          >
            ← 上一{RANGE_LABEL[rangeKind]}
          </button>
          <span className="period-label">{period.start} — {period.end}</span>
          <button className="btn btn-small" onClick={() => shift(rangeKind, 1, anchor, setAnchor)}>
            下一{RANGE_LABEL[rangeKind]} →
          </button>
        </div>
      )}

      {!hasData && (
        <div className="notice">
          该区间没有记录。图表为空不代表你没有活动，只代表这段时间还没有录入数据。
        </div>
      )}

      <section className="stats-grid">
        <StatCard
          label="总记录"
          value={formatMinutes(sheet.totalMinutes)}
          sub={`${sheet.recordCount} 条 · ${sheet.activeDays} 天`}
        />
        <StatCard
          label="时间资产"
          value={formatMinutes(sheet.assetMinutes)}
          sub={percent(sheet.assetMinutes, sheet.totalMinutes)}
          accent="up"
          explain="asset"
        />
        <StatCard
          label="时间负债"
          value={formatMinutes(sheet.liabilityMinutes)}
          sub={percent(sheet.liabilityMinutes, sheet.totalMinutes)}
          accent="down"
          explain="liability"
        />
        <StatCard
          label="时间净值"
          value={formatMinutes(sheet.netMinutes)}
          sub="资产 − 负债"
          accent={sheet.netMinutes >= 0 ? 'up' : 'down'}
          explain="net"
        />
        <StatCard
          label="目标投入"
          value={formatMinutes(sheet.goalMinutes)}
          sub={goals.length ? `${goals.filter((g) => g.active).length} 个进行中` : '尚未创建'}
          explain="goal"
        />
        <StatCard
          label="较上期"
          value={delta === 0 ? '持平' : `${delta > 0 ? '+' : ''}${formatMinutes(delta)}`}
          sub={sheet.prevTotalMinutes ? `上期 ${formatMinutes(sheet.prevTotalMinutes)}` : '上期无数据'}
          accent={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}
          explain="wow"
        />
      </section>

      <div className="card-grid">
        <section className="card">
          <div className="card-head">
            <SectionTitle index="01" title="时间分配" />
            <span className="chart-meta">{period.label} · 单位：分钟</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={isNarrow ? 250 : 280}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={isNarrow ? 46 : 58}
                  outerRadius={isNarrow ? 74 : 96}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                  label={
                    isNarrow
                      ? false
                      : ({ name, value }) => `${name} ${formatMinutes(value as number)}`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMinutes(Number(v))}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 2,
                    fontSize: 12,
                    color: 'var(--ink)',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconSize={8}
                  wrapperStyle={LEGEND_WRAP}
                  formatter={legendText}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="该区间没有可展示的分类数据" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <SectionTitle index="02" title="时间现金流" />
            <span className="chart-meta">本期 vs 上期 · 分钟</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={isNarrow ? 270 : 280}>
              <BarChart data={flowData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--rule)" />
                <XAxis
                  dataKey="name"
                  tick={CHART_TICK}
                  interval={0}
                  angle={isNarrow ? -35 : 0}
                  textAnchor={isNarrow ? 'end' : 'middle'}
                  height={isNarrow ? 62 : 34}
                  stroke="var(--rule-strong)"
                />
                <YAxis tick={CHART_TICK} stroke="var(--rule-strong)" />
                <Tooltip
                  formatter={(v) => formatMinutes(Number(v))}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 2,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={LEGEND_WRAP} formatter={legendText} />
                <Bar dataKey="本期" fill="var(--ink)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="上期" fill="var(--rule)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="该区间没有可展示的数据" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <SectionTitle index="03" title="每日走势" />
            <span className="chart-meta">{period.start} ~ {period.end}</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={isNarrow ? 240 : 260}>
              <LineChart data={dailyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--rule)" />
                <XAxis
                  dataKey="label"
                  tick={CHART_TICK}
                  interval={isNarrow ? 1 : 0}
                  minTickGap={8}
                  stroke="var(--rule-strong)"
                />
                <YAxis tick={CHART_TICK} stroke="var(--rule-strong)" />
                <Tooltip
                  formatter={(v) => formatMinutes(Number(v))}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 2,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={LEGEND_WRAP} formatter={legendText} />
                <Line type="monotone" dataKey="资产" stroke="var(--ok)" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="负债"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="目标"
                  stroke="var(--warn)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="该区间没有可展示的数据" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <SectionTitle index="04" title="目标投入趋势" />
            <span className="chart-meta">最近 8 周 · 分钟/周</span>
          </div>
          {goalTrend.some((g) => g.minutes > 0) ? (
            <ResponsiveContainer width="100%" height={isNarrow ? 240 : 260}>
              <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--rule)" />
                <XAxis dataKey="label" tick={CHART_TICK} minTickGap={6} stroke="var(--rule-strong)" />
                <YAxis tick={CHART_TICK} stroke="var(--rule-strong)" />
                <Tooltip
                  formatter={(v) => formatMinutes(Number(v))}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 2,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="分钟" fill="var(--warn)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="还没有与长期目标关联的记录" />
          )}
        </section>
      </div>

      <div className="card-grid">
        <section className="card">
          <div className="card-head">
            <SectionTitle index="05" title="今日分配" />
            <span className="chart-meta">{today}</span>
          </div>
          {todaySheet.totalMinutes > 0 ? (
            <ul className="mini-list">
              {todaySheet.categories.map((c) => (
                <li key={c.categoryId}>
                  <span className="dot" style={{ background: c.color }} />
                  <span className="mini-name">{c.name}</span>
                  <span className="mini-value">{formatMinutes(c.minutes)}</span>
                  <span className="mini-share">{percent(c.minutes, todaySheet.totalMinutes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">今天还没有记录。</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <SectionTitle index="06" title="注意力成本" />
            <span className="chart-meta">按精力消耗分档</span>
          </div>
          {hasData ? (
            <>
              <ResponsiveContainer width="100%" height={isNarrow ? 200 : 180}>
                <PieChart>
                  <Pie
                    data={attentionData}
                    dataKey="minutes"
                    nameKey="name"
                    innerRadius={36}
                    outerRadius={64}
                    stroke="var(--card)"
                    strokeWidth={2}
                    label={isNarrow ? false : ({ name }) => String(name).split('（')[0]}
                  >
                    {attentionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMinutes(Number(v))}
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--rule-strong)',
                      borderRadius: 2,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                  verticalAlign="bottom"
                  iconSize={8}
                  wrapperStyle={LEGEND_WRAP}
                  formatter={legendText}
                />
                </PieChart>
              </ResponsiveContainer>
              <p className="muted small">
                等效成本 <span className="ledger-num">{formatMinutes(sheet.attentionCost)}</span>
                ，按精力消耗 3 分为 1.0 基准加权，只用于横向比较。
              </p>
            </>
          ) : (
            <EmptyChart text="该区间没有可展示的数据" />
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <SectionTitle index="07" title="最近记录" />
          <Link to="/records" className="chart-meta">
            全部 {records.length} 条 →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted small">还没有记录。</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>活动</th>
                  <th>分类</th>
                  <th>时长</th>
                  <th>价值/精力</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const cat = categories.find((c) => c.id === r.categoryId);
                  return (
                    <tr key={r.id}>
                      <td className="nowrap">{formatShortDate(r.date)}</td>
                      <td>
                        {r.activityName}
                        {r.relatedToLongTermGoal && <span className="tag">目标</span>}
                      </td>
                      <td>
                        <span className="dot" style={{ background: cat?.color }} />
                        {cat?.name ?? r.categoryId}
                      </td>
                      <td className="nowrap">{formatMinutes(r.durationMinutes)}</td>
                      <td className="nowrap">
                        {r.valueScore} / {r.energyCost}
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

function shift(kind: RangeKind, delta: number, anchor: string, setAnchor: (v: string) => void) {
  const current = anchor || toDateKey(new Date());
  const d = new Date(current + 'T12:00:00');
  if (kind === 'day') {
    d.setDate(d.getDate() + delta);
  } else if (kind === 'week') {
    d.setDate(d.getDate() + delta * 7);
  } else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  setAnchor(toDateKey(d));
}

function StatCard({
  label,
  value,
  sub,
  accent,
  explain,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'up' | 'down';
  explain?: 'asset' | 'liability' | 'net' | 'goal' | 'wow';
}) {
  return (
    <div className={`stat-card${accent ? ` accent-${accent}` : ''}`}>
      <div className="stat-label">
        {label}
        {explain && <MetricExplain metric={explain} />}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="page">
      <div className="empty-state">
        <div className="empty-illustration" aria-hidden="true">
          账
        </div>
        <h1>还没有任何记录</h1>
        <p>
          这里会显示你的时间资产、负债与净值。所有数字都来自你亲手填写的记录，
          不会生成任何示例数据，也不会根据你的使用习惯做推断。
        </p>
        <div className="empty-actions">
          <Link to="/records" className="btn btn-primary">
            添加第一条记录
          </Link>
          <Link to="/goals" className="btn">
            先建一个长期目标
          </Link>
        </div>
        <ul className="empty-tips">
          <li>一条记录只需几秒：选分类 → 填时长 → 打分</li>
          <li>分类的「资产 / 中性 / 负债」由你自己定义</li>
          <li>休息、娱乐、家庭陪伴默认中性，不会被判成负债</li>
          <li>数据保存在本机浏览器，可随时导出 JSON 备份</li>
        </ul>
      </div>
    </div>
  );
}
