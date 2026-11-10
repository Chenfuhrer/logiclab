"use client";

import { useMemo, useState } from "react";
import {
  tryParse,
  truthTable,
  sortedVariables,
  minterms,
  maxterms,
  minimizeSOP,
  minimizePOS,
  solutionToSOP,
  implicantPattern,
  implicantToExpr,
  toLatex,
  checkEquivalence,
  describeCounterexample,
  verifyDerivation,
  RULES,
  type DerivationStep,
  type RuleId,
  type Expr,
  parseExpr,
} from "@/lib/logic";
import { checkCover, type CellValue } from "@/lib/logic/kmap";
import { exprToNetlist } from "@/lib/fsm/netlistgen";
import { combToVerilog } from "@/lib/hdl/codegen";
import { Tex } from "@/components/ui/Tex";
import { KMap, GROUP_COLORS } from "@/components/karnaugh/KMap";
import { Schematic } from "@/components/circuit/Schematic";
import { useSimulation } from "@/hooks/useSimulation";
import { useLab } from "@/lib/storage/store";
import type { Netlist } from "@/lib/sim/types";

function useNeg() {
  return useLab((s) => s.settings.negation);
}

// ───────────────────────── 真值表 ─────────────────────────

export function TruthTable({ expr, vars, name = "Y" }: { expr: string; vars?: string[]; name?: string }) {
  const r = tryParse(expr);
  const neg = useNeg();
  if (!r.ok) return <p className="text-danger text-sm">表达式错误：{r.error}</p>;
  const vs = vars ?? sortedVariables(r.expr);
  const t = truthTable(r.expr, vs);
  return (
    <div className="widget card p-4 inline-block max-w-full">
      <div className="mb-2 text-sm">
        <Tex>{`${name} = ${toLatex(r.expr, { negation: neg })}`}</Tex>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <TT vars={vs} cols={[{ name, values: Array.from(t) }]} />
      </div>
    </div>
  );
}

