import { type Expr, and, not, or, v, xor, C0 } from "../logic/ast";
import { evaluate, truthTable, minterms } from "../logic/truthtable";
import { minimizeSOP, solutionToSOP } from "../logic/qm";
import type { FFType } from "../sim/models";

/**
 * 同步时序电路的符号描述：一组受同一时钟控制的触发器 + 组合逻辑（布尔表达式）。
 * 这是"状态机分析器"的输入，与电路编辑器无关；extract.ts 负责从网表得到它。
 */
export interface FFSpec {
  /** 状态变量名，例如 Q0 */
  name: string;
  type: FFType;
  edge: "rising" | "falling";
  /** 驱动方程：D / J,K / T / S,R 关于输入变量与状态变量的表达式 */
  inputs: Partial<Record<"D" | "J" | "K" | "T" | "S" | "R", Expr>>;
}

export interface SyncCircuit {
  /** 外部输入变量名（例如 X） */
  inputs: string[];
  /** 触发器，按状态编码从高位到低位排列（例如 Q2、Q1、Q0） */
  ffs: FFSpec[];
  outputs: { name: string; expr: Expr }[];
}

export const FF_PINS: Record<FFType, ("D" | "J" | "K" | "T" | "S" | "R")[]> = { D: ["D"], JK: ["J", "K"], T: ["T"], SR: ["S", "R"] };

/** 把驱动方程代入特性方程，得到次态的表达式（未化简） */
export function stateEquationRaw(ff: FFSpec): Expr {
  const q = v(ff.name);
  const g = (p: keyof FFSpec["inputs"]) => {
    const e = ff.inputs[p];
    if (!e) throw new Error(`${ff.name} 的 ${p} 端没有驱动方程`);
    return e;
  };
  switch (ff.type) {
    case "D":
      return g("D");
    case "T":
      return xor(g("T"), q);
    case "JK":
      return or(and(g("J"), not(q)), and(not(g("K")), q));
    case "SR":
      return or(g("S"), and(not(g("R")), q));
  }
}

export interface TransitionRow {
  /** 当前状态编码（高位在前，对应 ffs 顺序） */
  state: number;
  /** 输入组合编码（inputs[0] 为最高位） */
  input: number;
  next: number;
  /** 各输出的取值 */
  outputs: (0 | 1)[];
  /** 各触发器驱动端取值，例如 { J0: 1, K0: 1 } */
  drives: Record<string, 0 | 1>;
  /** 违反约束（SR=1）的触发器 */
  violations: string[];
}

export interface SelfStartReport {
  /** 合法状态（主循环） */
  legal: number[];
  unused: number[];
  /** 从初始状态可达的状态 */
  reachable: number[];
  unreachable: number[];
  /** 全部循环（无输入时） */
  cycles: number[][];
  /** 每个无效状态的结论 */
  details: { state: number; verdict: "always" | "some" | "never"; path?: number[] }[];
  selfStarting: boolean;
  /** 不进入主循环的无效循环 */
  invalidCycles: number[][];
}

export interface Analysis {
  circuit: SyncCircuit;
  stateVars: string[];
  nStates: number;
  nInputs: number;
  /** 状态方程变量序：输入在前，状态变量（高位在前）在后 */
  vars: string[];
  stateEqs: { name: string; raw: Expr; simplified: Expr }[];
  outputEqs: { name: string; expr: Expr; simplified: Expr }[];
  kind: "moore" | "mealy" | "none";
  rows: TransitionRow[];
  selfStart: SelfStartReport;
  initial: number;
  sequence: number[];
}

export const stateBits = (s: number, n: number) => Array.from({ length: n }, (_, i) => (s >> (n - 1 - i)) & 1).join("");

function simplify(e: Expr, vars: string[]): Expr {
  if (vars.length > 10) return e;
  const t = truthTable(e, vars);
  const res = minimizeSOP(vars.length, minterms(t), [], vars);
  return res.ones.length === 0 ? C0 : solutionToSOP(res);
}

export function analyzeSync(circuit: SyncCircuit, initial = 0): Analysis {
  const n = circuit.ffs.length;
  if (n === 0) throw new Error("电路中没有触发器");
  if (n > 8) throw new Error("状态变量超过 8 个，不做符号分析");
  const k = circuit.inputs.length;
  if (k > 4) throw new Error("外部输入超过 4 个，不做符号分析");
  const stateVars = circuit.ffs.map((f) => f.name);
  const vars = [...circuit.inputs, ...stateVars];
  const stateEqs = circuit.ffs.map((ff) => {
    const raw = stateEquationRaw(ff);
    return { name: ff.name, raw, simplified: simplify(raw, vars) };
  });
  const outputEqs = circuit.outputs.map((o) => ({ name: o.name, expr: o.expr, simplified: simplify(o.expr, vars) }));
  const dependsOnInput = circuit.outputs.some((o) => {
    // 输出是否真正依赖输入（按真值表判断，而不是看表达式里是否出现）
    for (let s = 0; s < 1 << n; s++) {
      let first: number | null = null;
      for (let x = 0; x < 1 << k; x++) {
        const val = evaluate(o.expr, envOf(circuit, s, x));
        if (first === null) first = val;
        else if (val !== first) return true;
      }
    }
    return false;
  });
  const kind = circuit.outputs.length === 0 ? "none" : dependsOnInput ? "mealy" : "moore";

  const rows: TransitionRow[] = [];
  for (let s = 0; s < 1 << n; s++)
    for (let x = 0; x < 1 << k; x++) {
      const env = envOf(circuit, s, x);
      const drives: Record<string, 0 | 1> = {};
      const violations: string[] = [];
      let next = 0;
      circuit.ffs.forEach((ff, i) => {
        for (const p of FF_PINS[ff.type]) drives[`${p}_${ff.name}`] = evaluate(ff.inputs[p]!, env);
        if (ff.type === "SR" && drives[`S_${ff.name}`] && drives[`R_${ff.name}`]) violations.push(ff.name);
        const bit = evaluate(stateEqs[i].raw, env);
        next |= bit << (n - 1 - i);
      });
      rows.push({ state: s, input: x, next, outputs: circuit.outputs.map((o) => evaluate(o.expr, env)), drives, violations });
    }
  const selfStart = selfStartCheck(rows, n, k, initial);
  // 无输入时的计数序列
  const sequence: number[] = [];
  if (k === 0) {
    const seen = new Set<number>();
    let s = initial;
    while (!seen.has(s)) {
      seen.add(s);
      sequence.push(s);
      s = rows[s].next;
    }
    sequence.push(s);
  }
  return { circuit, stateVars, nStates: 1 << n, nInputs: k, vars, stateEqs, outputEqs, kind, rows, selfStart, initial, sequence };
}

