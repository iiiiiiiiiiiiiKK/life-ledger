import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import type { BalanceSheet, Category } from '../types';
import { downloadShareImage, renderShareImage } from '../lib/share';
import type { ShareOptions } from '../lib/share';

export function ShareCard({
  sheet,
  categories,
  topActivityNames,
  defaultTitle,
}: {
  sheet: BalanceSheet;
  categories: Category[];
  topActivityNames: string[];
  defaultTitle: string;
}) {
  const [ratio, setRatio] = useState<'1:1' | '3:4'>('3:4');
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(
    `共记录 ${sheet.recordCount} 条 · ${sheet.activeDays} 天`
  );
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showLiability, setShowLiability] = useState(true);
  const [showTopActivities, setShowTopActivities] = useState(true);
  const [visible, setVisible] = useState<string[]>(() =>
    sheet.categories.filter((c) => c.minutes > 0).map((c) => c.categoryId)
  );
  const [preview, setPreview] = useState<string | null>(null);

  const opts: ShareOptions = useMemo(
    () => ({
      ratio,
      title: title.trim() || defaultTitle,
      subtitle,
      visibleCategoryIds: visible,
      showLiability,
      showTopActivities,
      topActivityNames,
      theme,
    }),
    [ratio, title, subtitle, visible, showLiability, showTopActivities, topActivityNames, theme, defaultTitle]
  );

  function generate() {
    try {
      const url = renderShareImage(sheet, categories, opts);
      setPreview(url);
    } catch (e) {
      toast.error(`生成失败：${e instanceof Error ? e.message : e}`);
    }
  }

  function toggleCategory(id: string) {
    setVisible((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <section className="card share-card">
      <h2>我的人生财报 · 分享图</h2>
      <p className="muted small">
        分享内容由你主动选择。活动备注永远不会出现在分享图里；不想展示的分类可以取消勾选。
      </p>

      <div className="share-controls">
        <div className="form-row">
          <label>
            比例
            <select value={ratio} onChange={(e) => setRatio(e.target.value as any)}>
              <option value="1:1">1:1 方图</option>
              <option value="3:4">3:4 竖图</option>
            </select>
          </label>
          <label>
            主题
            <select value={theme} onChange={(e) => setTheme(e.target.value as any)}>
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </label>
        </div>

        <label className="full">
          标题
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="full">
          副标题（可选）
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>

        <div className="form-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showLiability}
              onChange={(e) => setShowLiability(e.target.checked)}
            />
            显示负债摘要
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showTopActivities}
              onChange={(e) => setShowTopActivities(e.target.checked)}
            />
            显示活动排行
          </label>
        </div>

        <div className="share-categories">
          <span className="template-label">显示哪些分类：</span>
          {categories.map((c) => (
            <label key={c.id} className="chip check-chip">
              <input
                type="checkbox"
                checked={visible.includes(c.id)}
                onChange={() => toggleCategory(c.id)}
              />
              <span className="dot" style={{ background: c.color }} />
              {c.name}
            </label>
          ))}
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={generate}>生成预览</button>
          <button
            className="btn"
            disabled={!preview}
            onClick={() => {
              if (!preview) return;
              downloadShareImage(preview, `人生财报-${sheet.period.start}.png`);
              toast.success('分享图已导出');
            }}
          >
            下载 PNG
          </button>
        </div>
      </div>

      {preview && (
        <div className="share-preview">
          <img src={preview} alt="人生财报分享图预览" />
        </div>
      )}
    </section>
  );
}
