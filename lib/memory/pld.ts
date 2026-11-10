/**
 * 可编程逻辑器件计算库（纯函数，逻辑层/理想模型）。
 *
 *  - PLA 编程：多输出与或式 → 与阵列（乘积线 × 输入原/反变量）与或阵列（乘积线 × 输出）的连接矩阵。
 *    每个输出先用 QM（lib/logic）化简；同一输出有多个最简解时，选与已有乘积项重合最多的那个，
 *    完全相同的乘积项只占一条乘积线（乘积项共享）。注意：这是"逐个输出最简 + 共享相同项"，
 *    不是多输出联合最优化（联合最优化有时会选用非质蕴含项以增加共享）。
 *  - LUT：k 输入查找表 = 2ᵏ×1 存储器。变量数 ≤ k 时直接写入真值表；
 *    变量数 > k 时按香农展开 f = x̄·f|ₓ₌₀ + x·f|ₓ₌₁，用 2ˢ 个 k-LUT 实现余因子，再用 LUT 构成的选择器树合并。
 *
 * 约定：vars[0] 为最高位（与真值表、最小项编号一致）。
 */
import { type Expr, and, or, not, v, C0, C1, sortedVariables } from "../logic/ast";
import { minimizeSOP, implicantPattern, implicantToExpr, type MinimizeResult } from "../logic/qm";
import { truthTable, minterms as mintermsOf } from "../logic/truthtable";
import { tryParse } from "../logic/parser";
import { toLatex, toText } from "../logic/format";
import { parseOutputs } from "./memory";

// ───────────────────────── PLA ─────────────────────────

export interface PlaTerm {
  value: number;
  mask: number;
  /** 例如 "1-0"：1 = 接原变量，0 = 接反变量，- = 不接 */
  pattern: string;
  expr: Expr;
  text: string;
  latex: string;
  /** 使用这条乘积线的输出下标 */
  outputs: number[];
}

export interface PlaOutput {
  name: string;
  src: string;
  expr: Expr;
  /** 使用的乘积线下标 */
  terms: number[];
  /** 化简后的与或式 */
  sop: Expr;
  /** 该输出是否有多个最简解 */
  alternatives: number;
}

export interface PlaProgram {
  vars: string[];
  outputs: PlaOutput[];
  terms: PlaTerm[];
  /** [乘积线][变量]：1 = 接原变量，0 = 接反变量，null = 不接 */
  andMatrix: (0 | 1 | null)[][];
  /** [乘积线][输出]：是否接到该输出的或门 */
  orMatrix: boolean[][];
  share: boolean;
  stats: {
    terms: number;
    andConnections: number;
    orConnections: number;
    /** 不共享时需要的乘积线数（各输出最简式乘积项数之和） */
    termsWithoutSharing: number;
    /** 用 PROM（与阵列固定为全译码）实现时的乘积线数 2ⁿ */
    promTerms: number;
  };
}

export interface PlaOptions {
  /** 相同乘积项是否共享一条乘积线，默认 true */
  share?: boolean;
  maxVars?: number;
  maxOutputs?: number;
  vars?: string[];
}

const keyOf = (t: { value: number; mask: number }) => `${t.value}/${t.mask}`;