function envOf(c: SyncCircuit, s: number, x: number): Record<string, 0 | 1> {
  const n = c.ffs.length;
  const k = c.inputs.length;
  const env: Record<string, 0 | 1> = {};
  c.ffs.forEach((ff, i) => (env[ff.name] = ((s >> (n - 1 - i)) & 1) as 0 | 1));
  c.inputs.forEach((name, i) => (env[name] = ((x >> (k - 1 - i)) & 1) as 0 | 1));
  return env;
}

/**
 * 自启动检查。
 *  - 无输入：状态转移是函数图。合法状态 = 从初始状态出发最终进入的循环（主循环）。
 *    无效状态若沿转移最终进入主循环则可自启动；若落入另一个循环（无效循环）则不能。
 *  - 有输入：合法状态 = 从初始状态在任意输入下可达的闭包中的循环部分（这里取可达闭包）。
 *    对每个无效状态计算：
 *      always —— 无论输入如何都终将进入合法集合（最小不动点 W = legal ∪ {s | ∀x δ(s,x)∈W}）；
 *      some   —— 存在输入序列可进入，但也存在把它困在无效状态中的输入序列；
 *      never  —— 任何输入都进不了合法集合。
 *    只有全部无效状态为 always 才判定为能自启动。
 */
export function selfStartCheck(rows: TransitionRow[], n: number, k: number, initial: number, legalOverride?: number[]): SelfStartReport {
  const N = 1 << n;
  const K = 1 << k;
  const delta = (s: number, x: number) => rows[s * K + x].next;
  // 可达集合
  const reach = new Set<number>([initial]);
  const stack = [initial];
  while (stack.length) {
    const s = stack.pop()!;
    for (let x = 0; x < K; x++) {
      const t = delta(s, x);
      if (!reach.has(t)) {
        reach.add(t);
        stack.push(t);
      }
    }
  }
  const cycles: number[][] = [];
  if (k === 0) {
    const color = new Array(N).fill(0);
    for (let s0 = 0; s0 < N; s0++) {
      if (color[s0]) continue;
      const path: number[] = [];
      let s = s0;
      while (color[s] === 0) {
        color[s] = 1;
        path.push(s);
        s = delta(s, 0);
      }
      if (color[s] === 1) {
        const i = path.indexOf(s);
        cycles.push(path.slice(i));
      }
      path.forEach((p) => (color[p] = 2));
    }
  }
  let legal: number[];
  if (legalOverride) legal = [...legalOverride];
  else if (k === 0) {
    // 初始状态最终进入的循环
    let s = initial;
    const seen = new Set<number>();
    while (!seen.has(s)) {
      seen.add(s);
      s = delta(s, 0);
    }
    legal = cycles.find((c) => c.includes(s)) ?? [];
  } else legal = [...reach];
  const legalSet = new Set(legal);
  const unused = Array.from({ length: N }, (_, i) => i).filter((s) => !legalSet.has(s));
  // W：必然进入
  const W = new Set(legal);
  let changed = true;
  while (changed) {
    changed = false;
    for (let s = 0; s < N; s++) {
      if (W.has(s)) continue;
      let all = true;
      for (let x = 0; x < K; x++) if (!W.has(delta(s, x))) all = false;
      if (all) {
        W.add(s);
        changed = true;
      }
    }
  }
  // E：可能进入
  const E = new Set(legal);
  changed = true;
  while (changed) {
    changed = false;
    for (let s = 0; s < N; s++) {
      if (E.has(s)) continue;
      for (let x = 0; x < K; x++)
        if (E.has(delta(s, x))) {
          E.add(s);
          changed = true;
          break;
        }
    }
  }
  const details = unused.map((s) => {
    const verdict: "always" | "some" | "never" = W.has(s) ? "always" : E.has(s) ? "some" : "never";
    let path: number[] | undefined;
    if (k === 0) {
      path = [s];
      let t = s;
      const seen = new Set([s]);
      while (!legalSet.has(t)) {
        t = delta(t, 0);
        path.push(t);
        if (seen.has(t)) break;
        seen.add(t);
      }
    }
    return { state: s, verdict, path };
  });
  const invalidCycles = cycles.filter((c) => !c.some((s) => legalSet.has(s)));
  return {
    legal: [...legal].sort((a, b) => a - b),
    unused,
    reachable: [...reach].sort((a, b) => a - b),
    unreachable: Array.from({ length: N }, (_, i) => i).filter((s) => !reach.has(s)),
    cycles,
    details,
    selfStarting: details.every((d) => d.verdict === "always"),
    invalidCycles,
  };
}
