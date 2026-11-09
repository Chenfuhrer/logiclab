import type { Expr } from "../logic/ast";
import { minimizeSOP, solutionToSOP, type MinimizeResult } from "../logic/qm";
import { C0 } from "../logic/ast";
import type { FFType } from "../sim/models";
import { analyzeSync, FF_PINS, selfStartCheck, type Analysis, type SyncCircuit, type SelfStartReport } from "./analyze";

/**
 * 同步时序逻辑设计：原始状态表 → 状态化简 → 状态编码 → 选触发器 → 次态/驱动/输出方程 → 自启动检查 → 验证。
 */
export type Bit = 0 | 1;

export interface StateTableSpec {
  kind: "moore" | "mealy";
  /** 输入变量名（通常是 ["X"]） */
  inputs: string[];
  outputs: string[];
  states: string[];
  /** next[s][x]：状态 s 在输入组合 x 下的次态下标 */
  next: number[][];
  /** out[s][x][k]：Mealy 输出；Moore 时各 x 取值相同 */
  out: Bit[][][];
  initial?: number;
}

export function validateSpec(spec: StateTableSpec): string[] {
  const errs: string[] = [];
  const K = 1 << spec.inputs.length;
  if (spec.states.length < 2) errs.push("至少需要 2 个状态");
  if (spec.inputs.length > 3) errs.push("输入变量最多 3 个");
  if (new Set(spec.states).size !== spec.states.length) errs.push("状态名重复");
  spec.states.forEach((s, i) => {
    if (spec.next[i]?.length !== K) errs.push(`状态 ${s} 的次态列数应为 ${K}`);
    spec.next[i]?.forEach((t, x) => {
      if (!(t >= 0 && t < spec.states.length)) errs.push(`状态 ${s} 在输入 ${x} 下的次态无效`);
    });
    if (spec.out[i]?.length !== K) errs.push(`状态 ${s} 的输出列数应为 ${K}`);
    if (spec.kind === "moore" && spec.out[i]?.some((o) => o.join() !== spec.out[i][0].join()))
      errs.push(`Moore 型电路的输出只取决于状态，但状态 ${s} 在不同输入下输出不同`);
  });
  return errs;
}

// ───────────────────────── 状态化简 ─────────────────────────

export type PairStatus = { kind: "output" } | { kind: "next"; round: number; because: [number, number] } | { kind: "equivalent"; implied: [number, number][] };

export interface Minimization {
  /** 等价类（每类为原状态下标） */
  classes: number[][];
  /** 原状态 → 等价类下标 */
  classOf: number[];
  /** 隐含表：pairs[i][j]（i>j） */
  pairs: Map<string, PairStatus>;
  reduced: StateTableSpec;
}

const key = (i: number, j: number) => (i > j ? `${i},${j}` : `${j},${i}`);

/**
 * 隐含表法求等价状态（完全确定的状态表）。
 * 两个状态等价 ⇔ 对任意输入，输出相同，且次态相同或等价（递归）。
 * 只有"输出相同"不足以合并——必须检查次态的等价性。
 */
