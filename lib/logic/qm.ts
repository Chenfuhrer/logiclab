import { type Expr, and, or, not, v, C0, C1 } from "./ast";

/**
 * Quine–McCluskey 质蕴含项求取 + Petrick 方法求全部最简覆盖。
 *
 * 蕴含项用 (value, mask) 表示：mask 中为 1 的位是被消去的变量（"-"），
 * value 在 mask 位上恒为 0。第 j 个变量（vars[j]，j=0 为最高位）对应位 (n-1-j)。
 *
 * 成本函数：先比较乘积项个数，再比较字面量总数（与教材"最简与或式"定义一致：
 * 乘积项最少，且每个乘积项的因子最少）。
 */

export const QM_EXACT_LIMIT_VARS = 10;
const PETRICK_PRODUCT_LIMIT = 60_000;

export interface Implicant {
  value: number;
  mask: number;
  /** 被覆盖的最小项（包括无关项） */
  covers: number[];
}

export interface QMColumnEntry extends Implicant {
  ones: number;
  combined: boolean;
}

export interface MinimizeResult {
  n: number;
  vars: string[];
  ones: number[];
  dontCares: number[];
  primes: Implicant[];
  /** 质蕴含项中的必要质蕴含项下标 */
  essential: number[];
  /** 全部最简解，每个解是 primes 的下标集合（已排序） */
  solutions: number[][];
  /** 是否保证全局最简（Petrick 规模超限时退化为贪心，为 false） */
  exact: boolean;
  /** QM 合并过程（用于教学展示），columns[k] 是第 k 轮合并结果 */
  columns: QMColumnEntry[][];
  cost: { terms: number; literals: number };
}

const popcount = (x: number) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

export function literalsOf(imp: { mask: number }, n: number): number {
  return n - popcount(imp.mask);
}

export function implicantCovers(imp: { value: number; mask: number }, m: number): boolean {
  return (m & ~imp.mask) === imp.value;
}

function expandCovers(value: number, mask: number): number[] {
  // 枚举 mask 的所有子集
  const r: number[] = [];
  let sub = mask;
  for (;;) {
    r.push(value | sub);
    if (sub === 0) break;
    sub = (sub - 1) & mask;
  }
  return r.sort((a, b) => a - b);
}

export function primeImplicants(n: number, ones: number[], dcs: number[]): { primes: Implicant[]; columns: QMColumnEntry[][] } {
  const start = [...new Set([...ones, ...dcs])].sort((a, b) => a - b);
  let current: QMColumnEntry[] = start.map((m) => ({ value: m, mask: 0, covers: [m], ones: popcount(m), combined: false }));
  const columns: QMColumnEntry[][] = [];
  const primes: Implicant[] = [];
  while (current.length) {
    columns.push(current);
    const nextMap = new Map<string, QMColumnEntry>();
    // 按 1 的个数分组，只比较相邻组
    const groups = new Map<number, QMColumnEntry[]>();
    for (const e of current) {
      const g = groups.get(e.ones) ?? [];
      g.push(e);
      groups.set(e.ones, g);
    }
    for (const [k, g] of groups) {
      const h = groups.get(k + 1);
      if (!h) continue;
      for (const a of g)
        for (const b of h) {
          if (a.mask !== b.mask) continue;
          const diff = a.value ^ b.value;
          if (popcount(diff) !== 1) continue;
          a.combined = true;
          b.combined = true;
          const mask = a.mask | diff;
          const value = a.value & ~diff;
          const key = `${value}/${mask}`;
          if (!nextMap.has(key))
            nextMap.set(key, { value, mask, covers: expandCovers(value, mask), ones: popcount(value), combined: false });
        }
    }
    for (const e of current) if (!e.combined) primes.push({ value: e.value, mask: e.mask, covers: e.covers });
    current = [...nextMap.values()];
  }
  // 稳定排序：先大后小（mask 中 1 多的在前），再按 value
  primes.sort((a, b) => popcount(b.mask) - popcount(a.mask) || a.value - b.value || a.mask - b.mask);
  return { primes, columns };
}

function costOf(sel: number[], primes: Implicant[], n: number) {
  return { terms: sel.length, literals: sel.reduce((s, i) => s + literalsOf(primes[i], n), 0) };
}

function bitsToIndices(b: bigint): number[] {
  const r: number[] = [];
  let i = 0;
  while (b > 0n) {
    if (b & 1n) r.push(i);
    b >>= 1n;
    i++;
  }
  return r;
}

