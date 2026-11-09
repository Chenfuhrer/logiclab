"use client";

import { useMemo, useState } from "react";
import { buildCounterNetlist, decodeState, designError, loadValue, verifyCounter, type CounterDesign, type CounterMethod } from "@/lib/counters/ls161";
import { useSimulation } from "@/hooks/useSimulation";
import { Schematic } from "@/components/circuit/Schematic";
import { Waveform, busFromBits, type Channel } from "@/components/waveform/Waveform";
import { Tex } from "@/components/ui/Tex";
import { IssueList } from "./IssueList";
import { Readout } from "./JKCounterLab";
import type { L } from "@/lib/sim/types";

const METHOD_TEXT: Record<CounterMethod, string> = {
  clear: "清零法",
  "sync-load": "同步置数法（置 M）",
  "carry-load": "进位输出置数法",
};

export function LS161Lab() {
  const [d, setD] = useState<CounterDesign>({ N: 10, method: "clear", chips: 1, preset: 0, part: "ls161" });
  const [model, setModel] = useState<"ideal" | "delay">("ideal");
  const err = designError(d);
  const netlist = useMemo(() => (err ? null : buildCounterNetlist(d)), [d, err]);
  const verification = useMemo(() => (err ? null : verifyCounter(d, d.chips === 2 ? 300 : 120)), [d, err]);
  const { sim, version, step, run, stop, running } = useSimulation(netlist, { model });
  void version;
  const W = d.chips * 4;
  const bus = (): number | null => {
    if (!sim) return null;
    let v = 0;
    for (let b = 0; b < W; b++) {
      const x = sim.netValue(`Q${b}`) as L;
      if (x !== 0 && x !== 1) return null;
      v |= x << b;
    }
    return v;
  };
  const cur = bus();
  const dec = err ? null : decodeState(d);
  const lv = err ? 0 : loadValue(d);
  const part = d.part ?? "ls161";

  const channels: Channel[] = sim
    ? [
        { kind: "bit", name: "CP", points: sim.trace("CLK"), clock: true },
        ...Array.from({ length: Math.min(W, 4) }, (_, b) => ({ kind: "bit" as const, name: `Q${b}`, points: sim.trace(`Q${b}`) })),
        busFromBits(d.chips === 2 ? "Q7…Q0" : "Q3…Q0", Array.from({ length: W }, (_, b) => sim.trace(`Q${b}`)), 10),
        ...(sim.hasNet("FB") ? [{ kind: "bit" as const, name: d.method === "clear" ? "R̄D" : "L̄D", points: sim.trace("FB") }] : []),
      ]
    : [];
  const set = (patch: Partial<CounterDesign>) => {
    stop();
    setD((x) => ({ ...x, ...patch }));
  };
  const maxN = d.chips === 1 ? 16 : 256;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="card p-4 space-y-4 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs text-muted space-y-1">
            <span>目标模数 N</span>
            <input className="input mono w-full" type="number" min={2} max={maxN} value={d.N} onChange={(e) => set({ N: Number(e.target.value) })} aria-label="目标模数 N" />
          </label>
          <label className="text-xs text-muted space-y-1">
            <span>方法</span>
            <select className="select w-full" value={d.method} onChange={(e) => set({ method: e.target.value as CounterMethod })} aria-label="设计方法">
              <option value="clear">清零法</option>
              <option value="sync-load">同步置数法</option>
              <option value="carry-load" disabled={d.chips === 2}>
                进位输出置数法
              </option>
            </select>
          </label>
          <label className="text-xs text-muted space-y-1">
            <span>器件</span>
            <select className="select w-full" value={part} onChange={(e) => set({ part: e.target.value as "ls161" | "ls163" })} aria-label="器件型号">
              <option value="ls161">74LS161（异步清零）</option>
              <option value="ls163">74LS163（同步清零）</option>
            </select>
          </label>
          <label className="text-xs text-muted space-y-1">
            <span>片数</span>
            <select className="select w-full" value={d.chips} onChange={(e) => set({ chips: Number(e.target.value) as 1 | 2, method: d.method === "carry-load" ? "clear" : d.method })} aria-label="片数">
              <option value={1}>1 片（N ≤ 16）</option>
              <option value={2}>2 片同步级联（N ≤ 256）</option>
            </select>
          </label>
          {d.method === "sync-load" && (
            <label className="text-xs text-muted space-y-1">
              <span>预置数 M</span>
              <input className="input mono w-full" type="number" min={0} max={maxN - 1} value={d.preset ?? 0} onChange={(e) => set({ preset: Number(e.target.value) })} aria-label="预置数 M" />
            </label>
          )}
          <label className="text-xs text-muted space-y-1">
            <span>仿真模型</span>
            <select className="select w-full" value={model} onChange={(e) => setModel(e.target.value as "ideal" | "delay")} aria-label="仿真模型">
              <option value="ideal">A/B 理想（零延迟）</option>
              <option value="delay">C 传输延迟</option>
            </select>
          </label>
        </div>
        {err ? (
          <p className="text-sm text-danger">{err}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <button className="btn btn-primary" onClick={() => step(1)} disabled={running}>
                单步 CP
              </button>
              {running ? (
                <button className="btn" onClick={stop}>
                  暂停
                </button>
              ) : (
                <button className="btn" onClick={() => run(400)}>
                  连续运行
                </button>
              )}
              <button className="btn" onClick={() => set({})}>
                重置
              </button>
              <span className="text-xs text-muted ml-auto">点击芯片引脚查看功能与有效电平</span>
            </div>
            <div className="card-inset overflow-hidden">{netlist && <Schematic netlist={netlist} values={sim?.valuesById()} className="h-[300px] sm:h-[340px]" />}</div>
            <div className="grid grid-cols-3 gap-3">
              <Readout label="当前计数（十进制）" value={cur === null ? "X" : String(cur)} tone="amber" />
              <Readout label="二进制" value={cur === null ? "X" : cur.toString(2).padStart(W, "0")} />
              <Readout label="时钟数" value={String(sim?.steps ?? 0)} />
            </div>
            {sim && <IssueList issues={sim.issues} />}
          </>
        )}
      </section>

      <section className="space-y-4 min-w-0">
        {!err && <Waveform channels={channels} t1={Math.max(sim?.time ?? 0, d.N * 100 + 200)} title={`时序波形 · ${model === "ideal" ? "理想模型（瞬态显示为琥珀色零宽标记）" : "传输延迟模型（门 10 ns，计数器 20 ns，教学示意值）"}`} />}
        {verification && (
          <div className="card p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="eyebrow">仿真验证</div>
              <span className={`chip ${verification.ok ? "chip-accent" : "chip-danger"}`}>{verification.ok ? `实测模数 ${verification.modulus} = 目标 N` : `实测模数 ${verification.modulus} ≠ 目标 ${d.N}`}</span>
              <span className={`chip ${verification.selfStart.every((s) => s.entersCycle) ? "chip-accent" : "chip-danger"}`}>{verification.selfStart.every((s) => s.entersCycle) ? "所有上电状态都能进入主循环" : "存在无法进入主循环的上电状态"}</span>
            </div>
            <p className="mono text-xs break-all leading-relaxed">稳定循环：{verification.cycle.join(" → ")} → {verification.cycle[0]}</p>
            {verification.transients.length > 0 && (
              <p className="text-xs text-amber leading-relaxed">
                瞬态状态：{verification.transients.join("、")}。它们在清零信号生效前只存在极短时间（理想模型中为同一时刻内的事件序列，不占时钟周期），因此不计入模数。
              </p>
            )}
            <p className="text-xs text-muted">验证方式：把网表交给仿真引擎逐拍运行，记录每个时钟周期结束时的稳定状态，找出循环并测量其长度；不根据 N 推断“应该正确”。</p>
          </div>
        )}
        {!err && (
          <div className="card p-4 text-sm leading-relaxed space-y-2">
            <div className="eyebrow">设计说明 · {METHOD_TEXT[d.method]}</div>
            {d.method === "clear" && part === "ls161" && (
              <p>
                74LS161 的 <Tex>{"\\overline{R_D}"}</Tex> 是<strong>异步</strong>清零：一旦为 0 立即清零，不等时钟。所以要计 0～{d.N - 1}，必须译码<strong>状态 {d.N}</strong>
                {dec !== null && <>（{dec.toString(2).padStart(W, "0")}，把为 1 的位接与非门）</>}。状态 {d.N} 一出现就被清掉，只是一个瞬态。
              </p>
            )}
            {d.method === "clear" && part === "ls163" && (
              <p>
                74LS163 的清零端是<strong>同步</strong>的：清零条件要等下一个上升沿才生效。所以译码<strong>状态 {d.N - 1}</strong>，下一拍回到 0，没有瞬态。
              </p>
            )}
            {d.method === "sync-load" && (
              <p>
                <Tex>{"\\overline{LD}"}</Tex> 是<strong>同步</strong>置数：条件满足后要等下一个上升沿才把 D 端的数 M={d.preset ?? 0} 装入。因此译码<strong>状态 M+N−1 = {dec ?? "—"}</strong>，循环为 {d.preset ?? 0}～{(d.preset ?? 0) + d.N - 1}，无瞬态。置数优先于计数使能 EP、ET。
              </p>
            )}
            {d.method === "carry-load" && (
              <p>
                计到 1111 时进位 C=1，令 <Tex>{"\\overline{LD} = \\overline{C}"}</Tex>，D = 16 − N = {lv}（{lv.toString(2).padStart(4, "0")}）。循环为 {lv}～15，共 {d.N} 个状态。
              </p>
            )}
            {d.chips === 2 && (
              <p className="text-ink-2">
                级联：低位片 EP=ET=1；高位片 EP=ET=低位片的进位 C。两片共用 CP，属于同步级联——高位片只在低位片为 1111 时的那个上升沿加 1。
              </p>
            )}
            <p className="text-xs text-muted">74LS161 没有独立的同步清零引脚；若需要同步清零，请选择 74LS163。引脚功能依据 TI SN74LS161A/163A 功能表。</p>
          </div>
        )}
      </section>
    </div>
  );
}
