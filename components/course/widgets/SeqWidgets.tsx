"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { L, Netlist } from "@/lib/sim/types";
import { runStimulus, clockEvents } from "@/lib/sim/stimulus";
import { Waveform, type Channel } from "@/components/waveform/Waveform";
import { analyzeSync, type SyncCircuit } from "@/lib/fsm/analyze";
import { parseExpr } from "@/lib/logic";
import { EquationsPanel, StateTablePanel, DiagramPanel, SelfStartPanel } from "@/components/fsm/AnalysisPanels";
import { sequenceDetector, minimizeStates } from "@/lib/fsm/design";
import { StateDiagram } from "@/components/fsm/StateDiagram";
import { EXPERIMENTS } from "@/content/course";
import { Tex } from "@/components/ui/Tex";

const T = 100;

/** 可编辑的位序列（每个元素一个周期 / 半周期） */
function BitRow({ label, bits, onChange, sub }: { label: string; bits: (0 | 1)[]; onChange: (b: (0 | 1)[]) => void; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-xs w-10 text-ink-2">{label}</span>
      <div className="flex gap-0.5 flex-wrap">
        {bits.map((b, i) => (
          <button key={i} className={`lv ${b ? "lv-1" : "lv-0"} !w-7`} onClick={() => onChange(bits.map((x, j) => (j === i ? ((x ^ 1) as 0 | 1) : x)))} aria-label={`${label} 第 ${i + 1} 段 = ${b}`}>
            {b}
          </button>
        ))}
      </div>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

// ───────────────────────── 触发方式对比 ─────────────────────────

/**
 * 同一组 CLK 与 D 输入，同时送给：D 锁存器（EN=CLK）、上升沿 D 触发器、主从 JK（J=D, K=D̄）。
 * D 以 1/4 周期为单位编辑，可以在 CLK=1 期间制造变化，观察三者的差别。
 */
export function TriggerCompare() {
  const N = 6;
  const [d, setD] = useState<(0 | 1)[]>([0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  const sim = useMemo(() => {
    const netlist: Netlist = {
      version: 1,
      name: "触发方式对比",
      components: [
        { id: "CLK", type: "clock", x: 0, y: 0 },
        { id: "D", type: "switch", x: 0, y: 0 },
        { id: "N", type: "not", x: 0, y: 0 },
        { id: "LAT", type: "d_latch", params: { init: 0 }, x: 0, y: 0 },
        { id: "DFF", type: "dff", params: { init: 0, edge: "rising" }, x: 0, y: 0 },
        { id: "MS", type: "jkff_ms", params: { init: 0 }, x: 0, y: 0 },
      ],
      nets: [
        { id: "CLK", endpoints: [{ comp: "CLK", pin: "CLK" }, { comp: "LAT", pin: "EN" }, { comp: "DFF", pin: "CLK" }, { comp: "MS", pin: "CLK" }] },
        { id: "D", endpoints: [{ comp: "D", pin: "Y" }, { comp: "LAT", pin: "D" }, { comp: "DFF", pin: "D" }, { comp: "MS", pin: "J" }, { comp: "N", pin: "A" }] },
        { id: "DN", endpoints: [{ comp: "N", pin: "Y" }, { comp: "MS", pin: "K" }] },
        { id: "QL", endpoints: [{ comp: "LAT", pin: "Q" }] },
        { id: "QE", endpoints: [{ comp: "DFF", pin: "Q" }] },
        { id: "QM", endpoints: [{ comp: "MS", pin: "Q" }] },
      ],
    };
    const evs = [...clockEvents("CLK", T, N), ...d.map((v, i) => ({ t: i * (T / 4) + 5, comp: "D", v: v as L }))];
    return runStimulus(netlist, evs, N * T);
  }, [d]);
  const ch: Channel[] = [
    { kind: "bit", name: "CLK", points: sim.trace("CLK"), clock: true },
    { kind: "bit", name: "D", points: sim.trace("D") },
    { kind: "bit", name: "Q 锁存", points: sim.trace("QL") },
    { kind: "bit", name: "Q 边沿", points: sim.trace("QE") },
    { kind: "bit", name: "Q 主从", points: sim.trace("QM") },
  ];
  return (
    <div className="widget card p-4 space-y-3">
      <BitRow label="D" bits={d} onChange={setD} sub="每格 1/4 周期，点击翻转" />
      <Waveform channels={ch} t1={N * T} title="同一输入 · 三种触发方式" />
      <ul className="text-xs text-muted space-y-1 leading-relaxed">
        <li>
          <span className="text-ink">D 锁存器</span>（电平触发，EN=CLK）：CLK=1 的整个期间都“透明”，D 的每次变化都会传到 Q。
        </li>
        <li>
          <span className="text-ink">边沿 D 触发器</span>：只在 CLK 上升沿那一刻采样 D，其余时间 D 怎么变都不影响 Q。
        </li>
        <li>
          <span className="text-ink">主从 JK（J=D, K=D̄，脉冲触发）</span>：CLK=1 期间主触发器接收输入，下降沿时输出。若 CLK=1 期间出现过使主触发器翻转的输入，即使随后撤销，翻转也已“记住”（一次翻转），结果可能与边沿触发不同。
        </li>
      </ul>
    </div>
  );
}

// ───────────────────────── 触发器波形实验 ─────────────────────────

const FF_PINS: Record<string, string[]> = { D: ["D"], JK: ["J", "K"], T: ["T"], SR: ["S", "R"] };
const CHAR_EQ: Record<string, string> = {
  D: "Q^{n+1} = D",
  JK: "Q^{n+1} = J\\overline{Q^n} + \\overline{K}Q^n",
  T: "Q^{n+1} = T \\oplus Q^n",
  SR: "Q^{n+1} = S + \\overline{R}Q^n,\\ \\ SR = 0",
};

export function FFLab({ type = "JK", edge = "rising" }: { type?: "D" | "JK" | "T" | "SR"; edge?: "rising" | "falling" }) {
  const N = 8;
  const pins = FF_PINS[type];
  const seed: Record<string, (0 | 1)[]> = { D: [1, 0, 1, 1, 0, 0, 1, 0], J: [1, 0, 1, 0, 1, 1, 0, 0], K: [0, 0, 1, 1, 1, 0, 0, 1], T: [1, 1, 0, 1, 0, 1, 1, 0], S: [1, 0, 0, 0, 0, 1, 0, 0], R: [0, 0, 1, 0, 0, 0, 1, 0] };
  const [inputs, setInputs] = useState<Record<string, (0 | 1)[]>>(Object.fromEntries(pins.map((p) => [p, seed[p]])));
  const [init, setInit] = useState<0 | 1>(0);
  const [practice, setPractice] = useState(false);
  const [guess, setGuess] = useState<(0 | 1 | null)[]>(Array(N).fill(null));
  const [checked, setChecked] = useState(false);
  const sim = useMemo(() => {
    const netlist: Netlist = {
      version: 1,
      name: "FF",
      components: [{ id: "CLK", type: "clock", x: 0, y: 0 }, { id: "U", type: `${type.toLowerCase()}ff`, params: { edge, init }, x: 0, y: 0 }, ...pins.map((p) => ({ id: `S_${p}`, type: "switch", x: 0, y: 0 }))],
      nets: [{ id: "CLK", endpoints: [{ comp: "CLK", pin: "CLK" }, { comp: "U", pin: "CLK" }] }, { id: "Q", endpoints: [{ comp: "U", pin: "Q" }] }, ...pins.map((p) => ({ id: p, endpoints: [{ comp: `S_${p}`, pin: "Y" }, { comp: "U", pin: p }] }))],
    };
    // 输入在有效沿前 1/4 周期变化：上升沿在 kT，下降沿在 kT+T/2
    const off = edge === "rising" ? -T / 4 : T / 4;
    const start = edge === "rising" ? T / 2 : 0;
    const evs = [...clockEvents("CLK", T, N, start)];
    pins.forEach((p) => inputs[p].forEach((v, k) => evs.push({ t: Math.max(1, start + k * T + off), comp: `S_${p}`, v })));
    return runStimulus(netlist, evs, start + N * T);
  }, [inputs, init, type, edge, pins]);
  const edgeTimes = Array.from({ length: N }, (_, k) => (edge === "rising" ? T / 2 + k * T : k * T + T / 2));
  const qAfter = edgeTimes.map((t) => {
    let v: L = 2;
    for (const p of sim.trace("Q")) if (p.t <= t + 1) v = p.v;
    return v;
  });
  const showQ = !practice || checked;
  const ch: Channel[] = [
    { kind: "bit", name: "CLK", points: sim.trace("CLK"), clock: true },
    ...pins.map((p) => ({ kind: "bit" as const, name: p, points: sim.trace(p) })),
    ...(showQ ? [{ kind: "bit" as const, name: "Q", points: sim.trace("Q") }] : []),
  ];
  const correct = guess.map((g, i) => g === qAfter[i]);
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <span className="chip chip-accent">
          {type} 触发器 · {edge === "rising" ? "上升沿" : "下降沿"}
        </span>
        <Tex>{CHAR_EQ[type]}</Tex>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          初态 Q
          <button className={`lv ${init ? "lv-1" : "lv-0"}`} onClick={() => setInit((init ^ 1) as 0 | 1)}>
            {init}
          </button>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={practice}
            onChange={(e) => {
              setPractice(e.target.checked);
              setChecked(false);
              setGuess(Array(N).fill(null));
            }}
            className="accent-[var(--accent)]"
          />
          画波形练习
        </label>
      </div>
      {pins.map((p) => (
        <BitRow key={p} label={p} bits={inputs[p]} onChange={(b) => setInputs({ ...inputs, [p]: b })} sub="每格对应一个时钟周期（在有效沿前变化）" />
      ))}
      <Waveform channels={ch} t1={(edge === "rising" ? T / 2 : 0) + N * T} markers={edgeTimes.map((t, i) => ({ t, label: `${i + 1}`, tone: "amber" as const }))} />
      {practice && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="mono text-xs w-10 text-ink-2">Q 预测</span>
            <div className="flex gap-0.5">
              {guess.map((g, i) => (
                <button
                  key={i}
                  className={`lv !w-7 ${g === null ? "lv-z" : g ? "lv-1" : "lv-0"} ${checked && !correct[i] ? "ring-2 ring-[var(--sig-x)]" : ""}`}
                  onClick={() => {
                    setChecked(false);
                    setGuess(guess.map((x, j) => (j === i ? (x === null ? 1 : x === 1 ? 0 : 1) : x)));
                  }}
                  aria-label={`第 ${i + 1} 个有效沿后 Q 的预测`}
                >
                  {g ?? "?"}
                </button>
              ))}
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => setChecked(true)} disabled={guess.some((g) => g === null)}>
              核对
            </button>
          </div>
          {checked && (
            <p className={`text-sm ${correct.every(Boolean) ? "text-accent" : "text-danger"}`}>
              {correct.every(Boolean)
                ? "全部正确！"
                : `第 ${correct.indexOf(false) + 1} 个有效沿之后 Q 不正确。请检查该沿到来前的输入（${pins.map((p) => `${p}=${inputs[p][correct.indexOf(false)]}`).join("，")}）以及当时的 Q，再代入特性方程。`}
            </p>
          )}
          <p className="text-xs text-muted">在每个琥珀色编号的有效沿之后，Q 会变成什么？点格子填写，填完后由仿真引擎核对。</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 同步电路分析器 ─────────────────────────

export interface CircuitText {
  inputs?: string[];
  ffs: { name: string; type: "D" | "JK" | "T" | "SR"; inputs: Record<string, string> }[];
  outputs?: { name: string; expr: string }[];
  initial?: number;
}

export function SyncAnalyzer({ circuit, edge = "rising" }: { circuit: CircuitText; edge?: "rising" | "falling" }) {
  const [tab, setTab] = useState<"eq" | "table" | "diagram" | "self">("eq");
  const res = useMemo(() => {
    try {
      const c: SyncCircuit = {
        inputs: circuit.inputs ?? [],
        ffs: circuit.ffs.map((f) => ({ name: f.name, type: f.type, edge, inputs: Object.fromEntries(Object.entries(f.inputs).map(([k, v]) => [k, parseExpr(v)])) })),
        outputs: (circuit.outputs ?? []).map((o) => ({ name: o.name, expr: parseExpr(o.expr) })),
      };
      return { a: analyzeSync(c, circuit.initial ?? 0) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [circuit, edge]);
  if ("error" in res) return <p className="widget text-danger text-sm">电路描述有误：{res.error}</p>;
  const a = res.a!;
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex gap-1 flex-wrap" role="tablist">
        {(
          [
            ["eq", "方程组"],
            ["table", "状态转换表"],
            ["diagram", "状态转换图"],
            ["self", "自启动"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        <span className="ml-auto chip">{a.kind === "moore" ? "Moore 型" : a.kind === "mealy" ? "Mealy 型" : "无输出"}</span>
      </div>
      {tab === "eq" && <EquationsPanel a={a} />}
      {tab === "table" && <StateTablePanel a={a} />}
      {tab === "diagram" && (
        <div className="max-w-[360px] mx-auto">
          <DiagramPanel a={a} />
        </div>
      )}
      {tab === "self" && <SelfStartPanel a={a} />}
      {a.nInputs === 0 && a.sequence.length > 1 && (
        <p className="text-xs text-muted mono">
          从 {a.sequence[0].toString(2).padStart(a.stateVars.length, "0")} 出发：{a.sequence.map((s) => s.toString(2).padStart(a.stateVars.length, "0")).join(" → ")}
        </p>
      )}
      <p className="text-xs text-muted">以上全部由分析器根据驱动方程计算得出（代入特性方程 → 枚举全部现态与输入）。</p>
    </div>
  );
}

// ───────────────────────── 序列检测器演示 ─────────────────────────

export function SeqDetectorDemo({ seq = "101", kind = "mealy", overlap = true }: { seq?: string; kind?: "mealy" | "moore"; overlap?: boolean }) {
  const spec = useMemo(() => sequenceDetector(seq, kind, overlap), [seq, kind, overlap]);
  const min = useMemo(() => minimizeStates(spec), [spec]);
  const nodes = spec.states.map((s, i) => ({ id: i, label: s, sub: kind === "moore" ? String(spec.out[i][0][0]) : undefined }));
  const edges = spec.next.flatMap((row, s) => row.map((t, x) => ({ from: s, to: t, label: `${x}${kind === "mealy" ? "/" + spec.out[s][x][0] : ""}` })));
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="chip chip-accent mono">检测 {seq}</span>
        <span className="chip">{kind === "mealy" ? "Mealy" : "Moore"}</span>
        <span className="chip">{overlap ? "可重叠" : "不可重叠"}</span>
        <span className="chip">{spec.states.length} 个原始状态 → 化简后 {min.classes.length} 个</span>
        <Link className="btn btn-sm ml-auto" href={`/lab/fsm-designer?seq=${seq}&kind=${kind}&overlap=${overlap ? 1 : 0}`}>
          在设计向导中完成设计 →
        </Link>
      </div>
      <div className="grid md:grid-cols-2 gap-4 items-center">
        <table className="ltable">
          <thead>
            <tr>
              <th>现态</th>
              <th className="sep">X=0</th>
              <th className="sep">X=1</th>
              {kind === "moore" && <th className="sep">Y</th>}
            </tr>
          </thead>
          <tbody>
            {spec.states.map((s, i) => (
              <tr key={s}>
                <td>
                  {s} <span className="text-muted text-[10px]">“{seq.slice(0, i) || "—"}”</span>
                </td>
                {[0, 1].map((x) => (
                  <td key={x} className="sep">
                    {spec.states[spec.next[i][x]]}
                    {kind === "mealy" ? ` / ${spec.out[i][x][0]}` : ""}
                  </td>
                ))}
                {kind === "moore" && <td className="sep">{spec.out[i][0][0]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="max-w-[320px] mx-auto w-full">
          <StateDiagram nodes={nodes} edges={edges} order={spec.states.map((_, i) => i)} size={300} />
        </div>
      </div>
      <p className="text-xs text-muted">表中引号内是该状态“已经匹配的前缀”。次态 = 已匹配串加上新输入后，既是其后缀又是目标序列前缀的最长部分。</p>
    </div>
  );
}

// ───────────────────────── 实验入口卡片 ─────────────────────────

export function ExperimentCard({ id }: { id: string }) {
  const e = EXPERIMENTS.find((x) => x.id === id);
  if (!e) return <p className="widget text-danger text-sm">未知实验 {id}</p>;
  return (
    <Link href={e.href} className="widget group card p-5 flex items-center gap-5 !no-underline hover:border-accent transition-colors">
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden className="shrink-0">
        <path d="M2 30 H10 V10 H22 V30 H34 V10 H46 V30 H54" fill="none" stroke="var(--amber)" strokeWidth="2" />
        <path d="M2 36 H18 V22 H40 V36 H54" fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <span className="min-w-0">
        <span className="block font-semibold text-ink group-hover:text-accent">{e.title}</span>
        <span className="block text-sm text-ink-2 mt-0.5">{e.summary}</span>
      </span>
      <span className="ml-auto text-accent text-xl">→</span>
    </Link>
  );
}
