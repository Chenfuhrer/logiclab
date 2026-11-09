"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Simulator } from "@/lib/sim/engine";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import type { L, TracePoint } from "@/lib/sim/types";

/**
 * 首页的“示波器”：真实运行实验 A 的网表（三个 JK 触发器），每 0.7 秒一个时钟周期。
 * 画面上的每一个跳变都由仿真引擎算出，不是预先画好的动画。
 */
const W = 520;
const ROW = 34;
const WINDOW = 1200;

export function LiveScope() {
  const sim = useMemo(() => new Simulator(buildJKCounter(DEFAULT_JK_CONFIG)), []);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) {
      for (let i = 0; i < 10; i++) sim.stepClock();
      setTick((t) => t + 1);
      return;
    }
    for (let i = 0; i < 3; i++) sim.stepClock();
    setTick((t) => t + 1);
  }, [sim]);
  useEffect(() => {
    if (paused || reduce.current) return;
    const id = setInterval(() => {
      sim.stepClock();
      setTick((t) => t + 1);
    }, 700);
    return () => clearInterval(id);
  }, [sim, paused]);
  const t1 = Math.max(sim.time, WINDOW);
  const t0 = t1 - WINDOW;
  const x = (t: number) => ((t - t0) / WINDOW) * W;
  const path = (tr: TracePoint[], row: number) => {
    const yH = row * ROW + 8;
    const yL = row * ROW + ROW - 8;
    let d = "";
    let prev: L | null = null;
    const pts = tr.filter((p, i) => !(tr[i + 1] && tr[i + 1].t === p.t));
    let start: L = 2;
    for (const p of pts) if (p.t <= t0) start = p.v;
    prev = start;
    d = `M0 ${prev === 1 ? yH : yL}`;
    for (const p of pts) {
      if (p.t <= t0) continue;
      const xx = x(p.t);
      d += ` H${xx} V${p.v === 1 ? yH : yL}`;
      prev = p.v;
    }
    d += ` H${W}`;
    return d;
  };
  const rows: { name: string; net: string; color: string }[] = [
    { name: "CP", net: "CLK", color: "var(--amber)" },
    { name: "Q0", net: "Q0", color: "var(--sig-1)" },
    { name: "Q1", net: "Q1", color: "var(--sig-1)" },
    { name: "Q2", net: "Q2", color: "var(--sig-1)" },
    { name: "C", net: "C", color: "var(--sig-z)" },
  ];
  const bit = (n: string) => sim.netValue(n);
  const state = [bit("Q2"), bit("Q1"), bit("Q0")].map((v) => (v === 1 ? "1" : v === 0 ? "0" : "X")).join("");
  const num = parseInt(state, 2);
  return (
    <div className="card overflow-hidden relative">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line">
        <span className="w-2 h-2 rounded-full bg-accent" style={{ animation: paused ? undefined : "pulse-ring 1.4s infinite" }} />
        <span className="eyebrow">实时仿真 · 实验 A</span>
        <span className="text-[11px] text-muted ml-auto hidden sm:inline">每个跳变都由引擎计算，不是动画</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setPaused((p) => !p)} aria-label={paused ? "继续" : "暂停"}>
          {paused ? "▶" : "❚❚"}
        </button>
      </div>
      <div className="grid grid-cols-[46px_1fr]">
        <div className="border-r border-line">
          {rows.map((r) => (
            <div key={r.name} className="mono text-xs flex items-center justify-center" style={{ height: ROW, color: r.color }}>
              {r.name}
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${rows.length * ROW}`} preserveAspectRatio="none" className="w-full block bg-grid" style={{ height: rows.length * ROW }} aria-label="三位计数器实时波形">
          {Array.from({ length: 13 }, (_, i) => {
            const t = Math.ceil(t0 / 100) * 100 + i * 100;
            return <line key={i} x1={x(t)} x2={x(t)} y1={0} y2={rows.length * ROW} stroke="var(--grid)" />;
          })}
          {rows.map((r, i) => (
            <path key={r.name} d={path(sim.trace(r.net), i)} fill="none" stroke={r.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="flex items-end gap-5 px-4 py-3 border-t border-line">
        <div>
          <div className="text-[10px] text-muted">Q2 Q1 Q0</div>
          <div className="mono text-3xl font-bold tracking-[0.3em] text-amber leading-none mt-1">{state}</div>
        </div>
        <div className="flex gap-1.5 pb-1" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full border ${i === num ? "bg-amber border-amber" : i < num ? "border-accent bg-[var(--accent-soft)]" : "border-line-2"}`} />
          ))}
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] text-muted">十进制</div>
          <div className="mono text-xl font-bold">{isNaN(num) ? "—" : num}</div>
        </div>
      </div>
    </div>
  );
}
