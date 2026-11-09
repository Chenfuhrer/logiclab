"use client";

import { useMemo, useState } from "react";
import { buildJKCounter, DEFAULT_JK_CONFIG, DRIVE_OPTIONS, type JKCounterConfig } from "@/content/experiments/jk-counter";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { analyzeSync, stateBits } from "@/lib/fsm/analyze";
import { useSimulation } from "@/hooks/useSimulation";
import { Schematic } from "@/components/circuit/Schematic";
import { Waveform, busFromBits } from "@/components/waveform/Waveform";
import { EquationsPanel, StateTablePanel, DiagramPanel, SelfStartPanel } from "@/components/fsm/AnalysisPanels";
import { Tex } from "@/components/ui/Tex";
import { IssueList } from "./IssueList";
import type { L } from "@/lib/sim/types";

type Pin = keyof JKCounterConfig["drives"];
const PINS: Pin[] = ["J2", "K2", "J1", "K1", "J0", "K0"];

export function JKCounterLab() {
  const [cfg, setCfg] = useState<JKCounterConfig>(DEFAULT_JK_CONFIG);
  const [model, setModel] = useState<"ideal" | "delay">("ideal");
  const [tab, setTab] = useState<"table" | "diagram" | "selfstart">("diagram");
  const netlist = useMemo(() => buildJKCounter(cfg), [cfg]);
  const extracted = useMemo(() => extractSyncCircuit(netlist), [netlist]);
  const analysis = useMemo(() => (extracted.ok ? analyzeSync(extracted.circuit, cfg.init) : null), [extracted, cfg.init]);
  const { sim, version, step, run, stop, running } = useSimulation(netlist, { model });

  const readState = (): number | null => {
    if (!sim) return null;
    const b = [sim.netValue("Q2"), sim.netValue("Q1"), sim.netValue("Q0")] as L[];
    if (b.some((x) => x !== 0 && x !== 1)) return null;
    return (b[0] as number) * 4 + (b[1] as number) * 2 + (b[2] as number);
  };
  const cur = readState();
  // 由波形记录还原每个时钟周期结束时的状态（仿真观察值）
  const states: number[] = [];
  if (sim) {
    const at = (name: string, t: number) => {
      let v: L = 2;
      for (const p of sim.trace(name)) if (p.t <= t) v = p.v;
      return v;
    };
    for (let k = 0; k <= sim.steps; k++) {
      const t = k === 0 ? 0 : k * 100 - 1;
      const b = [at("Q2", t), at("Q1", t), at("Q0", t)];
      if (b.some((x) => x !== 0 && x !== 1)) break;
      states.push((b[0] as number) * 4 + (b[1] as number) * 2 + (b[2] as number));
    }
  }
  const prev = states.length >= 2 ? states[states.length - 2] : null;
  const next = analysis && cur !== null ? analysis.rows[cur].next : null;
  const consistent = analysis ? states.every((s, i) => i === 0 || analysis.rows[states[i - 1]].next === s) : null;

  const t1 = Math.max(sim?.time ?? 0, 800);
  const channels = sim
    ? [
        { kind: "bit" as const, name: "CP", points: sim.trace("CLK"), clock: true },
        { kind: "bit" as const, name: "Q0", points: sim.trace("Q0") },
        { kind: "bit" as const, name: "Q1", points: sim.trace("Q1") },
        { kind: "bit" as const, name: "Q2", points: sim.trace("Q2") },
        busFromBits("Q2Q1Q0", [sim.trace("Q0"), sim.trace("Q1"), sim.trace("Q2")], 2),
        { kind: "bit" as const, name: "C", points: sim.trace("C") },
      ]
    : [];
  void version;

  const setDrive = (p: Pin, v: string) => setCfg((c) => ({ ...c, drives: { ...c.drives, [p]: v } }));
  const isDefault = JSON.stringify(cfg.drives) === JSON.stringify(DEFAULT_JK_CONFIG.drives);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* 左：电路与控制 */}
      <section className="card p-4 space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={() => step(1)} disabled={running} data-testid="step">
            单步 CP
          </button>
          {running ? (
            <button className="btn" onClick={stop}>
              暂停
            </button>
          ) : (
            <button className="btn" onClick={() => run(650)}>
              连续运行
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              stop();
              setCfg({ ...cfg });
            }}
          >
            重置
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <label className="text-xs text-muted flex items-center gap-1.5">
            初始状态
            <select className="select !h-8 mono" value={cfg.init} onChange={(e) => setCfg({ ...cfg, init: Number(e.target.value) })} aria-label="初始状态">
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>
                  {stateBits(i, 3)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted flex items-center gap-1.5">
            触发沿
            <select className="select !h-8" value={cfg.edge} onChange={(e) => setCfg({ ...cfg, edge: e.target.value as "rising" | "falling" })} aria-label="触发沿">
              <option value="falling">下降沿 ↓</option>
              <option value="rising">上升沿 ↑</option>
            </select>
          </label>
          <label className="text-xs text-muted flex items-center gap-1.5">
            模型
            <select className="select !h-8" value={model} onChange={(e) => setModel(e.target.value as "ideal" | "delay")} aria-label="仿真模型">
              <option value="ideal">A/B 理想（零延迟）</option>
              <option value="delay">C 传输延迟</option>
            </select>
          </label>
        </div>

        <div className="card-inset overflow-hidden">
          <Schematic netlist={netlist} values={sim?.valuesById()} className="h-[300px] sm:h-[360px]" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Readout label="现态 Q2Q1Q0" value={cur === null ? "XXX" : stateBits(cur, 3)} tone="amber" />
          <Readout label="次态（由状态方程）" value={next === null ? "—" : stateBits(next, 3)} />
          <Readout label="时钟数" value={String(sim?.steps ?? 0)} />
        </div>

        <details className="card-inset p-3" open>
          <summary className="cursor-pointer text-sm font-medium">修改驱动连接（受支持的输入：常量、Qᵢ、Q̄ᵢ、两变量乘积）</summary>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PINS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <span className="w-7 mono text-ink-2">
                  {p[0]}
                  <sub>{p[1]}</sub>
                </span>
                <select className="select !h-8 flex-1 mono" value={cfg.drives[p]} onChange={(e) => setDrive(p, e.target.value)} aria-label={`${p} 的驱动源`}>
                  {DRIVE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value.replace(/'/g, "′")}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!isDefault && (
            <button className="btn btn-sm mt-3" onClick={() => setCfg({ ...cfg, drives: DEFAULT_JK_CONFIG.drives })}>
              恢复默认（加法计数器）
            </button>
          )}
        </details>
        {sim && <IssueList issues={sim.issues} />}
      </section>

      {/* 右：波形 + 状态表/图 */}
      <section className="space-y-4 min-w-0">
        <Waveform channels={channels} t1={t1} title={`时序波形 · ${model === "ideal" ? "理想模型" : "传输延迟模型（门 10 ns / 触发器 20 ns，教学示意值）"}`} />
        <div className="card p-4">
          <div className="flex gap-1 mb-3" role="tablist">
            {(
              [
                ["diagram", "状态转换图"],
                ["table", "状态转换表"],
                ["selfstart", "自启动检查"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {!analysis ? (
            <p className="text-sm text-danger">{!extracted.ok ? extracted.reason : ""}</p>
          ) : tab === "diagram" ? (
            <div className="max-w-[380px] mx-auto">
              <DiagramPanel a={analysis} current={cur} active={prev !== null && cur !== null ? { from: prev, to: cur } : null} />
            </div>
          ) : tab === "table" ? (
            <StateTablePanel a={analysis} current={cur} />
          ) : (
            <SelfStartPanel a={analysis} />
          )}
        </div>
      </section>

      {/* 底部：推导过程 */}
      <section className="card p-5 xl:col-span-2 grid gap-6 lg:grid-cols-3">
        <div>
          <div className="eyebrow mb-3">① 从网表自动提取</div>
          {analysis ? <EquationsPanel a={analysis} /> : <p className="text-sm text-muted">—</p>}
        </div>
        <div className="text-sm space-y-3 leading-relaxed">
          <div className="eyebrow">② 推导依据</div>
          <p>
            JK 触发器特性方程 <Tex>{"Q^{n+1} = J\\overline{Q^n} + \\overline{K}Q^n"}</Tex>。把每个触发器的驱动方程代入，得到状态方程；再对全部 8 个现态逐一代入，得到左侧的状态转换表。
          </p>
          <p className="text-muted text-xs">
            三个触发器共用时钟 CP，在同一有效沿“先统一采样、再统一更新”，所以 FF1 采样到的 Q0 是沿到来之前的值——这正是同步电路可以用“现态代入方程”分析的原因。
          </p>
        </div>
        <div className="text-sm space-y-3">
          <div className="eyebrow">③ 计数序列与一致性</div>
          {analysis && (
            <p className="mono text-xs break-all">
              分析：{analysis.sequence.map((s) => stateBits(s, 3)).join(" → ")}
            </p>
          )}
          <p className="mono text-xs break-all">仿真：{states.map((s) => stateBits(s, 3)).join(" → ")}</p>
          {consistent !== null && (
            <span className={`chip ${consistent ? "chip-accent" : "chip-danger"}`}>{consistent ? "仿真结果与符号分析逐拍一致" : "仿真与分析不一致（请报告此问题）"}</span>
          )}
          {analysis && analysis.sequence.length === 9 && new Set(analysis.sequence.slice(0, 8)).size === 8 && <p className="text-xs text-muted">8 个状态构成一个循环：模 8 加法计数器，C 在 111 时为 1。</p>}
        </div>
      </section>
    </div>
  );
}

export function Readout({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="card-inset px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`mono text-xl font-bold tracking-wider ${tone === "amber" ? "text-amber" : "text-ink"}`}>{value}</div>
    </div>
  );
}
