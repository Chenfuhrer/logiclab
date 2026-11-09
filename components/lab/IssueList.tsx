import type { SimIssue } from "@/lib/sim/types";

/** 仿真诊断信息（错误/警告），不隐藏任何引擎报告的问题 */
export function IssueList({ issues, max = 6 }: { issues: SimIssue[]; max?: number }) {
  const shown = issues.filter((i) => i.level !== "info");
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5 text-xs" aria-label="仿真诊断">
      {shown.slice(0, max).map((i, k) => (
        <li key={k} className={`flex gap-2 rounded-lg px-2.5 py-1.5 border ${i.level === "error" ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-danger" : "border-[color-mix(in_srgb,var(--amber)_40%,transparent)] text-amber"}`}>
          <span className="mono shrink-0">{i.level === "error" ? "ERR" : "WARN"}</span>
          <span className="text-ink-2">{i.message}</span>
        </li>
      ))}
      {shown.length > max && <li className="text-muted">另有 {shown.length - max} 条……</li>}
    </ul>
  );
}
