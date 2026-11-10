"use client";

import { useMemo, useState } from "react";
import { plaProgram, plaEvaluate, mapToLut, lutRead, type PlaProgram, type LutMapping } from "@/lib/memory/pld";
import { toLatex, varToLatex } from "@/lib/logic";
import { Tex } from "@/components/ui/Tex";
import { FuncListInput } from "@/components/widgets/MemoryLab";

type Mode = "pla" | "lut";
const MODE_TEXT: Record<Mode, string> = { pla: "PLA 与或阵列编程", lut: "映射到查找表 LUT" };

const PLA_PRESETS: { label: string; srcs: string[] }[] = [
  { label: "共享乘积项示例", srcs: ["F1 = AB + A'C", "F2 = AB + BC'", "F3 = A'C + BC'"] },
  { label: "全加器", srcs: ["S = A⊕B⊕C", "CO = AB+AC+BC"] },
  { label: "2 位比较器", srcs: ["GT = AC' + ABD' + BC'D'", "EQ = (A⊙C)(B⊙D)", "LT = A'C + A'B'D + B'CD"] },
];

const LUT_PRESETS = ["AB + CD", "A⊕B⊕C⊕D", "AB'C + D'E", "A⊕B⊕C⊕D⊕E", "AB + CDEFG'"];

function Bit({ v }: { v: 0 | 1 }) {
  return <span className={`lv ${v ? "lv-1" : "lv-0"}`}>{v}</span>;
}

function Toggles({ vars, env, onToggle, label = "输入（点按切换）" }: { vars: string[]; env: Record<string, 0 | 1>; onToggle: (x: string) => void; label?: string }) {
  return (
    <div className="card-inset p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <span className="text-muted">{label}</span>
      {vars.map((x) => (
        <button key={x} className="flex items-center gap-1.5" onClick={() => onToggle(x)} aria-label={`切换输入 ${x}，当前 ${env[x] ?? 0}`}>
          <span className="mono text-ink">{x}</span>
          <Bit v={env[x] ?? 0} />
        </button>
      ))}
    </div>
  );
}

/**
 * 第 9 章 可编程逻辑器件实验（逻辑层/理想模型）。
 *  - pla：多输出表达式 → QM 化简 → 与阵列/或阵列连接点阵（相同乘积项共享一条乘积线），拨输入看乘积线与输出点亮。
 *  - lut：表达式 + LUT 输入数 k → LUT 存储内容（2ᵏ 位）与读出；变量多于 k 时给出香农展开级联方案。
 * 计算全部来自 lib/memory/pld.ts。
 */
