import { Simulator } from "../sim/engine";
import type { ComponentInstance, L, Net, Netlist } from "../sim/types";

/**
 * 74LS161 任意进制计数器设计 + 仿真验证。
 *
 * 方法：
 *  - clear（清零法）：74LS161 译码状态 N 接 \overline{R_D}。状态 N 只出现一个极短的瞬态（理想模型中为同一时刻内的
 *    delta 事件序列），稳定循环为 0～N-1。缺点：依赖瞬态脉冲，清零可靠性差。
 *  - sync-load（同步置数法）：译码状态 M+N-1 接 \overline{LD}，D3～D0 = M（预置数，默认 0）。下一个时钟上升沿装入 M，
 *    没有瞬态状态。
 *  - carry-load（进位置数法）：\overline{LD} = \overline{C}，D = 16-N（单片）。计到 1111 时 C=1，下一沿装入 16-N。
 * 两片级联（同步级联）：低位片 EP=ET=1，高位片 EP=ET=C_低位；两片共用时钟。整体反馈由译码电路统一控制。
 *
 * 正确性只以仿真结果为准：verifyCounter 实际运行电路，测出稳定循环的长度（实际模数），再与目标 N 比较。
 */
/** clear：清零法（74LS161 为异步清零，译码 N；74LS163 为同步清零，译码 N-1） */
export type CounterMethod = "clear" | "sync-load" | "carry-load";

export interface CounterDesign {
  N: number;
  method: CounterMethod;
  chips: 1 | 2;
  /** 同步置数法的预置数 M（默认 0） */
  preset?: number;
  /** 计数器型号（161 异步清零 / 163 同步清零） */
  part?: "ls161" | "ls163";
}

export function designError(d: CounterDesign): string | null {
  const max = d.chips === 1 ? 16 : 256;
  if (!Number.isInteger(d.N) || d.N < 2 || d.N > max) return `模数 N 应为 2～${max} 的整数`;
  const M = d.preset ?? 0;
  if (d.method === "sync-load" && (M < 0 || M + d.N - 1 > max - 1)) return `预置数 M=${M} 时最大状态 M+N-1=${M + d.N - 1} 超出 ${max - 1}`;
  return null;
}

/** 反馈译码的状态值；null 表示不需要反馈（N=16 或 256 的自然计数） */
export function decodeState(d: CounterDesign): number | null {
  const max = d.chips === 1 ? 16 : 256;
  if (d.method === "clear") return d.N === max ? null : (d.part ?? "ls161") === "ls163" ? d.N - 1 : d.N;
  if (d.method === "sync-load") return d.N === max && (d.preset ?? 0) === 0 ? null : (d.preset ?? 0) + d.N - 1;
  return null;
}

export function loadValue(d: CounterDesign): number {
  const max = d.chips === 1 ? 16 : 256;
  if (d.method === "carry-load") return max - d.N;
  return d.preset ?? 0;
}

const bitsOn = (x: number, w: number) => Array.from({ length: w }, (_, i) => i).filter((i) => (x >> i) & 1);