export function minimizeSOP(n: number, ones: number[], dontCares: number[] = [], vars?: string[]): MinimizeResult {
  if (n > QM_EXACT_LIMIT_VARS) throw new Error(`QM 化简最多支持 ${QM_EXACT_LIMIT_VARS} 个变量，当前为 ${n}`);
  const names = vars ?? defaultVarNames(n);
  const oneSet = [...new Set(ones)].sort((a, b) => a - b);
  const dcSet = [...new Set(dontCares)].filter((m) => !oneSet.includes(m)).sort((a, b) => a - b);
  for (const m of [...oneSet, ...dcSet]) if (m < 0 || m >= 1 << n) throw new Error(`最小项 ${m} 超出范围`);

  const base = { n, vars: names, ones: oneSet, dontCares: dcSet };
  if (oneSet.length === 0) {
    return { ...base, primes: [], essential: [], solutions: [[]], exact: true, columns: [], cost: { terms: 0, literals: 0 } };
  }
  const { primes, columns } = primeImplicants(n, oneSet, dcSet);
  // 质蕴含项表：只针对真正的 1（无关项不需要被覆盖）
  const coverers = new Map<number, number[]>();
  for (const m of oneSet) coverers.set(m, primes.map((p, i) => (implicantCovers(p, m) ? i : -1)).filter((i) => i >= 0));

  const essentialSet = new Set<number>();
  for (const [, list] of coverers) if (list.length === 1) essentialSet.add(list[0]);
  const essential = [...essentialSet].sort((a, b) => a - b);
  const remaining = oneSet.filter((m) => !essential.some((i) => implicantCovers(primes[i], m)));

  let solutions: number[][];
  let exact = true;
  if (remaining.length === 0) {
    solutions = [essential];
  } else {
    // Petrick：∏_m (Σ 覆盖 m 的质蕴含项) 展开为最简积之和
    let products: bigint[] = [0n];
    let overflow = false;
    for (const m of remaining) {
      const sum = coverers.get(m)!;
      const next: bigint[] = [];
      for (const p of products)
        for (const i of sum) {
          const t = p | (1n << BigInt(i));
          next.push(t);
        }
      // 吸收律 X + XY = X
      next.sort((a, b) => bitsToIndices(a).length - bitsToIndices(b).length);
      const kept: bigint[] = [];
      for (const t of next) {
        if (kept.some((k) => (k & t) === k)) continue;
        kept.push(t);
      }
      products = kept;
      if (products.length > PETRICK_PRODUCT_LIMIT) {
        overflow = true;
        break;
      }
    }
    if (overflow) {
      exact = false;
      solutions = [greedyCover(remaining, coverers, primes, n, essential)];
    } else {
      let best: number[][] = [];
      let bestCost = { terms: Infinity, literals: Infinity };
      for (const p of products) {
        const sel = [...essential, ...bitsToIndices(p)].sort((a, b) => a - b);
        const c = costOf(sel, primes, n);
        if (c.terms < bestCost.terms || (c.terms === bestCost.terms && c.literals < bestCost.literals)) {
          bestCost = c;
          best = [sel];
        } else if (c.terms === bestCost.terms && c.literals === bestCost.literals) {
          best.push(sel);
        }
      }
      const uniq = new Map(best.map((s) => [s.join(","), s]));
      solutions = [...uniq.values()];
    }
  }
  return { ...base, primes, essential, solutions, exact, columns, cost: costOf(solutions[0], primes, n) };
}

function greedyCover(remaining: number[], coverers: Map<number, number[]>, primes: Implicant[], n: number, essential: number[]): number[] {
  const sel = new Set(essential);
  const left = new Set(remaining);
  while (left.size) {
    let bestI = -1;
    let bestScore = -1;
    primes.forEach((p, i) => {
      if (sel.has(i)) return;
      let c = 0;
      for (const m of left) if (implicantCovers(p, m)) c++;
      const score = c * 100 - literalsOf(p, n);
      if (c > 0 && score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    });
    sel.add(bestI);
    for (const m of [...left]) if (implicantCovers(primes[bestI], m)) left.delete(m);
  }
  void coverers;
  return [...sel].sort((a, b) => a - b);
}

export function defaultVarNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

/** 蕴含项 → 乘积项表达式 */
export function implicantToExpr(imp: { value: number; mask: number }, vars: string[]): Expr {
  const n = vars.length;
  const lits: Expr[] = [];
  for (let j = 0; j < n; j++) {
    const bit = 1 << (n - 1 - j);
    if (imp.mask & bit) continue;
    lits.push(imp.value & bit ? v(vars[j]) : not(v(vars[j])));
  }
  return lits.length === 0 ? C1 : and(...lits);
}

/** 蕴含项 → 或项（用于或与式：对 F′ 的乘积项取反演） */
export function implicantToSumExpr(imp: { value: number; mask: number }, vars: string[]): Expr {
  const n = vars.length;
  const lits: Expr[] = [];
  for (let j = 0; j < n; j++) {
    const bit = 1 << (n - 1 - j);
    if (imp.mask & bit) continue;
    lits.push(imp.value & bit ? not(v(vars[j])) : v(vars[j]));
  }
  return lits.length === 0 ? C0 : or(...lits);
}

export function solutionToSOP(res: MinimizeResult, k = 0): Expr {
  const sel = res.solutions[k];
  if (res.ones.length === 0) return C0;
  return or(...sel.map((i) => implicantToExpr(res.primes[i], res.vars)));
}

/** 蕴含项的文字表示，例如 "1-0-" */
export function implicantPattern(imp: { value: number; mask: number }, n: number): string {
  let s = "";
  for (let j = 0; j < n; j++) {
    const bit = 1 << (n - 1 - j);
    s += imp.mask & bit ? "-" : imp.value & bit ? "1" : "0";
  }
  return s;
}

export interface POSResult {
  /** 对 F′ 化简的结果（F′ 的 1 = F 的 0） */
  complement: MinimizeResult;
  expr: Expr;
  solutionsExpr: Expr[];
}

/** 最简或与式：化简 F′ 得最简与或式，再用反演定理取反 */
export function minimizePOS(n: number, ones: number[], dontCares: number[] = [], vars?: string[]): POSResult {
  const names = vars ?? defaultVarNames(n);
  const dcSet = new Set(dontCares);
  const oneSet = new Set(ones);
  const zeros: number[] = [];
  for (let m = 0; m < 1 << n; m++) if (!oneSet.has(m) && !dcSet.has(m)) zeros.push(m);
  const comp = minimizeSOP(n, zeros, [...dcSet].filter((m) => !oneSet.has(m)), names);
  const toExpr = (sel: number[]) =>
    zeros.length === 0 ? C1 : and(...sel.map((i) => implicantToSumExpr(comp.primes[i], names)));
  const solutionsExpr = comp.solutions.map(toExpr);
  return { complement: comp, expr: solutionsExpr[0], solutionsExpr };
}