export function PLDLab({ mode: initial = "pla" }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [env, setEnv] = useState<Record<string, 0 | 1>>({ A: 1, B: 1, C: 0 });
  const toggle = (x: string) => setEnv((e) => ({ ...e, [x]: e[x] ? 0 : 1 }));
  return (
    <div className="widget card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
          <button key={m} className={`btn btn-sm ${mode === m ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
            {MODE_TEXT[m]}
          </button>
        ))}
        <span className="chip chip-accent ml-auto">逻辑层 · 理想模型</span>
      </div>
      {mode === "pla" ? <PlaPanel env={env} onToggle={toggle} /> : <LutPanel env={env} onToggle={toggle} />}
    </div>
  );
}

// ───────────────────────── PLA ─────────────────────────

function PlaPanel({ env, onToggle }: { env: Record<string, 0 | 1>; onToggle: (x: string) => void }) {
  const [srcs, setSrcs] = useState<string[]>(PLA_PRESETS[0].srcs);
  const [share, setShare] = useState(true);
  const res = useMemo(() => {
    try {
      return { ok: true as const, p: plaProgram(srcs, { share, maxVars: 6, maxOutputs: 4 }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [srcs, share]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3 min-w-0 order-2 lg:order-1">
        {res.ok ? (
          <>
            <Toggles vars={res.p.vars} env={env} onToggle={onToggle} />
            <PlaView p={res.p} env={env} onToggle={onToggle} />
            <PlaTerms p={res.p} env={env} />
          </>
        ) : (
          <p className="text-danger text-sm card-inset p-3">{res.error}</p>
        )}
      </div>
      <div className="space-y-3 text-sm order-1 lg:order-2">
        <div className="card-inset p-3 space-y-2">
          <div className="eyebrow">输出函数（1～4 个，变量 ≤ 6 个）</div>
          <FuncListInput srcs={srcs} onChange={setSrcs} max={4} prefix="F" />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PLA_PRESETS.map((p) => (
              <button key={p.label} className="btn btn-sm btn-ghost" onClick={() => setSrcs(p.srcs)}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs pt-1">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="accent-[var(--accent)]" />
            相同乘积项共享一条乘积线
          </label>
        </div>
        {res.ok && (
          <div className="card-inset p-3 space-y-1.5 text-xs">
            <div className="eyebrow mb-1">规模</div>
            <Stat k="乘积线" v={res.p.stats.terms} />
            <Stat k="不共享时需要" v={res.p.stats.termsWithoutSharing} />
            <Stat k={`用 PROM（全译码与阵列）`} v={res.p.stats.promTerms} />
            <Stat k="与阵列连接点" v={res.p.stats.andConnections} />
            <Stat k="或阵列连接点" v={res.p.stats.orConnections} />
            <p className="text-muted pt-1 leading-relaxed">每个输出先用 QM 化简为最简与或式；完全相同的乘积项只占一条乘积线。这是“逐个输出最简 + 共享相同项”，不一定是多输出联合最优。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-2">{k}</span>
      <span className="ml-auto mono text-amber">{v}</span>
    </div>
  );
}

function PlaView({ p, env, onToggle }: { p: PlaProgram; env: Record<string, 0 | 1>; onToggle: (x: string) => void }) {
  const n = p.vars.length;
  const T = p.terms.length;
  const K = p.outputs.length;
  const ins = p.vars.map((x) => env[x] ?? 0) as (0 | 1)[];
  const ev = plaEvaluate(p, ins);
  const colW = 26;
  const andX = 56;
  const top = 74;
  const rowH = 26;
  const andW = 2 * n * colW;
  const orX = andX + andW + 40;
  const orColW = 46;
  const right = orX + (K - 1) * orColW + 30;
  const width = right + 8;
  const height = top + Math.max(T, 1) * rowH + 56;
  const yOf = (t: number) => top + t * rowH + rowH / 2;
  const xOf = (i: number, neg: boolean) => andX + (2 * i + (neg ? 1 : 0)) * colW + colW / 2;
  const sig = (v: 0 | 1) => (v ? "var(--sig-1)" : "var(--sig-0)");
  const bottom = top + Math.max(T, 1) * rowH + 6;
  return (
    <div className="card-inset p-2 overflow-x-auto thin-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ minWidth: Math.min(width, 440), maxWidth: width * 1.5 }} role="img" aria-label={`PLA 与阵列与或阵列连接图，${T} 条乘积线`}>
        <text x={andX + andW / 2} y={12} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
          与阵列 · 可编程
        </text>
        <text x={orX + ((K - 1) * orColW) / 2} y={12} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
          或阵列 · 可编程
        </text>
        {/* 输入与原/反变量线 */}
        {p.vars.map((x, i) => {
          const v = ins[i];
          const nv = (1 - v) as 0 | 1;
          return (
            <g key={x} onClick={() => onToggle(x)} style={{ cursor: "pointer" }}>
              <rect x={xOf(i, false) - colW / 2} y={18} width={2 * colW} height={22} fill="transparent" />
              <text x={xOf(i, false) + colW / 2} y={32} fontSize={11} textAnchor="middle" className="mono" fill="var(--ink)">
                {x}={v}
              </text>
              <text x={xOf(i, false)} y={top - 14} fontSize={9.5} textAnchor="middle" className="mono" fill={sig(v)}>
                {x}
              </text>
              <text x={xOf(i, true)} y={top - 14} fontSize={9.5} textAnchor="middle" className="mono" fill={sig(nv)}>
                {x}′
              </text>
              <path d={`M${xOf(i, false) + colW / 2} 38 V46 M${xOf(i, false)} 46 H${xOf(i, true)} M${xOf(i, false)} 46 V${top - 26} M${xOf(i, true)} 46 V${top - 26}`} stroke="var(--ink-2)" fill="none" />
              <line x1={xOf(i, false)} x2={xOf(i, false)} y1={top - 8} y2={bottom} stroke={sig(v)} strokeWidth={v ? 2 : 1.2} />
              <line x1={xOf(i, true)} x2={xOf(i, true)} y1={top - 8} y2={bottom} stroke={sig(nv)} strokeWidth={nv ? 2 : 1.2} />
            </g>
          );
        })}
        {/* 乘积线 */}
        {p.terms.map((t, ti) => {
          const y = yOf(ti);
          const on = ev.terms[ti];
          return (
            <g key={ti}>
              <text x={4} y={y + 3.5} fontSize={10} className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                P{ti}
              </text>
              <text x={andX - 6} y={y + 3.5} fontSize={9} textAnchor="end" className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                {on}
              </text>
              <line x1={andX - 2} x2={right} y1={y} y2={y} stroke={on ? "var(--amber)" : "var(--line-2)"} strokeWidth={on ? 2.2 : 1.1} />
              {p.andMatrix[ti].map((c, i) => (c === null ? null : <circle key={i} cx={xOf(i, c === 0)} cy={y} r={4} fill={on ? "var(--amber)" : "var(--ink)"} stroke="var(--bg-2)" />))}
              {p.orMatrix[ti].map((c, j) => (c ? <circle key={`o${j}`} cx={orX + j * orColW} cy={y} r={4} fill={on ? "var(--amber)" : "var(--ink)"} stroke="var(--bg-2)" /> : null))}
            </g>
          );
        })}
        {T === 0 && (
          <text x={andX} y={yOf(0) + 3} fontSize={10} fill="var(--muted)">
            所有输出恒为 0，不需要乘积线
          </text>
        )}
        {/* 或阵列输出线 */}
        {p.outputs.map((o, j) => {
          const x = orX + j * orColW;
          const v = ev.outputs[j];
          return (
            <g key={o.name}>
              <line x1={x} x2={x} y1={top - 8} y2={bottom + 6} stroke={sig(v)} strokeWidth={v ? 2.2 : 1.2} />
              <text x={x} y={bottom + 22} fontSize={11} textAnchor="middle" className="mono" fill="var(--ink)">
                {o.name}
              </text>
              <text x={x} y={bottom + 40} fontSize={12} fontWeight={700} textAnchor="middle" className="mono" fill={sig(v)}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] text-muted px-1 pb-1">
        ● 表示编程连接。乘积线 P 是与门：它连接的原/反变量线全为 1 时才为 1（琥珀色）；输出线是或门：连到它的乘积线有一条为 1 即为 1。点按顶部变量名切换输入。
      </p>
    </div>
  );
}

function PlaTerms({ p, env }: { p: PlaProgram; env: Record<string, 0 | 1> }) {
  const ev = plaEvaluate(
    p,
    p.vars.map((x) => env[x] ?? 0),
  );
  return (
    <div className="card-inset p-3 text-xs space-y-3">
      <div className="overflow-x-auto thin-scroll">
        <table className="ltable w-full">
          <thead>
            <tr>
              <th>乘积线</th>
              <th>乘积项</th>
              <th>与阵列编码（{p.vars.join("")}）</th>
              <th>接到</th>
              <th>当前值</th>
            </tr>
          </thead>
          <tbody>
            {p.terms.map((t, i) => (
              <tr key={i}>
                <td>P{i}</td>
                <td>
                  <Tex>{t.latex}</Tex>
                </td>
                <td>{t.pattern}</td>
                <td>{t.outputs.map((j) => p.outputs[j].name).join("、")}</td>
                <td>
                  <Bit v={ev.terms[i]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted">编码中 1 = 接原变量，0 = 接反变量，- = 不接（该变量被消去）。不接任何输入的乘积线恒为 1。</p>
      <div className="space-y-1">
        {p.outputs.map((o) => (
          <div key={o.name} className="overflow-x-auto thin-scroll">
            <Tex>{`${varToLatex(o.name)} = ${o.terms.length ? o.terms.map((t) => `P_{${t}}`).join(" + ") : "0"} = ${toLatex(o.sop)}`}</Tex>
            {o.alternatives > 1 && <span className="text-muted ml-2">（有 {o.alternatives} 个最简解，已选共享最多的一个）</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── LUT ─────────────────────────

function LutPanel({ env, onToggle }: { env: Record<string, 0 | 1>; onToggle: (x: string) => void }) {
  const [src, setSrc] = useState(LUT_PRESETS[0]);
  const [k, setK] = useState<4 | 6>(4);
  const res = useMemo(() => {
    try {
      const m = mapToLut(src, k);
      if (m.n > 8) throw new Error(`变量 ${m.n} 个，本实验最多 8 个`);
      return { ok: true as const, m };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [src, k]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3 min-w-0 order-2 lg:order-1">{res.ok ? <LutView m={res.m} env={env} onToggle={onToggle} /> : <p className="text-danger text-sm card-inset p-3">{res.error}</p>}</div>
      <div className="space-y-3 text-sm order-1 lg:order-2">
        <div className="card-inset p-3 space-y-3">
          <label className="block space-y-1">
            <span className="eyebrow">逻辑函数（变量 ≤ 8 个）</span>
            <input className="input mono w-full" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="逻辑函数表达式" placeholder="例如 AB + CD" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {LUT_PRESETS.map((p) => (
              <button key={p} className="btn btn-sm btn-ghost mono" onClick={() => setSrc(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">LUT 输入数 k</span>
            {([4, 6] as const).map((x) => (
              <button key={x} className={`btn btn-sm ${k === x ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setK(x)} aria-pressed={k === x}>
                {x} 输入
              </button>
            ))}
          </div>
        </div>
        {res.ok && (
          <div className="card-inset p-3 space-y-1.5 text-xs">
            <div className="eyebrow mb-1">映射结果</div>
            <Stat k="函数变量数 n" v={res.m.n} />
            <Stat k="每个 LUT 存储" v={`2${res.m.k === 4 ? "⁴" : "⁶"} = ${2 ** res.m.k} 位`} />
            {res.m.plan ? (
              <>
                <Stat k="LUT 个数（直接方案）" v={res.m.plan.totalLuts} />
                <Stat k="去掉常量/相同余因子后" v={res.m.plan.optimizedLuts} />
                <Stat k="LUT 级数" v={res.m.plan.depth} />
              </>
            ) : (
              <Stat k="LUT 个数" v={1} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** LUT 存储内容网格：行 = 高位地址，列 = 低位地址 */
function LutGrid({ bits, k, hit, small = false }: { bits: Uint8Array; k: number; hit: number | null; small?: boolean }) {
  const colBits = Math.ceil(k / 2);
  const rowBits = k - colBits;
  const cols = 2 ** colBits;
  const rows = 2 ** rowBits;
  const cell = small ? "w-4 h-4 text-[9px]" : "w-7 h-7 text-[11px]";
  return (
    <div className="overflow-x-auto thin-scroll">
      <table className="border-separate" style={{ borderSpacing: small ? 2 : 3 }}>
        {!small && (
          <thead>
            <tr>
              <th />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="mono text-[9px] text-muted font-normal">
                  {c.toString(2).padStart(colBits, "0")}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {!small && <th className="mono text-[9px] text-muted font-normal pr-1">{r.toString(2).padStart(rowBits, "0")}</th>}
              {Array.from({ length: cols }, (_, c) => {
                const a = r * cols + c;
                const v = bits[a];
                const on = a === hit;
                return (
                  <td key={c} className="p-0">
                    <span
                      className={`grid place-items-center mono rounded ${cell} ${v ? "bg-[var(--sig-1)] text-[var(--accent-ink)] font-semibold" : "border border-[color-mix(in_srgb,var(--sig-0)_55%,transparent)] text-[var(--sig-0)]"}`}
                      style={on ? { outline: "2px solid var(--amber)", outlineOffset: 1 } : undefined}
                      title={`地址 ${a}（${a.toString(2).padStart(k, "0")}）存 ${v}`}
                    >
                      {v}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LutBlock({ inputs, values, address, out, k, title }: { inputs: (string | null)[]; values: (0 | 1 | null)[]; address: number; out: 0 | 1; k: number; title: string }) {
  // 小型结构示意：k 根输入 → 2^k 位 SRAM + 2^k 选 1 → 输出
  const h = 24 + k * 18;
  return (
    <svg viewBox={`0 0 320 ${h}`} className="w-full h-auto max-w-[420px]" role="img" aria-label={`${title}：地址 ${address}，输出 ${out}`}>
      {inputs.map((x, i) => {
        const y = 22 + i * 18;
        const v = values[i];
        const col = v === null ? "var(--muted)" : v ? "var(--sig-1)" : "var(--sig-0)";
        return (
          <g key={i}>
            <text x={4} y={y + 4} fontSize={10} className="mono" fill={col}>
              I{k - 1 - i} {x ?? "未用"}
            </text>
            <line x1={70} x2={110} y1={y} y2={y} stroke={col} strokeWidth={v ? 2 : 1.2} strokeDasharray={v === null ? "3 3" : undefined} />
            <text x={104} y={y - 3} fontSize={9} textAnchor="end" className="mono" fill={col}>
              {v ?? "0"}
            </text>
          </g>
        );
      })}
      <rect x={110} y={8} width={130} height={h - 16} rx={6} fill="var(--panel)" stroke="var(--line-2)" />
      <text x={175} y={h / 2 - 8} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
        {`${2 ** k} 位 SRAM`}
      </text>
      <text x={175} y={h / 2 + 6} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
        {`+ ${2 ** k} 选 1`}
      </text>
      <text x={175} y={h / 2 + 22} fontSize={10} textAnchor="middle" className="mono" fill="var(--amber)">
        读地址 {address}
      </text>
      <line x1={240} x2={290} y1={h / 2} y2={h / 2} stroke={out ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={2.2} />
      <text x={296} y={h / 2 + 4} fontSize={12} fontWeight={700} className="mono" fill={out ? "var(--sig-1)" : "var(--sig-0)"}>
        {out}
      </text>
    </svg>
  );
}

function LutView({ m, env, onToggle }: { m: LutMapping; env: Record<string, 0 | 1>; onToggle: (x: string) => void }) {
  const ins = m.vars.map((x) => env[x] ?? 0) as (0 | 1)[];
  const r = lutRead(m, ins);
  if (m.single) {
    const s = m.single;
    const values = s.inputs.map((x) => (x === null ? null : (env[x] ?? 0))) as (0 | 1 | null)[];
    return (
      <div className="space-y-3">
        <Toggles vars={m.vars} env={env} onToggle={onToggle} />
        <div className="card-inset p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="eyebrow">单个 {m.k}-LUT</span>
            <span className="ml-auto mono">
              内容（十六进制，最高地址在左）：<span className="text-amber">{s.hex}</span>
            </span>
          </div>
          <LutBlock inputs={s.inputs} values={values} address={r.address} out={r.value} k={m.k} title={`${m.k} 输入 LUT`} />
          <LutGrid bits={s.bits} k={m.k} hit={r.address} />
          <p className="text-[11px] text-muted leading-relaxed">
            行标是高位地址、列标是低位地址；地址第 i 位的存储值就是函数在该输入组合下的值（真值表直接写进 SRAM）。
            {m.n < m.k && ` 函数只有 ${m.n} 个变量，接在低位输入 I${m.n - 1}～I0；未用的高位输入取任何值都不影响输出，因此内容按周期 ${2 ** m.n} 重复。`}
          </p>
        </div>
      </div>
    );
  }
  const plan = m.plan!;
  const s = plan.selectVars.length;
  const active = r.cofactor!;
  return (
    <div className="space-y-3">
      <Toggles vars={m.vars} env={env} onToggle={onToggle} />
      <div className="card-inset p-3 space-y-2 text-xs">
        <div className="eyebrow">香农展开级联方案</div>
        <div className="overflow-x-auto thin-scroll">
          <Tex>{s === 1 ? `F = \\overline{${varToLatex(plan.selectVars[0])}}\\,F|_{${varToLatex(plan.selectVars[0])}=0} + ${varToLatex(plan.selectVars[0])}\\,F|_{${varToLatex(plan.selectVars[0])}=1}` : `F = \\sum_{c} m_c(${plan.selectVars.map((x) => varToLatex(x)).join(",")})\\cdot F|_{c}`}</Tex>
        </div>
        <ul className="list-disc pl-4 space-y-1 leading-relaxed">
          {plan.notes.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {plan.cofactors.map((c, i) => {
          const on = i === active;
          return (
            <div key={i} className="card-inset p-2.5 space-y-1.5 text-xs" style={on ? { borderColor: "var(--amber)", background: "var(--amber-soft)" } : undefined}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`mono font-semibold ${on ? "text-amber" : "text-ink"}`}>LUT{i}</span>
                <span className="mono text-muted">{c.label}</span>
                {c.constant !== null && <span className="chip">常量 {c.constant}</span>}
                {c.sameAs !== null && c.constant === null && <span className="chip">同 LUT{c.sameAs}</span>}
                {on && <span className="chip chip-amber ml-auto">被选中</span>}
              </div>
              <div className="mono text-[11px]">
                输入 {c.inputs.join("")} · 内容 <span className="text-amber">{c.hex}</span>
              </div>
              <LutGrid bits={c.bits} k={m.k} hit={on ? r.address : null} small />
            </div>
          );
        })}
      </div>
      <div className="card-inset p-3 text-xs space-y-1.5">
        <div className="eyebrow">选择器树</div>
        {plan.mux.map((l, i) => (
          <p key={i}>
            第 {i + 1} 级：{l.luts} 个 LUT，各实现 {2 ** l.selects.length} 选 1（选择变量 <span className="mono">{l.selects.join("")}</span>，用 {l.inputsPerLut} 个输入）
          </p>
        ))}
        <p className="pt-1 flex flex-wrap items-center gap-2">
          <span>
            选择变量 <span className="mono">{plan.selectVars.join("")}</span> = <span className="mono text-amber">{active.toString(2).padStart(s, "0")}</span> → 选中 LUT{active}，其地址 {r.address} 处存
          </span>
          <Bit v={r.value} />
          <span>→ 输出 F = {r.value}</span>
        </p>
      </div>
    </div>
  );
}