function TT({ vars, cols, highlightRow }: { vars: string[]; cols: { name: string; values: (number | string)[] }[]; highlightRow?: number }) {
  const n = vars.length;
  return (
    <table className="ltable">
      <thead>
        <tr>
          <th>m</th>
          {vars.map((v) => (
            <th key={v}>{v}</th>
          ))}
          {cols.map((c, i) => (
            <th key={c.name} className={i === 0 ? "sep" : ""}>
              {c.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 1 << n }, (_, i) => (
          <tr key={i} className={highlightRow === i ? "!bg-[var(--amber-soft)]" : ""}>
            <td className="text-muted text-[11px]">{i}</td>
            {vars.map((v, j) => (
              <td key={v}>{(i >> (n - 1 - j)) & 1}</td>
            ))}
            {cols.map((c, k) => (
              <td key={c.name} className={`${k === 0 ? "sep" : ""} ${c.values[i] === 1 ? "text-sig1 font-bold" : c.values[i] === "x" ? "text-amber" : "text-muted"}`}>
                {c.values[i] === "x" ? "×" : c.values[i]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───────────────────────── 表达式工作台 ─────────────────────────

export function ExprLab({ initial = "AB+A'C+BC", full = false }: { initial?: string; full?: boolean }) {
  const [src, setSrc] = useState(initial);
  const [cmp, setCmp] = useState("");
  const [tab, setTab] = useState<"table" | "kmap" | "circuit" | "verilog">("kmap");
  const neg = useNeg();
  const r = useMemo(() => tryParse(src), [src]);
  const data = useMemo(() => {
    if (!r.ok) return null;
    const vars = sortedVariables(r.expr);
    if (vars.length > 8) return { vars, error: "变量超过 8 个：只做等价验证，不展开真值表" } as const;
    const t = truthTable(r.expr, vars);
    const ones = minterms(t);
    const sop = vars.length ? minimizeSOP(vars.length, ones, [], vars) : null;
    const pos = vars.length ? minimizePOS(vars.length, ones, [], vars) : null;
    return { vars, t, ones, zeros: maxterms(t), sop, pos } as const;
  }, [r]);
  const cmpRes = useMemo(() => {
    if (!cmp.trim() || !r.ok) return null;
    const c = tryParse(cmp);
    if (!c.ok) return { error: c.error };
    return { res: checkEquivalence(r.expr, c.expr) };
  }, [cmp, r]);
  const netlist = useMemo(() => {
    if (!data || "error" in data || !data.sop || !r.ok) return null;
    return exprToNetlist([{ name: "Y", expr: r.expr }], data.vars);
  }, [data, r]);

  return (
    <div className={`widget card p-4 space-y-4 ${full ? "" : ""}`}>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="text-sm text-muted shrink-0 mono">Y =</label>
        <input className="input mono flex-1" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="逻辑表达式" placeholder="例如 AB+A'C+BC" />
      </div>
      <p className="text-xs text-muted">
        写法：<span className="mono">A&apos;</span> 或 <span className="mono">!A</span> 表示非，<span className="mono">AB</span> 或 <span className="mono">A·B</span> 为与，<span className="mono">+</span> 为或，<span className="mono">⊕ ^</span> 异或，<span className="mono">⊙</span> 同或，括号后加 <span className="mono">&apos;</span> 表示长非号。优先级：非 &gt; 与 &gt; 异或/同或 &gt; 或。
      </p>
      {!r.ok ? (
        <p className="text-sm text-danger mono">
          {src}
          <br />
          {" ".repeat(r.pos)}^ {r.error}
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="card-inset p-3 space-y-1.5">
              <div className="eyebrow">解析结果</div>
              <Tex>{`Y = ${toLatex(r.expr, { negation: neg })}`}</Tex>
              {data && !("error" in data) && (
                <>
                  <div className="text-xs text-ink-2">
                    <Tex>{`Y = \\sum m(${data.ones.join(",") || "\\,"})`}</Tex>
                    <span className="mx-2 text-muted">=</span>
                    <Tex>{`\\prod M(${data.zeros.join(",") || "\\,"})`}</Tex>
                  </div>
                </>
              )}
            </div>
            {data && !("error" in data) && data.sop && data.pos && (
              <div className="card-inset p-3 space-y-1.5">
                <div className="eyebrow">最简式（QM + Petrick）</div>
                {data.sop.solutions.map((_, k) => (
                  <div key={k}>
                    <Tex>{`Y = ${toLatex(solutionToSOP(data.sop!, k), { negation: neg })}`}</Tex>
                    {data.sop!.solutions.length > 1 && <span className="ml-2 chip">解 {k + 1}</span>}
                  </div>
                ))}
                <div className="text-xs text-ink-2">
                  或与式 <Tex>{`Y = ${toLatex(data.pos.expr, { negation: neg })}`}</Tex>
                </div>
              </div>
            )}
          </div>
          {data && "error" in data && <p className="text-sm text-amber">{data.error}</p>}
          {data && !("error" in data) && data.vars.length > 0 && (
            <>
              <div className="flex gap-1" role="tablist">
                {(
                  [
                    ["kmap", "卡诺图"],
                    ["table", "真值表"],
                    ["circuit", "逻辑图"],
                    ["verilog", "Verilog"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {tab === "table" && (
                <div className="overflow-auto thin-scroll max-h-[360px]">
                  <TT vars={data.vars} cols={[{ name: "Y", values: Array.from(data.t) }]} />
                </div>
              )}
              {tab === "kmap" &&
                (data.vars.length >= 2 && data.vars.length <= 5 && data.sop ? (
                  <div className="flex flex-wrap gap-6 items-start">
                    <KMap vars={data.vars} values={Array.from(data.t) as CellValue[]} groups={data.sop.solutions[0].map((i) => data.sop!.primes[i].covers)} />
                    <PrimeList res={data.sop} />
                  </div>
                ) : (
                  <p className="text-sm text-muted">卡诺图适用于 2～5 个变量（当前 {data.vars.length} 个）。</p>
                ))}
              {tab === "verilog" && (
                <div className="space-y-1.5">
                  <pre className="card-inset p-3 text-[12px] leading-[1.55] overflow-auto thin-scroll mono">{combToVerilog([{ name: "Y", expr: data.sop && data.ones.length ? solutionToSOP(data.sop) : r.expr }], data.vars, "expr_min")}</pre>
                  <p className="text-xs text-muted">按最简与或式生成的连续赋值；可复制到实验 E 的 Verilog 实验台中运行。</p>
                </div>
              )}
              {tab === "circuit" && netlist && <LiveCircuit netlist={netlist} height={Math.max(220, data.vars.length * 64 + 40)} hint="直接按表达式结构画出的逻辑图（未化简）。点击左侧开关改变输入，导线颜色实时反映电平。" />}
            </>
          )}
          <div className="border-t border-line pt-3 space-y-2">
            <label className="text-xs text-muted">等价验证：输入另一个表达式</label>
            <input className="input mono w-full" value={cmp} onChange={(e) => setCmp(e.target.value)} placeholder="例如 AB+A'C" aria-label="比较的表达式" spellCheck={false} />
            {cmpRes && "error" in cmpRes && <p className="text-sm text-danger">{cmpRes.error}</p>}
            {cmpRes && "res" in cmpRes && cmpRes.res && (
              <p className={`text-sm ${cmpRes.res.equivalent ? "text-accent" : "text-danger"}`}>
                {cmpRes.res.equivalent ? `✓ 逻辑等价（${cmpRes.res.method === "exhaustive" ? `穷举 ${1 << cmpRes.res.vars.length} 种取值` : "ROBDD 规范形比较"}）` : `✕ 不等价：${describeCounterexample(cmpRes.res, "上式", "下式")}`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PrimeList({ res }: { res: ReturnType<typeof minimizeSOP> }) {
  const neg = useNeg();
  return (
    <div className="text-xs space-y-1.5 min-w-[200px]">
      <div className="eyebrow">质蕴含项</div>
      {res.primes.map((p, i) => {
        const inSol = res.solutions[0].includes(i);
        const idx = res.solutions[0].indexOf(i);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: inSol ? GROUP_COLORS[idx % GROUP_COLORS.length] : "transparent", border: "1px solid var(--line-2)" }} />
            <span className="mono text-muted">{implicantPattern(p, res.n)}</span>
            <Tex>{toLatex(implicantToExpr(p, res.vars), { negation: neg })}</Tex>
            {res.essential.includes(i) && <span className="chip chip-accent">必要</span>}
          </div>
        );
      })}
      {!res.exact && <p className="text-amber">规模较大，已改用贪心覆盖，不保证全局最简。</p>}
    </div>
  );
}

export function LiveCircuit({ netlist, height = 260, hint }: { netlist: Netlist; height?: number; hint?: string }) {
  const { sim, toggle, version } = useSimulation(netlist);
  void version;
  return (
    <div className="space-y-2">
      <div className="card-inset overflow-hidden">
        <Schematic netlist={netlist} values={sim?.valuesById()} onToggle={toggle} style={{ height }} />
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ───────────────────────── 卡诺图实验 ─────────────────────────

export function KMapLab({ vars = ["A", "B", "C", "D"], minterms: ms = [], dontCares = [] }: { vars?: string[]; minterms?: number[]; dontCares?: number[] }) {
  const n = vars.length;
  const init = (): CellValue[] => Array.from({ length: 1 << n }, (_, i) => (ms.includes(i) ? 1 : dontCares.includes(i) ? "x" : 0));
  const [values, setValues] = useState<CellValue[]>(init);
  const [mode, setMode] = useState<"edit" | "circle">("circle");
  const [groups, setGroups] = useState<number[][]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [show, setShow] = useState<"none" | "check" | "answer">("none");
  const [solIdx, setSolIdx] = useState(0);
  const neg = useNeg();
  const ones = values.flatMap((v, i) => (v === 1 ? [i] : []));
  const dcs = values.flatMap((v, i) => (v === "x" ? [i] : []));
  const ref = useMemo(() => minimizeSOP(n, ones, dcs, vars), [values]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = useMemo(() => (show === "check" ? checkCover(groups, values, n, vars) : null), [show, groups, values, n, vars]);
  const click = (m: number) => {
    setShow("none");
    if (mode === "edit") {
      setValues((v) => v.map((x, i) => (i === m ? (x === 0 ? 1 : x === 1 ? "x" : 0) : x)));
      setGroups([]);
    } else setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  };
  const studentExpr: Expr | null = groups.length
    ? (() => {
        const terms = groups.map((g) => {
          let and = (1 << n) - 1;
          let or = 0;
          for (const m of g) {
            and &= m;
            or |= m;
          }
          const mask = or & ~and;
          return implicantToExpr({ value: and & ~mask, mask }, vars);
        });
        return terms.length === 1 ? terms[0] : { k: "or", es: terms };
      })()
    : null;
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button className={`btn btn-sm !rounded-none !border-0 ${mode === "circle" ? "!bg-accent !text-accent-ink" : ""}`} onClick={() => setMode("circle")}>
            圈组
          </button>
          <button className={`btn btn-sm !rounded-none !border-0 ${mode === "edit" ? "!bg-accent !text-accent-ink" : ""}`} onClick={() => setMode("edit")}>
            改取值
          </button>
        </div>
        {mode === "circle" && (
          <>
            <button
              className="btn btn-sm btn-primary"
              disabled={!sel.length}
              onClick={() => {
                setGroups((g) => [...g, sel]);
                setSel([]);
              }}
            >
              添加这个圈（{sel.length} 格）
            </button>
            <button className="btn btn-sm" disabled={!groups.length} onClick={() => setGroups((g) => g.slice(0, -1))}>
              撤销
            </button>
          </>
        )}
        <button className="btn btn-sm" onClick={() => setShow("check")} disabled={!groups.length}>
          检查
        </button>
        <button className="btn btn-sm" onClick={() => setShow(show === "answer" ? "none" : "answer")}>
          {show === "answer" ? "隐藏最简解" : "查看最简解"}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setValues(init());
            setGroups([]);
            setSel([]);
            setShow("none");
          }}
        >
          复位
        </button>
      </div>
      <p className="text-xs text-muted">{mode === "circle" ? "依次点击要圈在一起的格子（可以跨越边界——卡诺图首尾相邻），再点“添加这个圈”。" : "点击格子在 0 → 1 → ×（无关项）之间切换。"}</p>
      <div className="flex flex-wrap gap-6 items-start">
        <KMap vars={vars} values={values} groups={show === "answer" ? ref.solutions[solIdx].map((i) => ref.primes[i].covers) : groups} selecting={sel} onCellClick={click} />
        <div className="text-sm space-y-2 min-w-[220px] flex-1">
          {show !== "answer" && studentExpr && (
            <div>
              <span className="text-muted text-xs">你的圈对应：</span>
              <Tex>{`Y = ${toLatex(studentExpr, { negation: neg })}`}</Tex>
            </div>
          )}
          {check && (
            <ul className="space-y-1 text-sm">
              {check.invalid.map((x) => (
                <li key={x.index} className="text-danger">
                  ✕ 第 {x.index + 1} 个圈：{x.reason}
                </li>
              ))}
              {check.uncovered.length > 0 && <li className="text-danger">✕ 还有 1 没被圈住：m{check.uncovered.join("、m")}</li>}
              {check.notPrime.map((i) => (
                <li key={i} className="text-amber">
                  △ 第 {i + 1} 个圈还能再扩大
                </li>
              ))}
              {check.redundant.map((i) => (
                <li key={i} className="text-amber">
                  △ 第 {i + 1} 个圈是多余的
                </li>
              ))}
              {check.coversAll && check.isMinimal && <li className="text-accent">✓ 覆盖完整，已是最简（{check.studentCost.terms} 项、{check.studentCost.literals} 个因子）</li>}
              {check.coversAll && !check.isMinimal && check.notPrime.length === 0 && check.redundant.length === 0 && (
                <li className="text-amber">
                  △ 覆盖正确但不是最简：{check.studentCost.terms} 项 / {check.studentCost.literals} 因子，最简为 {check.minimalCost.terms} 项 / {check.minimalCost.literals} 因子
                </li>
              )}
            </ul>
          )}
          {show === "answer" && (
            <div className="space-y-2">
              {ref.solutions.length > 1 && (
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-muted">共 {ref.solutions.length} 个最简解：</span>
                  {ref.solutions.map((_, k) => (
                    <button key={k} className={`btn btn-sm ${k === solIdx ? "!border-accent !text-accent" : ""}`} onClick={() => setSolIdx(k)}>
                      {k + 1}
                    </button>
                  ))}
                </div>
              )}
              <Tex>{`Y = ${ones.length ? toLatex(solutionToSOP(ref, Math.min(solIdx, ref.solutions.length - 1)), { negation: neg }) : "0"}`}</Tex>
              <PrimeList res={ref} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 推导 ─────────────────────────

export function Derivation({ steps }: { steps: DerivationStep[] }) {
  const [view, setView] = useState<"result" | "steps" | "deep">("steps");
  const [mine, setMine] = useState("");
  const neg = useNeg();
  const verified = useMemo(() => verifyDerivation(steps), [steps]);
  const allOk = verified.every((s) => s.equivalentToPrev !== false && !s.parseError);
  const last = verified[verified.length - 1];
  const tex = (s: (typeof verified)[number]) => (s.parsed ? toLatex(s.parsed, { negation: neg }) : s.expr);
  const myCheck = useMemo(() => {
    if (!mine.trim() || !last.parsed) return null;
    const r = tryParse(mine);
    if (!r.ok) return { msg: r.error, ok: false };
    const e = checkEquivalence(verified[0].parsed!, r.expr);
    return { ok: e.equivalent, msg: e.equivalent ? "与原式逻辑等价" : describeCounterexample(e, "你的式子", "原式") };
  }, [mine, last, verified]);
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${allOk ? "chip-accent" : "chip-danger"}`}>{allOk ? `${steps.length - 1} 步，每一步都经求解器验证等价` : "推导中存在不等价的步骤"}</span>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["result", "只看结论"],
              ["steps", "逐步推导"],
              ["deep", "深入解释"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`btn btn-sm ${view === k ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {view === "result" ? (
        <div className="text-base">
          <Tex>{`${tex(verified[0])} = ${tex(last)}`}</Tex>
        </div>
      ) : (
        <ol className="space-y-2 !list-none !pl-0">
          {verified.map((s, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
              <span className="mono text-xs text-muted pt-1">{i}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base">
                    <Tex>{`${i === 0 ? "Y" : ""} = ${tex(s)}`}</Tex>
                  </span>
                  {s.rule && <span className="chip chip-accent">{RULES[s.rule as RuleId]?.name ?? s.rule}</span>}
                  {i > 0 && (s.equivalentToPrev ? <span className="text-accent text-xs">✓ 等价</span> : <span className="text-danger text-xs">✕ {s.parseError ?? s.counterexample}</span>)}
                </div>
                {s.explain && <p className="text-sm text-ink-2 mt-0.5">{s.explain}</p>}
                {view === "deep" && (
                  <div className="text-xs space-y-0.5 mt-1">
                    {s.rule && RULES[s.rule as RuleId] && (
                      <p className="text-muted">
                        依据：<Tex>{RULES[s.rule as RuleId].latex}</Tex>
                      </p>
                    )}
                    {s.condition && <p className="text-muted">适用条件：{s.condition}</p>}
                    {s.pitfall && <p className="text-amber">常见错误：{s.pitfall}</p>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-line pt-3 space-y-1.5">
        <label className="text-xs text-muted">自己试一步：输入任意中间式，检查是否与原式等价</label>
        <input className="input mono w-full" value={mine} onChange={(e) => setMine(e.target.value)} spellCheck={false} aria-label="自己的推导" />
        {myCheck && <p className={`text-sm ${myCheck.ok ? "text-accent" : "text-danger"}`}>{myCheck.ok ? "✓ " : "✕ "}{myCheck.msg}</p>}
      </div>
    </div>
  );
}

// ───────────────────────── 逻辑门 ─────────────────────────

const GATE_LIST = [
  ["and", "与 Y=AB"],
  ["or", "或 Y=A+B"],
  ["nand", "与非"],
  ["nor", "或非"],
  ["xor", "异或"],
  ["xnor", "同或"],
] as const;

export function GateLab() {
  const netlist = useMemo<Netlist>(() => {
    const comps: Netlist["components"] = [
      { id: "A", type: "switch", label: "A", x: 20, y: 120 },
      { id: "B", type: "switch", label: "B", x: 20, y: 250 },
      { id: "NOT", type: "not", label: "非 Y=A'", x: 200, y: 10 },
      { id: "PN", type: "probe", label: "A'", x: 300, y: 14 },
    ];
    const eA: { comp: string; pin: string }[] = [{ comp: "A", pin: "Y" }, { comp: "NOT", pin: "A" }];
    const eB: { comp: string; pin: string }[] = [{ comp: "B", pin: "Y" }];
    const nets: Netlist["nets"] = [{ id: "nNOT", endpoints: [{ comp: "NOT", pin: "Y" }, { comp: "PN", pin: "A" }] }];
    GATE_LIST.forEach(([t, label], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 200 + col * 220;
      const y = 80 + row * 90;
      comps.push({ id: t, type: t, label, x, y });
      comps.push({ id: `P_${t}`, type: "probe", label: "Y", x: x + 90, y: y + 9 });
      eA.push({ comp: t, pin: "I0" });
      eB.push({ comp: t, pin: "I1" });
      nets.push({ id: `n_${t}`, endpoints: [{ comp: t, pin: "Y" }, { comp: `P_${t}`, pin: "A" }] });
    });
    nets.push({ id: "A", name: "A", endpoints: eA }, { id: "B", name: "B", endpoints: eB });
    return { version: 1, name: "七种逻辑门", components: comps, nets };
  }, []);
  return (
    <div className="widget card p-4">
      <LiveCircuit netlist={netlist} height={360} hint="点击 A、B 开关；右上角“符号约定”可以在国标矩形符号与 ANSI 特异形符号之间切换。" />
    </div>
  );
}

export { parseExpr };
