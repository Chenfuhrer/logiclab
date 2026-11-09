"use client";

import type { Analysis } from "@/lib/fsm/analyze";
import { stateBits, FF_PINS } from "@/lib/fsm/analyze";
import { toLatex, nextStateLatex } from "@/lib/logic/format";
import { Tex } from "@/components/ui/Tex";
import { useLab } from "@/lib/storage/store";
import { StateDiagram, type SDNode } from "./StateDiagram";

/** 驱动方程、状态方程、输出方程（由分析器计算，不是写死的） */
export function EquationsPanel({ a }: { a: Analysis }) {
  const neg = useLab((s) => s.settings.negation);
  const ns = useLab((s) => s.settings.nextState);
  const L = (e: Parameters<typeof toLatex>[0]) => toLatex(e, { negation: neg });
  const pinName = (p: string, ff: string) => `${p}_{${ff.replace(/^Q/, "")}}`;
  // 状态方程中把现态 Q_i 写成 Q_i^n
  const withN = (s: string) => s.replace(/Q_\{(\d+)\}/g, "Q_{$1}^{n}");
  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow mb-2">驱动方程</div>
        <div className="space-y-1">
          {a.circuit.ffs.map((ff) => (
            <div key={ff.name} className="flex flex-wrap gap-x-6">
              {FF_PINS[ff.type].map((p) => (
                <Tex key={p}>{`${pinName(p, ff.name)} = ${L(ff.inputs[p]!)}`}</Tex>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">状态方程（代入特性方程并化简）</div>
        <div className="space-y-1">
          {a.stateEqs.map((s) => (
            <div key={s.name}>
              <Tex>{`${nextStateLatex(s.name, ns)} = ${withN(L(s.simplified))}`}</Tex>
            </div>
          ))}
        </div>
      </div>
      {a.outputEqs.length > 0 && (
        <div>
          <div className="eyebrow mb-2">输出方程 · {a.kind === "moore" ? "Moore 型（只取决于现态）" : "Mealy 型（还取决于输入）"}</div>
          {a.outputEqs.map((o) => (
            <div key={o.name}>
              <Tex>{`${o.name} = ${L(o.simplified)}`}</Tex>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 状态转换表 */
export function StateTablePanel({ a, current, showDrives = true }: { a: Analysis; current?: number | null; showDrives?: boolean }) {
  const n = a.stateVars.length;
  const K = 1 << a.nInputs;
  const drivesCols = showDrives ? a.circuit.ffs.flatMap((ff) => FF_PINS[ff.type].map((p) => `${p}_${ff.name}`)) : [];
  const unused = new Set(a.selfStart.unused);
  return (
    <div className="overflow-x-auto thin-scroll">
      <table className="ltable w-full">
        <thead>
          <tr>
            <th>
              现态 <span className="normal-case">{a.stateVars.join("")}</span>
            </th>
            {a.nInputs > 0 && <th className="sep">{a.circuit.inputs.join("")}</th>}
            {drivesCols.map((c, i) => (
              <th key={c} className={i === 0 ? "sep" : ""}>
                {c.replace(/_Q/, "")}
              </th>
            ))}
            <th className="sep">次态</th>
            {a.circuit.outputs.map((o) => (
              <th key={o.name} className="sep">
                {o.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.rows.map((r, i) => {
            const cur = current === r.state;
            return (
              <tr key={i} className={cur ? "!bg-[var(--amber-soft)]" : unused.has(r.state) ? "opacity-60" : ""}>
                <td className={cur ? "text-amber font-bold" : ""}>
                  {stateBits(r.state, n)}
                  {unused.has(r.state) && <span className="ml-1 text-[10px] text-muted">未用</span>}
                </td>
                {a.nInputs > 0 && <td className="sep">{stateBits(r.input, a.nInputs)}</td>}
                {drivesCols.map((c, j) => (
                  <td key={c} className={j === 0 ? "sep" : ""}>
                    {r.drives[c]}
                  </td>
                ))}
                <td className="sep font-semibold">{r.violations.length ? <span className="text-sigx">不定</span> : stateBits(r.next, n)}</td>
                {r.outputs.map((o, k) => (
                  <td key={k} className="sep">
                    {o}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {K > 1 && <p className="text-xs text-muted mt-2">共 {a.rows.length} 行：{1 << n} 个现态 × {K} 种输入组合。</p>}
    </div>
  );
}

export function analysisDiagram(a: Analysis): { nodes: SDNode[]; edges: { from: number; to: number; label?: string }[]; order?: number[] } {
  const n = a.stateVars.length;
  const trap = new Set(a.selfStart.details.filter((d) => d.verdict === "never").map((d) => d.state));
  const unused = new Set(a.selfStart.unused);
  const moore = a.kind === "moore";
  const nodes: SDNode[] = Array.from({ length: a.nStates }, (_, s) => {
    const row = a.rows[s * (1 << a.nInputs)];
    return {
      id: s,
      label: stateBits(s, n),
      sub: moore && a.circuit.outputs.length ? row.outputs.join("") : undefined,
      kind: trap.has(s) ? "trap" : unused.has(s) ? "unused" : "legal",
    };
  });
  const edges = a.rows.map((r) => ({
    from: r.state,
    to: r.next,
    label: a.nInputs ? `${stateBits(r.input, a.nInputs)}${!moore && a.circuit.outputs.length ? "/" + r.outputs.join("") : ""}` : !moore && a.circuit.outputs.length ? `/${r.outputs.join("")}` : undefined,
  }));
  const order = a.nInputs === 0 && a.selfStart.legal.length ? orderCycle(a) : undefined;
  return { nodes, edges, order };
}

function orderCycle(a: Analysis): number[] {
  // 按状态转移顺序排列主循环
  const legal = new Set(a.selfStart.legal);
  const start = a.selfStart.legal.includes(a.initial) ? a.initial : a.selfStart.legal[0];
  const out: number[] = [];
  let s = start;
  while (legal.has(s) && !out.includes(s)) {
    out.push(s);
    s = a.rows[s].next;
  }
  return out;
}

export function DiagramPanel({ a, current, active, size }: { a: Analysis; current?: number | null; active?: { from: number; to: number } | null; size?: number }) {
  const d = analysisDiagram(a);
  return <StateDiagram nodes={d.nodes} edges={d.edges} order={d.order} current={current} activeEdge={active} size={size} />;
}

/** 自启动检查报告 */
export function SelfStartPanel({ a }: { a: Analysis }) {
  const n = a.stateVars.length;
  const s = a.selfStart;
  const b = (x: number) => stateBits(x, n);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <span className={`chip ${s.selfStarting ? "chip-accent" : "chip-danger"}`}>{s.selfStarting ? "能够自启动" : "不能自启动"}</span>
        <span className="chip">合法状态 {s.legal.length}</span>
        <span className="chip">未用状态 {s.unused.length}</span>
        <span className="chip">从初始态不可达 {s.unreachable.length}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">合法（主循环）</dt>
        <dd className="mono">{s.legal.map(b).join(" → ") || "—"}</dd>
        <dt className="text-muted">未用状态</dt>
        <dd className="mono">{s.unused.map(b).join("，") || "无"}</dd>
        <dt className="text-muted">从初始 {b(a.initial)} 可达</dt>
        <dd className="mono">{s.reachable.map(b).join("，")}</dd>
        {s.invalidCycles.length > 0 && (
          <>
            <dt className="text-sigx">无效循环</dt>
            <dd className="mono text-sigx">{s.invalidCycles.map((c) => c.map(b).join("→") + "→" + b(c[0])).join("；")}</dd>
          </>
        )}
      </dl>
      {s.details.length > 0 && (
        <ul className="space-y-1 text-xs">
          {s.details.map((d) => (
            <li key={d.state} className="flex gap-2 items-start">
              <span className={`lv ${d.verdict === "always" ? "lv-1" : d.verdict === "never" ? "lv-x" : "lv-z"} shrink-0`}>{d.verdict === "always" ? "✓" : d.verdict === "never" ? "✕" : "?"}</span>
              <span className="mono">
                {b(d.state)}
                {d.path && d.path.length > 1 ? `：${d.path.map(b).join(" → ")}` : ""}
              </span>
              <span className="text-muted">{d.verdict === "always" ? "必然进入主循环" : d.verdict === "never" ? "永远进不了主循环" : "取决于输入序列"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted leading-relaxed">判定依据：从每个未用状态出发，若在任意输入序列下都必然进入合法状态集合，才算能自启动；仅仅“存在未用状态”并不等于不能自启动。</p>
    </div>
  );
}