/** 由多输出表达式得到 PLA 的与阵列/或阵列连接矩阵 */
export function plaProgram(srcs: string[], opts: PlaOptions = {}): PlaProgram {
  const share = opts.share ?? true;
  const { vars, outputs: parsed } = parseOutputs(srcs, { vars: opts.vars, maxVars: opts.maxVars ?? 8, maxOutputs: opts.maxOutputs ?? 6, defaultPrefix: "F" });
  const n = vars.length;
  const results: MinimizeResult[] = parsed.map((o) => minimizeSOP(n, mintermsOf(truthTable(o.expr, vars)), [], vars));
  const terms: PlaTerm[] = [];
  const index = new Map<string, number>();
  let termsWithoutSharing = 0;
  const outputs: PlaOutput[] = parsed.map((o, j) => {
    const res = results[j];
    // 全 0 函数：没有乘积项
    if (res.ones.length === 0) return { ...o, terms: [], sop: C0, alternatives: 1 };
    // 多个最简解时，选与已有乘积线重合最多的
    let best = res.solutions[0];
    if (share) {
      let bestShared = -1;
      for (const sol of res.solutions) {
        const shared = sol.filter((i) => index.has(keyOf(res.primes[i]))).length;
        if (shared > bestShared) {
          bestShared = shared;
          best = sol;
        }
      }
    }
    termsWithoutSharing += best.length;
    const used: number[] = [];
    for (const pi of best) {
      const p = res.primes[pi];
      const k = keyOf(p);
      let ti = share ? index.get(k) : undefined;
      if (ti === undefined) {
        const expr = implicantToExpr(p, vars);
        ti = terms.length;
        terms.push({ value: p.value, mask: p.mask, pattern: implicantPattern(p, n), expr, text: toText(expr), latex: toLatex(expr), outputs: [] });
        if (share) index.set(k, ti);
      }
      terms[ti].outputs.push(j);
      used.push(ti);
    }
    return { ...o, terms: used, sop: or(...used.map((t) => terms[t].expr)), alternatives: res.solutions.length };
  });
  const andMatrix = terms.map((t) => [...t.pattern].map((c) => (c === "1" ? 1 : c === "0" ? 0 : null)) as (0 | 1 | null)[]);
  const orMatrix = terms.map((t) => outputs.map((_, j) => t.outputs.includes(j)));
  return {
    vars,
    outputs,
    terms,
    andMatrix,
    orMatrix,
    share,
    stats: {
      terms: terms.length,
      andConnections: andMatrix.reduce((s, r) => s + r.filter((x) => x !== null).length, 0),
      orConnections: orMatrix.reduce((s, r) => s + r.filter(Boolean).length, 0),
      termsWithoutSharing,
      promTerms: 2 ** n,
    },
  };
}

/** 由连接矩阵重建第 j 个输出的与或式（用于验证编程结果） */
export function plaOutputExpr(p: PlaProgram, j: number): Expr {
  const rows = p.orMatrix.map((r, t) => (r[j] ? t : -1)).filter((t) => t >= 0);
  if (rows.length === 0) return C0;
  return or(
    ...rows.map((t) => {
      const lits: Expr[] = [];
      p.andMatrix[t].forEach((c, i) => {
        if (c === 1) lits.push(v(p.vars[i]));
        else if (c === 0) lits.push(not(v(p.vars[i])));
      });
      return lits.length ? and(...lits) : C1;
    }),
  );
}

/** 给定输入取值（与 vars 同序），求每条乘积线与每个输出的值 */
export function plaEvaluate(p: PlaProgram, inputs: (0 | 1)[]): { terms: (0 | 1)[]; outputs: (0 | 1)[] } {
  if (inputs.length !== p.vars.length) throw new Error(`需要 ${p.vars.length} 个输入取值，实际给出 ${inputs.length} 个`);
  const terms = p.andMatrix.map((row) => (row.every((c, i) => c === null || c === inputs[i]) ? 1 : 0) as 0 | 1);
  const outputs = p.outputs.map((_, j) => (p.orMatrix.some((r, t) => r[j] && terms[t]) ? 1 : 0) as 0 | 1);
  return { terms, outputs };
}

// ───────────────────────── LUT ─────────────────────────

export const LUT_MIN_K = 2;
export const LUT_MAX_K = 6;
export const LUT_MAX_VARS = 10;

/** 位串 → 十六进制（最高地址在最左，与常见 INIT 写法一致）；长度不足 4 位时按 1 位十六进制 */
export function bitsToHex(bits: ArrayLike<number>): string {
  let s = "";
  for (let hi = bits.length - 1; hi >= 0; hi -= 4) {
    let d = 0;
    for (let b = 0; b < 4 && hi - b >= 0; b++) d |= (bits[hi - b] ? 1 : 0) << (3 - b);
    // 不足 4 位的最低一组：右对齐
    const width = Math.min(4, hi + 1);
    s += (width < 4 ? d >> (4 - width) : d).toString(16).toUpperCase();
  }
  return s;
}

