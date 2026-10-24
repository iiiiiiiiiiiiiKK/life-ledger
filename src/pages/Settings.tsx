import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useData } from '../store/DataContext';
import { KIND_LABEL, SCHEMA_VERSION } from '../types';
import type { Category } from '../types';
import { downloadFile } from '../lib/utils';
import { exportBackup, importBackup } from '../store/db';

export function Settings() {
  const { categories, goals, templates, records, clearAll, addCategory, updateCategory, deleteCategory, deleteTemplate } =
    useData();
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'asset' | 'neutral' | 'liability'>('neutral');
  const [newColor, setNewColor] = useState('#3b82f6');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const data = await exportBackup();
    downloadFile(
      JSON.stringify(data, null, 2),
      `ppbs-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
    toast.success('备份已导出');
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象');
      const mode = window.confirm(
        '点击「确定」= 替换现有数据\n点击「取消」= 与现有数据合并'
      )
        ? 'replace'
        : 'merge';
      await importBackup(data, mode);
      toast.success('导入完成，正在刷新…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`导入失败：${e instanceof Error ? e.message : e}`);
    }
  }

  async function handleClear() {
    const ok = window.confirm(
      '这将删除本机保存的全部记录、目标、模板和自定义分类，且无法撤销。\n建议先导出备份。确定继续吗？'
    );
    if (!ok) return;
    const ok2 = window.confirm('再次确认：所有数据将被清空。');
    if (!ok2) return;
    await clearAll();
    toast.success('数据已清空');
    setTimeout(() => window.location.reload(), 600);
  }

  async function handleAddCategory() {
    if (!newName.trim()) {
      toast.error('请输入分类名称');
      return;
    }
    await addCategory({
      name: newName.trim(),
      kind: newKind,
      color: newColor,
    });
    setNewName('');
    toast.success('分类已添加');
  }

  async function toggleKind(cat: Category) {
    const next: Category = {
      ...cat,
      kind: cat.kind === 'asset' ? 'neutral' : cat.kind === 'neutral' ? 'liability' : 'asset',
    };
    await updateCategory(next);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            设置与数据
            <span className="h1-en">SETTINGS</span>
          </h1>
          <p className="subtitle">所有数据仅存放在本机浏览器（IndexedDB），不会上传到任何服务器。</p>
        </div>
      </header>

      <div className="card-duo">
      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">01</span>
            备份与恢复
          </h2>
          <span className="chart-meta">JSON · 替换或合并</span>
        </div>
        <div className="button-row">
          <button className="btn btn-primary" onClick={handleExport}>导出 JSON 备份</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>从 JSON 恢复</button>
          <button className="btn btn-danger btn-push-right" onClick={handleClear}>
            清除全部本地数据
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="muted small">
          导入时可选择「替换」或「合并」。当前数据结构版本 v{SCHEMA_VERSION}，导入旧版本文件会自动执行字段迁移。
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">02</span>
            隐私说明
          </h2>
          <span className="chart-meta">本地优先</span>
        </div>
        <ul className="bullet-list">
          <li>本版本没有账号体系，也没有后端服务器。</li>
          <li>所有记录、目标、模板都保存在浏览器的 IndexedDB 数据库中。</li>
          <li>清除浏览器站点数据会删除本地数据，请定期导出备份。</li>
          <li>分享图默认不包含活动备注，也可以隐藏任意分类。</li>
        </ul>
      </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">03</span>
            分类管理
          </h2>
          <span className="chart-meta">价值判断由你决定</span>
        </div>
        <p className="muted">
          每个分类都有「资产 / 中性 / 负债」三种价值判断，由你自己决定。系统默认把休息、娱乐、家庭陪伴设为中性，
          不会自动把它们判定为负债。点击分类的价值标签可以切换。
        </p>
        <div className="button-row category-add">
          <input
            className="text-input"
            placeholder="新分类名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="text-input"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as any)}
          >
            <option value="asset">资产</option>
            <option value="neutral">中性</option>
            <option value="liability">负债</option>
          </select>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          <button className="btn btn-primary" onClick={handleAddCategory}>添加分类</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>分类</th>
                <th>价值判断</th>
                <th>说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <span className="dot" style={{ background: cat.color }} />
                    {cat.name}
                    {cat.isSystem && <span className="muted">（预设）</span>}
                  </td>
                  <td>
                    <button
                      className={`kind-badge kind-${cat.kind}`}
                      onClick={() => toggleKind(cat)}
                      title="点击切换价值判断"
                    >
                      {KIND_LABEL[cat.kind]}
                    </button>
                  </td>
                  <td className="muted">{cat.hint ?? '—'}</td>
                  <td>
                    {!cat.isSystem && (
                      <button
                        className="link-btn danger"
                        onClick={async () => {
                          try {
                            await deleteCategory(cat.id);
                            toast.success('已删除分类');
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <span className="panel-index" aria-hidden="true">04</span>
            常用活动 · {templates.length}
          </h2>
          <span className="chart-meta">在记录页一键填表</span>
        </div>
        {templates.length === 0 ? (
          <p className="muted">在「记录」页填写活动后点击「存为常用」即可创建模板。</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>分类</th>
                  <th>默认时长</th>
                  <th>使用次数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{categories.find((c) => c.id === t.categoryId)?.name ?? t.categoryId}</td>
                    <td>{t.defaultDurationMinutes} 分钟</td>
                    <td>{t.useCount}</td>
                    <td>
                      <button
                        className="link-btn danger"
                        onClick={async () => {
                          await deleteTemplate(t.id);
                          toast.success('已删除模板');
                        }}
                      >
                        删除
                      </button>
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
            <span className="panel-index" aria-hidden="true">05</span>
            当前规模
          </h2>
          <span className="chart-meta">本机数据量</span>
        </div>
        <div className="mini-list">
          <li>
            <span className="mini-name">时间记录</span>
            <span className="mini-value ledger-num">{records.length}</span>
            <span className="mini-share">条</span>
          </li>
          <li>
            <span className="mini-name">分类</span>
            <span className="mini-value ledger-num">{categories.length}</span>
            <span className="mini-share">个</span>
          </li>
          <li>
            <span className="mini-name">长期目标</span>
            <span className="mini-value ledger-num">{goals.length}</span>
            <span className="mini-share">个</span>
          </li>
          <li>
            <span className="mini-name">常用活动</span>
            <span className="mini-value ledger-num">{templates.length}</span>
            <span className="mini-share">个</span>
          </li>
        </div>
      </section>
    </div>
  );
}