export function minimizeStates(spec: StateTableSpec): Minimization {
  const N = spec.states.length;
  const K = 1 << spec.inputs.length;
  const pairs = new Map<string, PairStatus>();
  const implied = new Map<string, [number, number][]>();
  for (let i = 1; i < N; i++)
    for (let j = 0; j < i; j++) {
      let sameOut = true;
      for (let x = 0; x < K; x++) if (spec.out[i][x].join() !== spec.out[j][x].join()) sameOut = false;
      if (!sameOut) {
        pairs.set(key(i, j), { kind: "output" });
        continue;
      }
      const imp: [number, number][] = [];
      for (let x = 0; x < K; x++) {
        const a = spec.next[i][x];
        const b = spec.next[j][x];
        if (a !== b && key(a, b) !== key(i, j)) imp.push(a > b ? [a, b] : [b, a]);
      }
      implied.set(key(i, j), imp);
      pairs.set(key(i, j), { kind: "equivalent", implied: imp });
    }
  // 迭代划掉"隐含对不等价"的格子
  let round = 0;
  let changed = true;
  while (changed) {
    changed = false;
    round++;
    for (const [k, st] of pairs) {
      if (st.kind !== "equivalent") continue;
      const bad = st.implied.find(([a, b]) => pairs.get(key(a, b))?.kind !== "equivalent");
      if (bad) {
        pairs.set(k, { kind: "next", round, because: bad });
        changed = true;
      }
    }
  }
  // 等价类（等价关系具有传递性，用并查集合并）
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [k, st] of pairs)
    if (st.kind === "equivalent") {
      const [a, b] = k.split(",").map(Number);
      parent[find(a)] = find(b);
    }
  const groups = new Map<number, number[]>();
  for (let s = 0; s < N; s++) {
    const r = find(s);
    groups.set(r, [...(groups.get(r) ?? []), s]);
  }
  const classes = [...groups.values()].sort((a, b) => a[0] - b[0]);
  const classOf = new Array(N);
  classes.forEach((c, ci) => c.forEach((s) => (classOf[s] = ci)));
  const reduced: StateTableSpec = {
    kind: spec.kind,
    inputs: spec.inputs,
    outputs: spec.outputs,
    states: classes.map((c) => c.map((s) => spec.states[s]).join("=")),
    next: classes.map((c) => spec.next[c[0]].map((t) => classOf[t])),
    out: classes.map((c) => spec.out[c[0]]),
    initial: classOf[spec.initial ?? 0],
  };
  return { classes, classOf, pairs, reduced };
}

// ───────────────────────── 编码与综合 ─────────────────────────

export interface SynthesisOptions {
  ffType: FFType;
  /** 状态编码；缺省为二进制顺序编码 */
  codes?: number[];
  /** 每个触发器的触发沿 */
  edge?: "rising" | "falling";
  /** 为保证自启动，把无效状态的次态指定为初始状态（不再作无关项） */
  forceSelfStart?: boolean;
}

export interface ExcitationColumn {
  /** 例如 J1、K1、D0 */
  name: string;
  ff: string;
  pin: string;
  /** 真值表：长度 2^(k+n)，值 0/1/'x' */
  values: (0 | 1 | "x")[];
  min: MinimizeResult;
  expr: Expr;
}

export interface Synthesis {
  spec: StateTableSpec;
  nBits: number;
  codes: number[];
  stateVars: string[];
  /** 变量序：输入在前，状态变量高位在前 */
  vars: string[];
  /** 次态卡诺图数据：每个状态位 */
  nextColumns: { name: string; values: (0 | 1 | "x")[]; min: MinimizeResult; expr: Expr }[];
  excitation: ExcitationColumn[];
  outputColumns: { name: string; values: (0 | 1 | "x")[]; min: MinimizeResult; expr: Expr }[];
  circuit: SyncCircuit;
  analysis: Analysis;
  selfStart: SelfStartReport;
  /** 逐状态核对：所得驱动方程是否在每个合法状态/输入下实现目标次态与输出 */
  verification: { state: number; input: number; expectedNext: number; actualNext: number; expectedOut: Bit[]; actualOut: Bit[]; ok: boolean }[];
  verified: boolean;
}

export function bitsNeeded(nStates: number) {
  return Math.max(1, Math.ceil(Math.log2(nStates)));
}