export interface LutConfig {
  /** 该 LUT 的输入（MSB 在前，长度 k）；null 表示未使用的输入 */
  inputs: (string | null)[];
  /** 2ᵏ 位存储内容，bits[i] = 地址 i 处存的值 */
  bits: Uint8Array;
  hex: string;
}

export interface LutCofactor extends LutConfig {
  /** 选择变量的取值（二进制编码，选择变量 vars[0] 为最高位） */
  select: number;
  /** 例如 "A=0, B=1" */
  label: string;
  /** 余因子为常量时不需要 LUT */
  constant: 0 | 1 | null;
  /** 与之前某个余因子内容完全相同（可共用一个 LUT） */
  sameAs: number | null;
}

export interface MuxLevel {
  /** 这一级使用的选择变量（MSB 在前） */
  selects: string[];
  /** 这一级 LUT 个数 */
  luts: number;
  /** 每个 LUT 用到的输入数 = 2^t + t */
  inputsPerLut: number;
}

export interface LutMapping {
  src: string;
  expr: Expr;
  vars: string[];
  n: number;
  k: number;
  /** 函数真值表（2ⁿ 位） */
  table: Uint8Array;
  fits: boolean;
  /** n ≤ k：单个 LUT 的内容 */
  single: LutConfig | null;
  /** n > k：香农展开方案 */
  plan: null | {
    selectVars: string[];
    dataVars: string[];
    cofactors: LutCofactor[];
    mux: MuxLevel[];
    /** 不做任何优化时的 LUT 总数（余因子 2ˢ 个 + 选择器树） */
    totalLuts: number;
    /** 去掉常量余因子、合并相同余因子后的余因子 LUT 数 + 选择器树 */
    optimizedLuts: number;
    /** LUT 级数 */
    depth: number;
    notes: string[];
  };
}

/** k-LUT 能装下的最大选择器：2^t 个数据输入 + t 个选择输入 ≤ k */
export function maxMuxSelects(k: number): number {
  let t = 0;
  while (2 ** (t + 1) + (t + 1) <= k) t++;
  return t;
}