export function buildCounterNetlist(d: CounterDesign): Netlist {
  const err = designError(d);
  if (err) throw new Error(err);
  const part = d.part ?? "ls161";
  const comps: ComponentInstance[] = [];
  const nets: Net[] = [];
  const W = d.chips * 4;
  const chipIds = d.chips === 1 ? ["U1"] : ["U1", "U2"];
  comps.push({ id: "CLK", type: "clock", label: "CP", params: { period: 100 }, x: 40, y: 200 });
  comps.push({ id: "VCC", type: "const1", label: "1", x: 40, y: 80 });
  comps.push({ id: "GND", type: "const0", label: "0", x: 40, y: 140 });
  chipIds.forEach((id, ci) => comps.push({ id, type: part, label: `${id}（${part === "ls161" ? "74LS161" : "74LS163"}${d.chips === 2 ? (ci === 0 ? "，低位" : "，高位") : ""}）`, params: { init: 0 }, x: 260 + ci * 300, y: 60 }));
  const net = (id: string, name: string | undefined, eps: [string, string][]) => nets.push({ id, name, endpoints: eps.map(([comp, pin]) => ({ comp, pin })) });
  net("n_clk", "CLK", [["CLK", "CLK"], ...chipIds.map((c) => [c, "CLK"] as [string, string])]);
  // 输出位
  for (let b = 0; b < W; b++) {
    comps.push({ id: `P${b}`, type: "probe", label: `Q${b}`, x: 260 + (b >> 2) * 300 + 200, y: 50 + (b % 4) * 42 });
  }
  const qEps: [string, string][][] = Array.from({ length: W }, (_, b) => [[chipIds[b >> 2], `Q${b % 4}`], [`P${b}`, "A"]]);
  // 使能
  const ones: [string, string][] = [["VCC", "Y"], [chipIds[0], "EP"], [chipIds[0], "ET"]];
  if (d.chips === 2) net("n_c0", "C1", [[chipIds[0], "C"], [chipIds[1], "EP"], [chipIds[1], "ET"]]);
  // 反馈
  const dec = decodeState(d);
  const lv = loadValue(d);
  let rdNet: [string, string][] = chipIds.map((c) => [c, "RD"] as [string, string]);
  let ldNet: [string, string][] = chipIds.map((c) => [c, "LD"] as [string, string]);
  const zeros: [string, string][] = [["GND", "Y"]];
  // 预置数输入
  const dataOnes: [string, string][] = [];
  for (let b = 0; b < W; b++) ((lv >> b) & 1 ? dataOnes : zeros).push([chipIds[b >> 2], `D${b % 4}`]);
  if (d.method === "clear") {
    ldNet.forEach((x) => ones.push(x));
    ldNet = [];
    if (dec !== null) {
      const on = bitsOn(dec, W);
      if (on.length === 1) {
        comps.push({ id: "G1", type: "not", label: "G1", x: 160, y: 320 });
        qEps[on[0]].push(["G1", "A"]);
        net("n_fb", "FB", [["G1", "Y"], ...rdNet]);
      } else if (on.length === 0) {
        throw new Error("清零译码状态不能为 0");
      } else {
        comps.push({ id: "G1", type: "nand", label: "G1", params: { inputs: on.length }, x: 160, y: 320 });
        on.forEach((b, i) => qEps[b].push(["G1", `I${i}`]));
        net("n_fb", "FB", [["G1", "Y"], ...rdNet]);
      }
    } else rdNet.forEach((x) => ones.push(x));
    rdNet = [];
  } else {
    rdNet.forEach((x) => ones.push(x));
    rdNet = [];
    if (d.method === "carry-load") {
      const lastC: [string, string] = [chipIds[chipIds.length - 1], "C"];
      comps.push({ id: "G1", type: "not", label: "G1", x: 160, y: 320 });
      net("n_carry", "CO", [lastC, ["G1", "A"]]);
      net("n_fb", "FB", [["G1", "Y"], ...ldNet]);
    } else if (dec !== null) {
      const on = bitsOn(dec, W);
      if (on.length === 0) {
        // 译码状态 0：用全部反变量的与非 → 这里用或门（Q 全 0 时输出 0）
        comps.push({ id: "G1", type: "or", label: "G1", params: { inputs: W }, x: 160, y: 320 });
        for (let b = 0; b < W; b++) qEps[b].push(["G1", `I${b}`]);
      } else if (on.length === 1) {
        comps.push({ id: "G1", type: "not", label: "G1", x: 160, y: 320 });
        qEps[on[0]].push(["G1", "A"]);
      } else {
        comps.push({ id: "G1", type: "nand", label: "G1", params: { inputs: on.length }, x: 160, y: 320 });
        on.forEach((b, i) => qEps[b].push(["G1", `I${i}`]));
      }
      net("n_fb", "FB", [["G1", "Y"], ...ldNet]);
    } else ldNet.forEach((x) => ones.push(x));
    ldNet = [];
  }
  ones.push(...dataOnes);
  net("n_vcc", "VCC", ones);
  if (zeros.length > 1) net("n_gnd", "GND", zeros);
  qEps.forEach((eps, b) => net(`n_q${b}`, `Q${b}`, eps));
  return { version: 1, name: `74LS161 ${d.N} 进制计数器`, components: comps, nets };
}