export function synthesize(spec: StateTableSpec, opt: SynthesisOptions): Synthesis {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(errs.join("；"));
  const S = spec.states.length;
  const n = bitsNeeded(S);
  const codes = opt.codes ?? Array.from({ length: S }, (_, i) => i);
  if (codes.length !== S) throw new Error("编码个数与状态数不一致");
  if (new Set(codes).size !== S) throw new Error("状态编码重复");
  if (codes.some((c) => c < 0 || c >= 1 << n)) throw new Error(`编码超出 ${n} 位范围`);
  const k = spec.inputs.length;
  const K = 1 << k;
  const stateVars = Array.from({ length: n }, (_, i) => `Q${n - 1 - i}`);
  const vars = [...spec.inputs, ...stateVars];
  const nv = k + n;
  const codeToState = new Map(codes.map((c, s) => [c, s]));
  const initialCode = codes[spec.initial ?? 0];

  // 行号 = x 在高位、状态码在低位
  const row = (x: number, code: number) => (x << n) | code;
  const nextBits: (0 | 1 | "x")[][] = Array.from({ length: n }, () => new Array(1 << nv).fill("x"));
  const outBits: (0 | 1 | "x")[][] = spec.outputs.map(() => new Array(1 << nv).fill("x"));
  for (let code = 0; code < 1 << n; code++)
    for (let x = 0; x < K; x++) {
      const s = codeToState.get(code);
      const r = row(x, code);
      if (s === undefined) {
        if (opt.forceSelfStart) for (let b = 0; b < n; b++) nextBits[b][r] = ((initialCode >> (n - 1 - b)) & 1) as Bit;
        continue;
      }
      const nc = codes[spec.next[s][x]];
      for (let b = 0; b < n; b++) nextBits[b][r] = ((nc >> (n - 1 - b)) & 1) as Bit;
      spec.out[s][x].forEach((o, oi) => (outBits[oi][r] = o));
    }
  // Moore 输出只依赖状态：对输入作"相同取值"的展开已经自然满足；化简时变量里包含输入，但真值与输入无关
  const minimize = (vals: (0 | 1 | "x")[]) => {
    const ones: number[] = [];
    const dcs: number[] = [];
    vals.forEach((x, i) => (x === 1 ? ones.push(i) : x === "x" ? dcs.push(i) : null));
    const min = minimizeSOP(nv, ones, dcs, vars);
    return { min, expr: ones.length === 0 ? C0 : solutionToSOP(min) };
  };
  const nextColumns = nextBits.map((vals, b) => ({ name: stateVars[b], values: vals, ...minimize(vals) }));
  // 激励表
  const excitation: ExcitationColumn[] = [];
  for (let b = 0; b < n; b++) {
    const qName = stateVars[b];
    const idx = qName.slice(1);
    const pins = FF_PINS[opt.ffType];
    for (const pin of pins) {
      const vals: (0 | 1 | "x")[] = new Array(1 << nv).fill("x");
      for (let r = 0; r < 1 << nv; r++) {
        const qn1 = nextBits[b][r];
        if (qn1 === "x") continue;
        const q = (r >> (n - 1 - b)) & 1;
        vals[r] = excite(opt.ffType, pin, q as Bit, qn1);
      }
      excitation.push({ name: `${pin}${idx}`, ff: qName, pin, values: vals, ...minimize(vals) });
    }
  }
  const outputColumns = outBits.map((vals, oi) => ({ name: spec.outputs[oi], values: vals, ...minimize(vals) }));
  const circuit: SyncCircuit = {
    inputs: spec.inputs,
    ffs: stateVars.map((name) => ({
      name,
      type: opt.ffType,
      edge: opt.edge ?? "rising",
      inputs: Object.fromEntries(FF_PINS[opt.ffType].map((p) => [p, excitation.find((e) => e.ff === name && e.pin === p)!.expr])),
    })),
    outputs: outputColumns.map((o) => ({ name: o.name, expr: o.expr })),
  };
  const analysis = analyzeSync(circuit, initialCode);
  // 合法状态 = 已编码的状态；检查从未用编码出发能否进入
  const selfStart = selfStartCheck(analysis.rows, n, k, initialCode, codes);
  const verification: Synthesis["verification"] = [];
  for (let s = 0; s < S; s++)
    for (let x = 0; x < K; x++) {
      const r = analysis.rows[codes[s] * K + x];
      const expectedNext = codes[spec.next[s][x]];
      const expectedOut = spec.out[s][x];
      const ok = r.next === expectedNext && expectedOut.every((o, i) => o === r.outputs[i]);
      verification.push({ state: s, input: x, expectedNext, actualNext: r.next, expectedOut, actualOut: r.outputs as Bit[], ok });
    }
  return {
    spec,
    nBits: n,
    codes,
    stateVars,
    vars,
    nextColumns,
    excitation,
    outputColumns,
    circuit,
    analysis,
    selfStart,
    verification,
    verified: verification.every((v) => v.ok),
  };
}