/** 把逻辑函数映射到 k 输入 LUT */
export function mapToLut(src: string | Expr, k: number): LutMapping {
  if (!Number.isInteger(k) || k < LUT_MIN_K || k > LUT_MAX_K) throw new Error(`LUT 输入数 k 应为 ${LUT_MIN_K}～${LUT_MAX_K} 的整数，当前为 ${k}`);
  let expr: Expr;
  let text: string;
  if (typeof src === "string") {
    if (src.trim() === "") throw new Error("请输入逻辑表达式");
    const r = tryParse(src.replace(/^\s*[A-Za-z]\w*\s*=/, ""));
    if (!r.ok) throw new Error(`表达式无法解析（第 ${r.pos + 1} 个字符附近）：${r.error}`);
    expr = r.expr;
    text = src.trim();
  } else {
    expr = src;
    text = toText(src);
  }
  const vars = sortedVariables(expr);
  const n = vars.length;
  if (n === 0) throw new Error("表达式中没有变量：常量函数不需要 LUT");
  if (n > LUT_MAX_VARS) throw new Error(`变量 ${n} 个，超过本实验上限 ${LUT_MAX_VARS} 个`);
  const table = truthTable(expr, vars);
  const size = 2 ** k;
  if (n <= k) {
    // 变量接在低位输入，高位输入不用；内容按周期 2ⁿ 复制，使未用输入取任何值都不影响输出
    const bits = new Uint8Array(size);
    for (let i = 0; i < size; i++) bits[i] = table[i % table.length];
    const inputs: (string | null)[] = [...Array<null>(k - n).fill(null), ...vars];
    return { src: text, expr, vars, n, k, table, fits: true, single: { inputs, bits, hex: bitsToHex(bits) }, plan: null };
  }
  const t = maxMuxSelects(k);
  if (t < 1) throw new Error(`${k} 输入 LUT 装不下一个 2 选 1 选择器（需要 3 个输入），无法用香农展开级联`);
  const s = n - k;
  const selectVars = vars.slice(0, s);
  const dataVars = vars.slice(s);
  const cofactors: LutCofactor[] = [];
  for (let c = 0; c < 2 ** s; c++) {
    const bits = table.slice(c * size, (c + 1) * size);
    const ones = bits.reduce((a, b) => a + b, 0);
    const constant = ones === 0 ? 0 : ones === size ? 1 : null;
    const hexs = bitsToHex(bits);
    const prev = cofactors.findIndex((x) => x.hex === hexs);
    cofactors.push({
      select: c,
      label: selectVars.map((x, i) => `${x}=${(c >> (s - 1 - i)) & 1}`).join(", "),
      inputs: [...dataVars],
      bits,
      hex: hexs,
      constant,
      sameAs: prev >= 0 ? prev : null,
    });
  }
  // 选择器树：先用最低位的选择变量
  const mux: MuxLevel[] = [];
  let remaining = s;
  let count = 2 ** s;
  while (remaining > 0) {
    const tt = Math.min(t, remaining);
    const sel = selectVars.slice(remaining - tt, remaining);
    count = count / 2 ** tt;
    mux.push({ selects: sel, luts: count, inputsPerLut: 2 ** tt + tt });
    remaining -= tt;
  }
  const muxLuts = mux.reduce((a, l) => a + l.luts, 0);
  const totalLuts = 2 ** s + muxLuts;
  const distinct = cofactors.filter((c) => c.constant === null && c.sameAs === null).length;
  const notes: string[] = [];
  notes.push(`香农展开：以 ${selectVars.join("、")} 为选择变量，把 ${n} 变量函数拆成 ${2 ** s} 个 ${k} 变量余因子（${dataVars.join("、")}）。`);
  notes.push(`选择器树：每个 ${k}-LUT 最多实现 ${2 ** t} 选 1（${2 ** t} 个数据 + ${t} 个选择 = ${2 ** t + t} 个输入），共 ${mux.length} 级、${muxLuts} 个 LUT。`);
  const consts = cofactors.filter((c) => c.constant !== null).length;
  const dups = cofactors.filter((c) => c.constant === null && c.sameAs !== null).length;
  if (consts) notes.push(`有 ${consts} 个余因子是常量，直接接 0/1，不占 LUT。`);
  if (dups) notes.push(`有 ${dups} 个余因子与前面的某个完全相同，可共用同一个 LUT 的输出。`);
  notes.push("这是一个可行方案，不保证 LUT 数最少；综合工具会按函数结构做更好的分解。");
  return {
    src: text,
    expr,
    vars,
    n,
    k,
    table,
    fits: false,
    single: null,
    plan: { selectVars, dataVars, cofactors, mux, totalLuts, optimizedLuts: distinct + muxLuts, depth: 1 + mux.length, notes },
  };
}

/** 按输入取值（与 m.vars 同序）读出 LUT：返回地址、命中的余因子与输出 */
export function lutRead(m: LutMapping, inputs: (0 | 1)[]): { value: 0 | 1; address: number; cofactor: number | null } {
  if (inputs.length !== m.n) throw new Error(`需要 ${m.n} 个输入取值，实际给出 ${inputs.length} 个`);
  const full = inputs.reduce<number>((a, b) => a * 2 + b, 0);
  if (m.single) return { value: m.single.bits[full] as 0 | 1, address: full, cofactor: null };
  const plan = m.plan!;
  const size = 2 ** m.k;
  const c = Math.floor(full / size);
  const address = full % size;
  return { value: plan.cofactors[c].bits[address] as 0 | 1, address, cofactor: c };
}
