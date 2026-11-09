"use client";

import { useMemo, useState } from "react";
import { minimizeStates, sequenceDetector, synthesize, validateSpec, bitsNeeded, type StateTableSpec, type Bit } from "@/lib/fsm/design";
import { circuitToNetlist, simulateDesign } from "@/lib/fsm/netlistgen";
import { stateBits } from "@/lib/fsm/analyze";
import type { FFType } from "@/lib/sim/models";
import { toLatex, nextStateLatex } from "@/lib/logic/format";
import { Tex } from "@/components/ui/Tex";
import { KMap } from "@/components/karnaugh/KMap";
import { StateDiagram } from "@/components/fsm/StateDiagram";
import { SelfStartPanel } from "@/components/fsm/AnalysisPanels";
import { Schematic } from "@/components/circuit/Schematic";
import { Waveform, busFromBits } from "@/components/waveform/Waveform";
import { useLab } from "@/lib/storage/store";

type Source = "detector" | "custom";

function specDiagram(spec: StateTableSpec) {
  const K = 1 << spec.inputs.length;
  const nodes = spec.states.map((s, i) => ({ id: i, label: s, sub: spec.kind === "moore" ? spec.out[i][0].join("") : undefined }));
  const edges = spec.next.flatMap((row, s) =>
    row.map((t, x) => ({
      from: s,
      to: t,
      label: `${spec.inputs.length ? stateBits(x, spec.inputs.length) : ""}${spec.kind === "mealy" ? "/" + spec.out[s][x].join("") : ""}`,
    })),
  );
  void K;
  return { nodes, edges };
}