/** 激励表：已知现态 q 与目标次态 q⁺，求触发器输入 */
export function excite(type: FFType, pin: string, q: Bit, qn1: Bit): 0 | 1 | "x" {
  switch (type) {
    case "D":
      return qn1;
    case "T":
      return (q ^ qn1) as Bit;
    case "JK":
      if (pin === "J") return q === 0 ? qn1 : "x";
      return q === 1 ? ((qn1 ^ 1) as Bit) : "x";
    case "SR":
      if (pin === "S") return q === 0 ? qn1 : qn1 === 1 ? "x" : 0;
      return q === 1 ? ((qn1 ^ 1) as Bit) : qn1 === 0 ? "x" : 0;
  }
  return "x";
}

// ───────────────────────── 序列检测器 ─────────────────────────

/**
 * 生成序列检测器的原始状态表。
 *  - Mealy：状态 S_k 表示"已匹配前 k 位"（k=0..L-1），检测到完整序列的那个输入同时输出 1；
 *  - Moore：增加状态 S_L 表示"刚检测到"，该状态输出 1；
 *  - 可重叠：检测成功后保留最长的"既是后缀又是前缀"的部分；
 *  - 不可重叠：检测成功后从头开始。
 * 次态 = 当前已匹配串 + 新输入 的最长后缀，且该后缀是目标序列的前缀。
 */
export function sequenceDetector(seq: string, kind: "mealy" | "moore", overlap: boolean): StateTableSpec {
  if (!/^[01]{2,8}$/.test(seq)) throw new Error("序列应为 2～8 位的 0/1 串");
  const L = seq.length;
  const longest = (w: string, maxLen: number) => {
    for (let len = Math.min(maxLen, w.length); len > 0; len--) if (seq.startsWith(w.slice(w.length - len))) return len;
    return 0;
  };
  const nStates = kind === "mealy" ? L : L + 1;
  const next: number[][] = [];
  const out: Bit[][][] = [];
  for (let k = 0; k < nStates; k++) {
    const row: number[] = [];
    const orow: Bit[][] = [];
    for (const b of ["0", "1"]) {
      if (kind === "mealy") {
        const w = seq.slice(0, k) + b;
        if (w === seq) {
          row.push(overlap ? longest(seq.slice(1), L - 1) : 0);
          orow.push([1]);
        } else {
          row.push(longest(w, L - 1));
          orow.push([0]);
        }
      } else {
        const w = k === L ? (overlap ? seq + b : b) : seq.slice(0, k) + b;
        row.push(longest(w, L));
        orow.push([k === L ? 1 : 0]);
      }
    }
    next.push(row);
    out.push(kind === "moore" ? orow.map(() => [k === L ? 1 : 0] as Bit[]) : orow);
  }
  return {
    kind,
    inputs: ["X"],
    outputs: ["Y"],
    states: Array.from({ length: nStates }, (_, i) => `S${i}`),
    next,
    out,
    initial: 0,
  };
}

/** 用状态表直接对输入序列做逐拍仿真（参考模型，用于验证） */
export function runStateTable(spec: StateTableSpec, inputs: number[], start = spec.initial ?? 0): { states: number[]; outputs: Bit[][] } {
  let s = start;
  const states = [s];
  const outputs: Bit[][] = [];
  for (const x of inputs) {
    outputs.push(spec.out[s][x]);
    s = spec.next[s][x];
    states.push(s);
  }
  return { states, outputs };
}
