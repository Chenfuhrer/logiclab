import type { Expr } from "../logic/ast";
import type { ComponentInstance, Net, Netlist } from "../sim/types";
import { Simulator } from "../sim/engine";
import { FF_PINS, type SyncCircuit } from "./analyze";
import type { Bit, StateTableSpec } from "./design";
import { runStateTable } from "./design";

/**
 * 由同步电路的方程生成门级网表（与门/或门/非门 + 触发器），用于画逻辑图和仿真验证。
 * 相同的子表达式共用一个门。
 */
export function circuitToNetlist(c: SyncCircuit, opts: { init?: number; name?: string } = {}): Netlist {
  const comps: ComponentInstance[] = [];
  const eps = new Map<string, { comp: string; pin: string }[]>();
  const add = (net: string, comp: string, pin: string) => eps.set(net, [...(eps.get(net) ?? []), { comp, pin }]);
  const n = c.ffs.length;
  const stateNames = new Set(c.ffs.map((f) => f.name));
  comps.push({ id: "CLK", type: "clock", label: "CP", params: { period: 100 }, x: 30, y: 60 + n * 110 });
  add("CLK", "CLK", "CLK");
  c.inputs.forEach((name, i) => {
    comps.push({ id: `SW_${name}`, type: "switch", label: name, x: 30, y: 40 + i * 70 });
    add(name, `SW_${name}`, "Y");
  });
  const gateLevel = new Map<string, number>();
  const cache = new Map<string, string>();
  let gid = 0;
  const pending: { id: string; level: number }[] = [];
  const build = (e: Expr): { net: string; level: number } => {
    if (e.k === "var") return { net: e.name, level: 0 };
    if (e.k === "const") {
      const net = e.v ? "VCC" : "GND";
      if (!comps.find((x) => x.id === net)) {
        comps.push({ id: net, type: e.v ? "const1" : "const0", label: String(e.v), x: 30, y: 0 });
      }
      if (!eps.get(net)?.some((p) => p.comp === net)) add(net, net, "Y");
      return { net, level: 0 };
    }
    if (e.k === "not" && e.e.k === "var" && stateNames.has(e.e.name)) return { net: `${e.e.name}_N`, level: 0 };
    const key = JSON.stringify(e);
    const hit = cache.get(key);
    if (hit) return { net: hit, level: gateLevel.get(hit)! };
    let type: string;
    let kids: Expr[];
    switch (e.k) {
      case "not":
        type = "not";
        kids = [e.e];
        break;
      case "and":
        type = "and";
        kids = e.es;
        break;
      case "or":
        type = "or";
        kids = e.es;
        break;
      case "xor":
        type = "xor";
        kids = [e.a, e.b];
        break;
      case "xnor":
        type = "xnor";
        kids = [e.a, e.b];
        break;
    }
    const ins = kids.map(build);
    const level = Math.max(0, ...ins.map((x) => x.level)) + 1;
    const id = `G${++gid}`;
    const net = `N_${id}`;
    comps.push({ id, type, label: id, params: type === "not" ? {} : { inputs: kids.length }, x: 0, y: 0 });
    ins.forEach((x, i) => add(x.net, id, type === "not" ? "A" : `I${i}`));
    add(net, id, "Y");
    cache.set(key, net);
    gateLevel.set(net, level);
    pending.push({ id, level });
    return { net, level };
  };
  const ffIds: string[] = [];
  c.ffs.forEach((ff, i) => {
    const id = `FF_${ff.name}`;
    ffIds.push(id);
    const bit = opts.init === undefined ? 0 : (opts.init >> (n - 1 - i)) & 1;
    comps.push({ id, type: `${ff.type.toLowerCase()}ff`, label: ff.name, params: { edge: ff.edge, init: bit }, x: 0, y: 30 + i * 110 });
    add("CLK", id, "CLK");
    add(ff.name, id, "Q");
    add(`${ff.name}_N`, id, "QN");
  });
  c.ffs.forEach((ff) => {
    for (const p of FF_PINS[ff.type]) add(build(ff.inputs[p]!).net, `FF_${ff.name}`, p);
  });
  // 每个输出经一个缓冲器得到独立网络，避免与其他输出、状态变量或输入共用网络名
  const outNets = c.outputs.map((o) => {
    const r = build(o.expr);
    const id = `BUF_${o.name}`;
    comps.push({ id, type: "buf", label: o.name, x: 0, y: 0 });
    add(r.net, id, "A");
    const net = `OUT_NET_${o.name}`;
    add(net, id, "Y");
    pending.push({ id, level: r.level + 1 });
    return { name: o.name, net };
  });
  // 布局：门按逻辑级数分列，触发器在最右侧
  const maxLevel = Math.max(0, ...pending.map((p) => p.level));
  const perLevel = new Map<number, number>();
  for (const p of pending) {
    const k = perLevel.get(p.level) ?? 0;
    perLevel.set(p.level, k + 1);
    const comp = comps.find((x) => x.id === p.id)!;
    comp.x = 140 + (p.level - 1) * 120;
    comp.y = 20 + k * 70;
  }
  const ffX = 140 + maxLevel * 120 + 60;
  ffIds.forEach((id) => (comps.find((x) => x.id === id)!.x = ffX));
  const consts = comps.filter((x) => x.type === "const0" || x.type === "const1");
  consts.forEach((x, i) => {
    x.y = 40 + (c.inputs.length + i) * 60;
  });
  c.ffs.forEach((ff, i) => {
    comps.push({ id: `P_${ff.name}`, type: "probe", label: ff.name, x: ffX + 130, y: 30 + i * 110 });
    add(ff.name, `P_${ff.name}`, "A");
  });
  outNets.forEach((o, i) => {
    comps.push({ id: `OUT_${o.name}`, type: "probe", label: o.name, x: ffX + 210, y: 30 + i * 60 });
    add(o.net, `OUT_${o.name}`, "A");
  });
  const nets: Net[] = [...eps.entries()].filter(([, e]) => e.length > 1).map(([name, e]) => ({ id: name, name: outNets.find((o) => o.net === name)?.name ?? name, endpoints: e }));
  return { version: 1, name: opts.name ?? "同步时序电路", components: comps, nets };
}