function Step({ n, children, aside }: { n: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={`step-${n}`} className="card p-5 scroll-mt-20">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="mono text-accent text-sm">{String(n).padStart(2, "0")}</span>
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold">{STEP_TITLES[n - 1]}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

const STEP_TITLES = ["定义输入输出", "原始状态表", "状态化简", "状态编码", "选择触发器", "次态真值表", "卡诺图", "状态方程", "驱动方程", "输出方程", "逻辑图", "自启动检查", "仿真验证"];

export function FsmDesigner({ initialSeq = "101", initialKind = "mealy", initialOverlap = true }: { initialSeq?: string; initialKind?: "mealy" | "moore"; initialOverlap?: boolean }) {
  const [source, setSource] = useState<Source>("detector");
  const [seq, setSeq] = useState(initialSeq);
  const [kind, setKind] = useState<"mealy" | "moore">(initialKind);
  const [overlap, setOverlap] = useState(initialOverlap);
  const [custom, setCustom] = useState<StateTableSpec>(() => ({
    kind: "moore",
    inputs: [],
    outputs: ["C"],
    states: ["S0", "S1", "S2", "S3", "S4"],
    next: [[1], [2], [3], [4], [0]],
    out: [[[0]], [[0]], [[0]], [[0]], [[1]]],
    initial: 0,
  }));
  const [ff, setFf] = useState<FFType>("JK");
  const [encoding, setEncoding] = useState<"binary" | "custom">("binary");
  const [customCodes, setCustomCodes] = useState<number[]>([]);
  const [forceSelfStart, setForceSelfStart] = useState(false);
  const [inputSeq, setInputSeq] = useState("1011010110010111");
  const neg = useLab((s) => s.settings.negation);
  const nsStyle = useLab((s) => s.settings.nextState);

  const raw = useMemo<{ spec: StateTableSpec | null; error: string | null }>(() => {
    try {
      if (source === "detector") return { spec: sequenceDetector(seq, kind, overlap), error: null };
      const errs = validateSpec(custom);
      return errs.length ? { spec: null, error: errs.join("；") } : { spec: custom, error: null };
    } catch (e) {
      return { spec: null, error: (e as Error).message };
    }
  }, [source, seq, kind, overlap, custom]);
  const min = useMemo(() => (raw.spec ? minimizeStates(raw.spec) : null), [raw.spec]);
  const reduced = min?.reduced ?? null;
  const nBits = reduced ? bitsNeeded(reduced.states.length) : 0;
  const codes = useMemo(() => {
    if (!reduced) return [];
    if (encoding === "custom" && customCodes.length === reduced.states.length && new Set(customCodes).size === customCodes.length && customCodes.every((c) => c < 1 << nBits)) return customCodes;
    return reduced.states.map((_, i) => i);
  }, [reduced, encoding, customCodes, nBits]);
  const syn = useMemo(() => {
    if (!reduced) return null;
    try {
      return { ok: true as const, s: synthesize(reduced, { ffType: ff, codes, forceSelfStart }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [reduced, ff, codes, forceSelfStart]);
  const k = reduced?.inputs.length ?? 0;
  const inputs = useMemo(() => {
    if (k === 0) return Array.from({ length: 12 }, () => 0);
    return inputSeq
      .replace(/[^01]/g, "")
      .split("")
      .map(Number)
      .slice(0, 40);
  }, [inputSeq, k]);
  const check = useMemo(() => (syn?.ok && reduced ? simulateDesign(reduced, syn.s.circuit, syn.s.codes, inputs) : null), [syn, reduced, inputs]);
  const netlist = useMemo(() => (syn?.ok ? circuitToNetlist(syn.s.circuit, { init: syn.s.codes[reduced?.initial ?? 0] }) : null), [syn, reduced]);
  const L = (e: Parameters<typeof toLatex>[0]) => toLatex(e, { negation: neg });

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="hidden lg:block sticky top-20 self-start space-y-1 text-sm" aria-label="设计步骤">
        {STEP_TITLES.map((t, i) => (
          <a key={t} href={`#step-${i + 1}`} className="flex gap-2 px-2 py-1 rounded-md text-ink-2 hover:text-ink hover:bg-panel">
            <span className="mono text-muted text-xs w-5">{String(i + 1).padStart(2, "0")}</span>
            {t}
          </a>
        ))}
      </nav>
      <div className="space-y-5 min-w-0">
        {/* 输入 */}
        <section className="card p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className={`btn ${source === "detector" ? "btn-primary" : ""}`} onClick={() => setSource("detector")}>
              序列检测器模板
            </button>
            <button className={`btn ${source === "custom" ? "btn-primary" : ""}`} onClick={() => setSource("custom")}>
              自定义状态表
            </button>
          </div>
          {source === "detector" ? (
            <div className="flex flex-wrap gap-4 items-end">
              <label className="text-xs text-muted space-y-1">
                <span className="block">目标序列（2～8 位）</span>
                <input className="input mono w-40" value={seq} onChange={(e) => setSeq(e.target.value.replace(/[^01]/g, "").slice(0, 8))} aria-label="目标序列" />
              </label>
              <label className="text-xs text-muted space-y-1">
                <span className="block">类型</span>
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value as "mealy" | "moore")}>
                  <option value="mealy">Mealy（输出取决于现态和输入）</option>
                  <option value="moore">Moore（输出只取决于现态）</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm h-9">
                <input type="checkbox" checked={overlap} onChange={(e) => setOverlap(e.target.checked)} className="accent-[var(--accent)]" />
                可重叠
              </label>
            </div>
          ) : (
            <CustomTableEditor spec={custom} onChange={setCustom} />
          )}
          <div className="flex flex-wrap gap-4 items-end border-t border-line pt-4">
            <label className="text-xs text-muted space-y-1">
              <span className="block">触发器</span>
              <select className="select" value={ff} onChange={(e) => setFf(e.target.value as FFType)} aria-label="触发器类型">
                <option value="D">D 触发器</option>
                <option value="JK">JK 触发器</option>
                <option value="T">T 触发器</option>
              </select>
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="block">状态编码</span>
              <select
                className="select"
                value={encoding}
                onChange={(e) => {
                  setEncoding(e.target.value as "binary" | "custom");
                  if (reduced) setCustomCodes(reduced.states.map((_, i) => i));
                }}
              >
                <option value="binary">二进制顺序编码</option>
                <option value="custom">自定义编码</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm h-9" title="把未用编码的次态指定为初始状态，而不是当作无关项">
              <input type="checkbox" checked={forceSelfStart} onChange={(e) => setForceSelfStart(e.target.checked)} className="accent-[var(--accent)]" />
              未用状态强制回到初始态（保证自启动）
            </label>
          </div>
          {raw.error && <p className="text-sm text-danger">{raw.error}</p>}
        </section>

        {raw.spec && min && reduced && (
          <>
            <Step n={1}>
              <p className="text-sm leading-relaxed">
                输入变量：<span className="mono">{raw.spec.inputs.join("、") || "无（自动计数）"}</span>；输出变量：<span className="mono">{raw.spec.outputs.join("、")}</span>；类型：
                {raw.spec.kind === "mealy" ? "Mealy 型——输出与当前输入同拍出现" : "Moore 型——输出由状态决定，比 Mealy 晚一拍"}。
                {source === "detector" && (
                  <>
                    状态 <span className="mono">S_k</span> 表示“已经连续匹配了目标序列的前 k 位”。{overlap ? "可重叠：检测成功后保留最长的公共前后缀。" : "不可重叠：检测成功后从头开始。"}
                  </>
                )}
              </p>
            </Step>
            <Step n={2}>
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <SpecTable spec={raw.spec} />
                <div className="max-w-[340px] mx-auto w-full">
                  <StateDiagram {...specDiagram(raw.spec)} order={raw.spec.states.map((_, i) => i)} size={320} />
                </div>
              </div>
            </Step>
            <Step n={3} aside={<span className={`chip ${min.classes.length < raw.spec.states.length ? "chip-amber" : ""}`}>{raw.spec.states.length} → {min.classes.length} 个状态</span>}>
              <div className="grid md:grid-cols-2 gap-5 items-start">
                <ImplicationTable spec={raw.spec} pairs={min.pairs} />
                <div className="text-sm space-y-2 leading-relaxed">
                  <p>
                    <strong>等价条件</strong>：两个状态等价，当且仅当在每一种输入下输出都相同，<strong>并且</strong>次态相同或等价。只看输出相同不能合并——要逐格检查隐含的状态对，直到不再有格子被划掉。
                  </p>
                  <p>
                    等价类：
                    {min.classes.map((c, i) => (
                      <span key={i} className="chip mr-1 mono">
                        {"{" + c.map((s) => raw.spec!.states[s]).join(", ") + "}"}
                      </span>
                    ))}
                  </p>
                  {min.classes.length < raw.spec.states.length && <SpecTable spec={reduced} caption="化简后的状态表" />}
                </div>
              </div>
            </Step>
            <Step n={4} aside={<span className="chip">{nBits} 个触发器</span>}>
              <p className="text-sm mb-3">
                {reduced.states.length} 个状态至少需要 <Tex>{`\\lceil \\log_2 ${reduced.states.length} \\rceil = ${nBits}`}</Tex> 位编码。
              </p>
              <div className="flex flex-wrap gap-2">
                {reduced.states.map((s, i) => (
                  <label key={s} className="card-inset px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="mono">{s}</span>
                    <span className="text-muted">→</span>
                    {encoding === "custom" ? (
                      <select
                        className="select !h-7 mono"
                        value={codes[i]}
                        onChange={(e) => {
                          const c = [...codes];
                          c[i] = Number(e.target.value);
                          setCustomCodes(c);
                        }}
                      >
                        {Array.from({ length: 1 << nBits }, (_, v) => (
                          <option key={v} value={v}>
                            {stateBits(v, nBits)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="mono text-accent">{stateBits(codes[i], nBits)}</span>
                    )}
                  </label>
                ))}
              </div>
              {encoding === "custom" && new Set(customCodes).size !== customCodes.length && <p className="text-sm text-danger mt-2">编码重复：已暂时改用二进制编码。</p>}
            </Step>
            {syn && !syn.ok && <p className="card p-4 text-danger text-sm">{syn.error}</p>}
            {syn?.ok && (
              <>
                <Step n={5}>
                  <ExcitationRef ff={ff} />
                </Step>
                <Step n={6}>
                  <EncodedTable syn={syn.s} />
                </Step>
                <Step n={7}>
                  {syn.s.vars.length >= 2 && syn.s.vars.length <= 5 ? (
                    <div className="flex flex-wrap gap-6">
                      {[...syn.s.nextColumns.map((c) => ({ ...c, title: `${c.name}^{n+1}` })), ...syn.s.excitation.map((c) => ({ ...c, title: c.name })), ...syn.s.outputColumns.map((c) => ({ ...c, title: c.name }))].map((c) => (
                        <div key={c.title} className="space-y-1">
                          <KMap vars={syn.s.vars} values={c.values} groups={c.min.solutions[0]?.map((i) => c.min.primes[i].covers) ?? []} compact title={c.title.replace("^{n+1}", "ⁿ⁺¹")} />
                          <div className="text-sm">
                            <Tex>{`${c.title.replace(/^Q(\d)/, "Q_$1").replace(/^([JKDT])(\d)/, "$1_$2")} = ${L(c.expr)}`}</Tex>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">共 {syn.s.vars.length} 个变量：{syn.s.vars.length > 5 ? "超出卡诺图范围（2～5 变量），直接用 QM 法化简" : "变量太少，不需要卡诺图"}。结果见下面的方程。</p>
                  )}
                  <p className="text-xs text-muted mt-3">× 为无关项（未使用的编码，或 JK 激励表中的任意值）。化简采用 Quine–McCluskey + Petrick 法，保证最简。</p>
                </Step>
                <Step n={8}>
                  {syn.s.nextColumns.map((c) => (
                    <div key={c.name}>
                      <Tex>{`${nextStateLatex(c.name, nsStyle)} = ${L(c.expr).replace(/Q_\{(\d+)\}/g, "Q_{$1}^{n}")}`}</Tex>
                    </div>
                  ))}
                </Step>
                <Step n={9}>
                  <div className="flex flex-wrap gap-x-8 gap-y-1">
                    {syn.s.excitation.map((c) => (
                      <Tex key={c.name}>{`${c.pin}_{${c.ff.slice(1)}} = ${L(c.expr)}`}</Tex>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-3">
                    逐状态核对：把驱动方程代入特性方程，检查每个合法状态在每种输入下是否得到目标次态——
                    <span className={syn.s.verified ? "text-accent" : "text-danger"}>{syn.s.verified ? `全部 ${syn.s.verification.length} 项一致。` : "存在不一致！"}</span>
                  </p>
                </Step>
                <Step n={10}>
                  {syn.s.outputColumns.map((c) => (
                    <div key={c.name}>
                      <Tex>{`${c.name} = ${L(c.expr)}`}</Tex>
                    </div>
                  ))}
                  <p className="text-xs text-muted mt-2">{reduced.kind === "mealy" ? "Mealy 型：输出式中含输入变量。" : "Moore 型：输出式只含状态变量。"}</p>
                </Step>
                <Step n={11}>{netlist && <div className="card-inset overflow-hidden"><Schematic netlist={netlist} className="h-[360px]" /></div>}</Step>
                <Step n={12}>
                  <SelfStartPanel a={{ ...syn.s.analysis, selfStart: syn.s.selfStart }} />
                  {!syn.s.selfStart.selfStarting && !forceSelfStart && (
                    <button className="btn btn-sm mt-3" onClick={() => setForceSelfStart(true)}>
                      修改：令未用状态的次态为初始状态，重新求方程
                    </button>
                  )}
                </Step>
                <Step n={13} aside={check && <span className={`chip ${check.ok ? "chip-accent" : "chip-danger"}`}>{check.ok ? "逐拍一致" : `第 ${check.firstMismatch + 1} 拍不一致`}</span>}>
                  {k > 0 && (
                    <label className="text-xs text-muted block mb-3">
                      输入序列 X（逐拍）
                      <input className="input mono w-full mt-1" value={inputSeq} onChange={(e) => setInputSeq(e.target.value)} aria-label="输入序列" />
                    </label>
                  )}
                  {check && (
                    <>
                      <Waveform
                        t1={check.sim.time}
                        channels={[
                          { kind: "bit", name: "CP", points: check.sim.trace("CLK"), clock: true },
                          ...syn.s.circuit.inputs.map((x) => ({ kind: "bit" as const, name: x, points: check.sim.trace(x) })),
                          ...syn.s.circuit.ffs.map((f) => ({ kind: "bit" as const, name: f.name, points: check.sim.trace(f.name) })),
                          busFromBits("状态", [...syn.s.circuit.ffs].reverse().map((f) => check.sim.trace(f.name)), 2),
                          ...syn.s.circuit.outputs.map((o) => ({ kind: "bit" as const, name: o.name, points: check.sim.trace(o.name) })),
                        ]}
                        title="设计电路的门级仿真波形"
                      />
                      <div className="overflow-x-auto thin-scroll mt-3">
                        <table className="ltable">
                          <tbody>
                            {k > 0 && (
                              <tr>
                                <th>X</th>
                                {check.inputs.map((x, i) => (
                                  <td key={i}>{x}</td>
                                ))}
                              </tr>
                            )}
                            <tr>
                              <th>期望 {reduced.outputs[0]}</th>
                              {check.expectedOut.map((o, i) => (
                                <td key={i}>{o[0]}</td>
                              ))}
                            </tr>
                            <tr>
                              <th>仿真 {reduced.outputs[0]}</th>
                              {check.actualOut.map((o, i) => (
                                <td key={i} className={o[0] === check.expectedOut[i][0] ? "text-accent" : "text-sigx font-bold"}>
                                  {o[0] ?? "X"}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted mt-2">期望值由原始状态表逐拍计算；仿真值由生成的门级电路在仿真引擎中运行得到，两者独立。</p>
                    </>
                  )}
                </Step>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SpecTable({ spec, caption }: { spec: StateTableSpec; caption?: string }) {
  const K = 1 << spec.inputs.length;
  return (
    <div className="overflow-x-auto thin-scroll">
      {caption && <div className="eyebrow mb-1">{caption}</div>}
      <table className="ltable">
        <thead>
          <tr>
            <th>现态</th>
            {Array.from({ length: K }, (_, x) => (
              <th key={x} className="sep">
                {spec.inputs.length ? `${spec.inputs.join("")}=${stateBits(x, spec.inputs.length)}` : "次态"}
                {spec.kind === "mealy" ? " 次态/输出" : ""}
              </th>
            ))}
            {spec.kind === "moore" && <th className="sep">输出</th>}
          </tr>
        </thead>
        <tbody>
          {spec.states.map((s, i) => (
            <tr key={s}>
              <td>{s}</td>
              {spec.next[i].map((t, x) => (
                <td key={x} className="sep">
                  {spec.states[t]}
                  {spec.kind === "mealy" ? ` / ${spec.out[i][x].join("")}` : ""}
                </td>
              ))}
              {spec.kind === "moore" && <td className="sep">{spec.out[i][0].join("")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImplicationTable({ spec, pairs }: { spec: StateTableSpec; pairs: ReturnType<typeof minimizeStates>["pairs"] }) {
  const N = spec.states.length;
  const cell = 52;
  return (
    <div className="overflow-x-auto thin-scroll">
      <div className="eyebrow mb-2">隐含表</div>
      <svg width={(N - 1) * cell + 40} height={(N - 1) * cell + 30} className="max-w-full h-auto">
        {Array.from({ length: N - 1 }, (_, r) => {
          const i = r + 1;
          return (
            <g key={i}>
              <text x={30} y={r * cell + cell / 2 + 4} textAnchor="end" fontSize={11} className="mono" fill="var(--ink-2)">
                {spec.states[i]}
              </text>
              {Array.from({ length: i }, (_, j) => {
                const st = pairs.get(`${i},${j}`)!;
                const x = 36 + j * cell;
                const y = r * cell;
                return (
                  <g key={j}>
                    <rect x={x} y={y} width={cell} height={cell} fill={st.kind === "equivalent" ? "var(--accent-soft)" : "var(--bg-2)"} stroke="var(--line-2)" />
                    {st.kind === "output" && (
                      <text x={x + cell / 2} y={y + cell / 2 + 6} textAnchor="middle" fontSize={18} fill="var(--sig-x)">
                        ✕
                      </text>
                    )}
                    {st.kind === "next" && (
                      <>
                        <text x={x + cell / 2} y={y + cell / 2 + 2} textAnchor="middle" fontSize={16} fill="var(--amber)">
                          ✕
                        </text>
                        <text x={x + cell / 2} y={y + cell - 5} textAnchor="middle" fontSize={8.5} className="mono" fill="var(--muted)">
                          {spec.states[st.because[0]]},{spec.states[st.because[1]]}
                        </text>
                      </>
                    )}
                    {st.kind === "equivalent" && (
                      <text x={x + cell / 2} y={y + cell / 2 + 4} textAnchor="middle" fontSize={9} className="mono" fill="var(--accent)">
                        {st.implied.length ? st.implied.map(([a, b]) => `${spec.states[a]}${spec.states[b]}`).join(" ") : "≡"}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        {Array.from({ length: N - 1 }, (_, j) => (
          <text key={j} x={36 + j * cell + cell / 2} y={(N - 1) * cell + 16} textAnchor="middle" fontSize={11} className="mono" fill="var(--ink-2)">
            {spec.states[j]}
          </text>
        ))}
      </svg>
      <p className="text-xs text-muted mt-1">
        <span className="text-sigx">✕</span> 输出不同；<span className="text-amber">✕</span> 隐含对（格内小字）不等价，在迭代中被划掉；绿色格为等价。
      </p>
    </div>
  );
}

function ExcitationRef({ ff }: { ff: FFType }) {
  const rows: [string, string][] =
    ff === "JK"
      ? [
          ["0 → 0", "J=0, K=×"],
          ["0 → 1", "J=1, K=×"],
          ["1 → 0", "J=×, K=1"],
          ["1 → 1", "J=×, K=0"],
        ]
      : ff === "T"
        ? [
            ["0 → 0", "T=0"],
            ["0 → 1", "T=1"],
            ["1 → 0", "T=1"],
            ["1 → 1", "T=0"],
          ]
        : [
            ["0 → 0", "D=0"],
            ["0 → 1", "D=1"],
            ["1 → 0", "D=0"],
            ["1 → 1", "D=1"],
          ];
  return (
    <div className="flex flex-wrap gap-6 items-start text-sm">
      <table className="ltable">
        <thead>
          <tr>
            <th>
              Q<sup>n</sup> → Q<sup>n+1</sup>
            </th>
            <th className="sep">所需输入（激励表）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td className="sep">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="max-w-md leading-relaxed text-ink-2">
        {ff === "JK" && "JK 触发器的激励表中每一行都有一个无关项 ×，化简时可以充分利用，所以 JK 实现的驱动方程通常最简单，但每个触发器要两个驱动方程。"}
        {ff === "D" && "D 触发器的次态就等于 D，驱动方程 = 状态方程，设计最直接。"}
        {ff === "T" && "T 触发器在需要翻转时 T=1，适合计数器类电路。"}
      </p>
    </div>
  );
}

function EncodedTable({ syn }: { syn: ReturnType<typeof synthesize> }) {
  const nv = syn.vars.length;
  const rows = 1 << nv;
  const cols = [...syn.nextColumns.map((c) => ({ name: `${c.name}ⁿ⁺¹`, values: c.values })), ...syn.excitation.map((c) => ({ name: c.name, values: c.values })), ...syn.outputColumns.map((c) => ({ name: c.name, values: c.values }))];
  return (
    <div className="overflow-x-auto thin-scroll max-h-[420px]">
      <table className="ltable">
        <thead>
          <tr>
            {syn.vars.map((v, i) => (
              <th key={v} className={i === syn.spec.inputs.length ? "sep" : ""}>
                {v}
                {i >= syn.spec.inputs.length ? "ⁿ" : ""}
              </th>
            ))}
            {cols.map((c, i) => (
              <th key={c.name} className={i === 0 || i === syn.nextColumns.length ? "sep" : ""}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => {
            const unused = cols[0].values[r] === "x";
            return (
              <tr key={r} className={unused ? "opacity-50" : ""}>
                {syn.vars.map((v, j) => (
                  <td key={v} className={j === syn.spec.inputs.length ? "sep" : ""}>
                    {(r >> (nv - 1 - j)) & 1}
                  </td>
                ))}
                {cols.map((c, i) => (
                  <td key={c.name} className={`${i === 0 || i === syn.nextColumns.length ? "sep" : ""} ${c.values[r] === "x" ? "text-amber" : ""}`}>
                    {c.values[r] === "x" ? "×" : c.values[r]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2">灰色行是未使用的编码，其次态与输出均为无关项 ×。</p>
    </div>
  );
}

function CustomTableEditor({ spec, onChange }: { spec: StateTableSpec; onChange: (s: StateTableSpec) => void }) {
  const K = 1 << spec.inputs.length;
  const resize = (n: number, hasInput: boolean, kind: "moore" | "mealy") => {
    const inputs = hasInput ? ["X"] : [];
    const k2 = 1 << inputs.length;
    const states = Array.from({ length: n }, (_, i) => `S${i}`);
    const next = states.map((_, i) => Array.from({ length: k2 }, (_, x) => spec.next[i]?.[x] ?? spec.next[i]?.[0] ?? (i + 1) % n).map((t) => Math.min(t, n - 1)));
    const out = states.map((_, i) => Array.from({ length: k2 }, (_, x) => [((kind === "moore" ? spec.out[i]?.[0]?.[0] : spec.out[i]?.[x]?.[0]) ?? 0) as Bit]));
    onChange({ ...spec, kind, inputs, states, next, out, initial: 0 });
  };
  const setNext = (s: number, x: number, t: number) => onChange({ ...spec, next: spec.next.map((r, i) => (i === s ? r.map((v, j) => (j === x ? t : v)) : r)) });
  const setOut = (s: number, x: number, o: Bit) =>
    onChange({ ...spec, out: spec.out.map((r, i) => (i === s ? r.map((v, j) => (spec.kind === "moore" || j === x ? [o] : v)) : r)) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 items-end text-xs text-muted">
        <label className="space-y-1">
          <span className="block">状态数</span>
          <select className="select" value={spec.states.length} onChange={(e) => resize(Number(e.target.value), spec.inputs.length > 0, spec.kind)}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">外部输入</span>
          <select className="select" value={spec.inputs.length} onChange={(e) => resize(spec.states.length, e.target.value === "1", spec.kind)}>
            <option value={0}>无（计数器类）</option>
            <option value={1}>1 个输入 X</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">类型</span>
          <select className="select" value={spec.kind} onChange={(e) => resize(spec.states.length, spec.inputs.length > 0, e.target.value as "moore" | "mealy")}>
            <option value="moore">Moore</option>
            <option value="mealy">Mealy</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <table className="ltable">
          <thead>
            <tr>
              <th>现态</th>
              {Array.from({ length: K }, (_, x) => (
                <th key={x} className="sep">
                  {spec.inputs.length ? `X=${x}` : ""} 次态{spec.kind === "mealy" ? " / 输出" : ""}
                </th>
              ))}
              {spec.kind === "moore" && <th className="sep">输出</th>}
            </tr>
          </thead>
          <tbody>
            {spec.states.map((s, i) => (
              <tr key={s}>
                <td>{s}</td>
                {Array.from({ length: K }, (_, x) => (
                  <td key={x} className="sep">
                    <select className="select !h-7 mono" value={spec.next[i][x]} onChange={(e) => setNext(i, x, Number(e.target.value))} aria-label={`${s} 在 X=${x} 时的次态`}>
                      {spec.states.map((t, j) => (
                        <option key={t} value={j}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {spec.kind === "mealy" && (
                      <button className="btn btn-sm ml-1 mono" onClick={() => setOut(i, x, (spec.out[i][x][0] ^ 1) as Bit)}>
                        /{spec.out[i][x][0]}
                      </button>
                    )}
                  </td>
                ))}
                {spec.kind === "moore" && (
                  <td className="sep">
                    <button className="btn btn-sm mono" onClick={() => setOut(i, 0, (spec.out[i][0][0] ^ 1) as Bit)}>
                      {spec.out[i][0][0]}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">初始状态为 S0。输出变量名为 {spec.outputs[0]}。</p>
    </div>
  );
}
