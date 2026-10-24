import type { ReactNode } from 'react';

/** 带编号的面板小节标题：01 / 02 / … 呼应报表排版 */
export function SectionTitle({
  index,
  title,
  meta,
}: {
  index?: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <>
      <h2>
        {index && (
          <span className="panel-index" aria-hidden="true">
            {index}
          </span>
        )}
        {title}
      </h2>
      {meta ? <span className="chart-meta">{meta}</span> : null}
    </>
  );
}

/** 空状态占位（图表用） */
export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="empty-chart">
      <p>{text}</p>
    </div>
  );
}