export interface SimCheck {
  inputs: number[];
  expectedStates: number[];
  actualStates: (number | null)[];
  expectedOut: Bit[][];
  actualOut: (Bit | null)[][];
  ok: boolean;
  firstMismatch: number;
  netlist: Netlist;
  sim: Simulator;
}

/** 用仿真引擎运行综合出的电路，与原始状态表逐拍比对 */
export function simulateDesign(spec: StateTableSpec, circuit: SyncCircuit, codes: number[], inputs: number[]): SimCheck {
  const start = spec.initial ?? 0;
  const netlist = circuitToNetlist(circuit, { init: codes[start], name: "设计结果" });
  const sim = new Simulator(netlist);
  const n = circuit.ffs.length;
  const k = circuit.inputs.length;
  const readState = () => {
    let v = 0;
    for (const ff of circuit.ffs) {
      const x = sim.netValue(ff.name);
      if (x !== 0 && x !== 1) return null;
      v = (v << 1) | x;
    }
    return v;
  };
  const ref = runStateTable(spec, inputs, start);
  const actualStates: (number | null)[] = [readState()];
  const actualOut: (Bit | null)[][] = [];
  for (const x of inputs) {
    circuit.inputs.forEach((name, i) => sim.setInput(`SW_${name}`, ((x >> (k - 1 - i)) & 1) as Bit));
    // 有效沿到来之前读输出（Mealy 输出取决于本拍输入与现态）
    actualOut.push(
      circuit.outputs.map((o) => {
        const v = sim.netValue(o.name);
        return v === 0 || v === 1 ? v : null;
      }),
    );
    sim.stepClock("CLK");
    actualStates.push(readState());
  }
  const expectedStates = ref.states.map((s) => codes[s]);
  let firstMismatch = -1;
  for (let i = 0; i < inputs.length; i++) {
    const outOk = ref.outputs[i].every((o, j) => actualOut[i][j] === o);
    if (actualStates[i + 1] !== expectedStates[i + 1] || !outOk) {
      firstMismatch = i;
      break;
    }
  }
  void n;
  return { inputs, expectedStates, actualStates, expectedOut: ref.outputs, actualOut, ok: firstMismatch < 0, firstMismatch, netlist, sim };
}

