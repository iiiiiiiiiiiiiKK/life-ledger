import { useState } from 'react';

const CONTENT: Record<string, { title: string; formula: string; body: string }> = {
  asset: {
    title: '时间资产',
    formula: '时间资产 = Σ 归类为「资产」的时间 + 标记为服务长期目标的时间',
    body:
      '归属规则（按顺序判定，命中即停）：\n' +
      '1. 该记录所属分类被设为「资产」→ 计入资产；\n' +
      '2. 分类为中性或负债，但这条记录勾选了「服务于长期目标」→ 计入资产；\n' +
      '3. 其余 → 中性，不计入资产。\n' +
      '同一分钟只会被计入一个桶，因此资产 + 负债 + 中性 = 总时长。\n' +
      '休息、娱乐、家庭陪伴默认是中性，只有你自己改分类设置才会变动。',
  },
  liability: {
    title: '时间负债',
    formula: '时间负债 = Σ 归类为「负债」的时间',
    body:
      '只有当某个分类被你标记为「负债」时，其中的时间才计入负债。' +
      '系统不会自动判断你的娱乐、家庭时间或休息是浪费——这个判断权在你。',
  },
  net: {
    title: '时间净值',
    formula: '时间净值 = 时间资产 − 时间负债',
    body:
      '这是一个产品内部的对比口径，用来看「你主动投入的时间」与「你认定被消耗的时间」之间的差额。' +
      '它不是衡量一个人价值的科学公式，也不代表任何客观结论。',
  },
  goal: {
    title: '长期目标投入',
    formula: '长期目标投入 = Σ 勾选了「服务于长期目标」的记录时长',
    body:
      '统计区间内所有标记为服务长期目标的时间总和。' +
      '目标维度上的完成度 = 实际投入 ÷（期望周投入 × 区间周数）。',
  },
  wow: {
    title: '与上期对比',
    formula: '变化 = 本期总记录时长 − 上一同长度区间总记录时长',
    body:
      '这是一个描述性对比，只说明两个区间记录的时长不同。' +
      '它不代表因果关系，也不预测下一期会怎样——记录习惯本身变化也会影响这个数字。',
  },
  attention: {
    title: '注意力成本',
    formula: '注意力成本 = Σ 时长 × (精力消耗 ÷ 3)',
    body:
      '用你记录的精力消耗评分做加权，以 3 分为 1.0 基准。' +
      '结果以「等效分钟」表示，用于横向比较不同活动的消耗强度。',
  },
  flow: {
    title: '时间现金流',
    formula: '分类现金流 = 该分类在区间内的时长；变化 = 本期 − 上期',
    body:
      '「流入 / 流出」只是描述时间投入结构变化的比喻：' +
      '时间无法储存，本期投入不会自动变成下期的时间。',
  },
};

export function MetricExplain({ metric }: { metric: keyof typeof CONTENT }) {
  const [open, setOpen] = useState(false);
  const c = CONTENT[metric];
  if (!c) return null;

  return (
    <span className="explain-wrap">
      <button
        type="button"
        className="explain-btn"
        aria-label={`查看${c.title}的计算方式`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="explain-pop" role="dialog">
          <strong>{c.title}</strong>
          <code className="explain-formula">{c.formula}</code>
          <span className="explain-body">{c.body}</span>
          <button type="button" className="explain-close" onClick={() => setOpen(false)}>
            收起
          </button>
        </span>
      )}
    </span>
  );
}