export interface CounterVerification {
  /** 每个时钟周期结束时的稳定状态（从初始状态开始） */
  stable: number[];
  /** 稳定循环 */
  cycle: number[];
  modulus: number;
  ok: boolean;
  /** 出现过的瞬态状态（零延迟模型：同一时刻内被立即清除的状态） */
  transients: number[];
  /** 从每个可能的上电状态出发能否进入主循环 */
  selfStart: { start: number; entersCycle: boolean; steps: number }[];
  issues: string[];
}

function readBus(sim: Simulator, W: number): number | null {
  let v = 0;
  for (let b = 0; b < W; b++) {
    const x = sim.netValue(`Q${b}`) as L;
    if (x !== 0 && x !== 1) return null;
    v |= x << b;
  }
  return v;
}

/** 在一个时钟周期内出现过的全部总线取值（按事件先后），用于发现瞬态 */
function busEvents(sim: Simulator, W: number, from: number): number[] {
  const evs: { t: number; d: number }[] = [];
  for (let b = 0; b < W; b++) for (const p of sim.trace(`Q${b}`)) if (p.t > from || (p.t === from && p.d > 0)) evs.push({ t: p.t, d: p.d });
  evs.sort((a, b) => a.t - b.t || a.d - b.d);
  const uniq = evs.filter((e, i) => i === 0 || e.t !== evs[i - 1].t || e.d !== evs[i - 1].d);
  return uniq.map((e) => {
    let v = 0;
    for (let b = 0; b < W; b++) {
      const tr = sim.trace(`Q${b}`);
      let val: L = 2;
      for (const p of tr) if (p.t < e.t || (p.t === e.t && p.d <= e.d)) val = p.v;
      v |= (val === 1 ? 1 : 0) << b;
    }
    return v;
  });
}

export function verifyCounter(d: CounterDesign, maxClocks = 600): CounterVerification {
  const nl = buildCounterNetlist(d);
  const W = d.chips * 4;
  const startState = d.method === "carry-load" ? loadValue(d) : d.method === "sync-load" ? (d.preset ?? 0) : 0;
  const run = (start: number) => {
    const comps = nl.components.map((c) => (c.type === "ls161" || c.type === "ls163" ? { ...c, params: { ...c.params, init: (start >> (c.id === "U2" ? 4 : 0)) & 15 } } : c));
    const sim = new Simulator({ ...nl, components: comps });
    const stable: number[] = [readBus(sim, W) ?? -1];
    const transients = new Set<number>();
    for (let i = 0; i < maxClocks; i++) {
      const t0 = sim.time;
      sim.stepClock("CLK");
      const s = readBus(sim, W);
      for (const x of busEvents(sim, W, t0)) if (x !== s) transients.add(x);
      stable.push(s ?? -1);
      if (stable.indexOf(s ?? -1) < stable.length - 1) break;
    }
    return { stable, transients, issues: sim.issues };
  };
  const main = run(startState);
  const last = main.stable[main.stable.length - 1];
  const firstIdx = main.stable.indexOf(last);
  const cycle = main.stable.slice(firstIdx, main.stable.length - 1);
  const cycleSet = new Set(cycle);
  const selfStart: CounterVerification["selfStart"] = [];
  const total = 1 << W;
  // 两片时只抽查全部 256 个上电状态（每个最多 300 拍）
  for (let s = 0; s < total; s++) {
    if (cycleSet.has(s)) continue;
    const r = run(s);
    const idx = r.stable.findIndex((x) => cycleSet.has(x));
    selfStart.push({ start: s, entersCycle: idx >= 0, steps: idx });
  }
  return {
    stable: main.stable,
    cycle,
    modulus: cycle.length,
    ok: cycle.length === d.N,
    transients: [...main.transients].sort((a, b) => a - b),
    selfStart,
    issues: main.issues.filter((i) => i.level !== "info").map((i) => i.message),
  };
}