/** 组合逻辑表达式 → 门级网表（输入开关、门、输出探针），用于“表达式 ↔ 逻辑图” */
export function exprToNetlist(outputs: { name: string; expr: Expr }[], vars: string[]): Netlist {
  const comps: ComponentInstance[] = [];
  const eps = new Map<string, { comp: string; pin: string }[]>();
  const add = (net: string, comp: string, pin: string) => eps.set(net, [...(eps.get(net) ?? []), { comp, pin }]);
  vars.forEach((v, i) => {
    comps.push({ id: `SW_${v}`, type: "switch", label: v, x: 20, y: 30 + i * 60 });
    add(v, `SW_${v}`, "Y");
  });
  const cache = new Map<string, { net: string; level: number }>();
  const placed: { id: string; level: number }[] = [];
  let gid = 0;
  const build = (e: Expr): { net: string; level: number } => {
    if (e.k === "var") return { net: e.name, level: 0 };
    if (e.k === "const") {
      const id = e.v ? "VCC" : "GND";
      if (!comps.find((c) => c.id === id)) {
        comps.push({ id, type: e.v ? "const1" : "const0", x: 20, y: 30 + vars.length * 60 + (e.v ? 0 : 40) });
        add(id, id, "Y");
      }
      return { net: id, level: 0 };
    }
    const key = JSON.stringify(e);
    const hit = cache.get(key);
    if (hit) return hit;
    const map = { not: "not", and: "and", or: "or", xor: "xor", xnor: "xnor" } as const;
    const kids = e.k === "not" ? [e.e] : e.k === "and" || e.k === "or" ? e.es : [e.a, e.b];
    const ins = kids.map(build);
    const level = Math.max(0, ...ins.map((x) => x.level)) + 1;
    const id = `G${++gid}`;
    comps.push({ id, type: map[e.k], label: id, params: e.k === "not" ? {} : { inputs: kids.length }, x: 0, y: 0 });
    ins.forEach((x, i) => add(x.net, id, e.k === "not" ? "A" : `I${i}`));
    const net = `N_${id}`;
    add(net, id, "Y");
    placed.push({ id, level });
    const r = { net, level };
    cache.set(key, r);
    return r;
  };
  const outs = outputs.map((o, i) => {
    const r = build(o.expr);
    // 输出直接是输入变量/常量，或与前面的输出共用网络时，加缓冲器得到独立网络
    if (r.level === 0 || outputs.slice(0, i).some((p) => JSON.stringify(p.expr) === JSON.stringify(o.expr))) {
      const id = `BUF_${o.name}`;
      comps.push({ id, type: "buf", label: o.name, x: 0, y: 0 });
      add(r.net, id, "A");
      const net = `OUT_NET_${o.name}`;
      add(net, id, "Y");
      placed.push({ id, level: r.level + 1 });
      return { name: o.name, net, level: r.level + 1 };
    }
    return { name: o.name, ...r };
  });
  const counts = new Map<number, number>();
  for (const p of placed) {
    const k = counts.get(p.level) ?? 0;
    counts.set(p.level, k + 1);
    const c = comps.find((x) => x.id === p.id)!;
    c.x = 130 + (p.level - 1) * 120;
    c.y = 20 + k * 64;
  }
  const maxLevel = Math.max(0, ...placed.map((p) => p.level));
  outs.forEach((o, i) => {
    comps.push({ id: `OUT_${o.name}`, type: "probe", label: o.name, x: 140 + maxLevel * 120, y: 40 + i * 60 });
    add(o.net, `OUT_${o.name}`, "A");
  });
  const nets: Net[] = [...eps.entries()].filter(([, e]) => e.length > 1).map(([id, e]) => ({ id, name: outs.find((o) => o.net === id)?.name ?? id, endpoints: e }));
  return { version: 1, name: "逻辑图", components: comps, nets };
}
