import type { ReactNode } from "react";

/**
 * 三种学习模式的内容块。显示与否由外层 [data-learn-mode] 属性通过 CSS 控制，
 * 服务端渲染即包含全部内容，切换模式不需要重新加载。
 */
const MODE_LABEL: Record<string, string> = { basic: "基础解释", deep: "深入推导", exam: "考试复习" };

export function Mode({ show, children }: { show: string; children: ReactNode }) {
  const modes = show.split(/\s+/).filter(Boolean);
  return (
    <div className="mode-block" data-mode={modes.join(" ")}>
      <div className="mode-tag">{modes.map((m) => MODE_LABEL[m] ?? m).join(" · ")}</div>
      {children}
    </div>
  );
}

const CALLOUT: Record<string, { label: string; icon: string }> = {
  tip: { label: "提示", icon: "✦" },
  warn: { label: "注意", icon: "!" },
  pitfall: { label: "常见错误", icon: "✕" },
  model: { label: "当前模型", icon: "◇" },
  exam: { label: "考试要点", icon: "★" },
  note: { label: "说明", icon: "i" },
};

export function Callout({ type = "note", title, children }: { type?: string; title?: string; children: ReactNode }) {
  const c = CALLOUT[type] ?? CALLOUT.note;
  return (
    <aside className={`callout callout-${type}`}>
      <div className="callout-head">
        <span className="callout-icon">{c.icon}</span>
        <span>{title ?? c.label}</span>
      </div>
      <div className="callout-body">{children}</div>
    </aside>
  );
}

export function Example({ title = "例题", children }: { title?: string; children: ReactNode }) {
  return (
    <section className="example">
      <div className="example-head">
        <span className="mono text-xs text-amber">EXAMPLE</span>
        <span className="font-semibold">{title}</span>
      </div>
      <div className="example-body">{children}</div>
    </section>
  );
}

export function Solution({ children }: { children: ReactNode }) {
  return (
    <details className="solution">
      <summary>查看解答</summary>
      <div className="solution-body">{children}</div>
    </details>
  );
}
