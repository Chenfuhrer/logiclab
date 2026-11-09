import { implicantCovers, literalsOf, minimizeSOP, type MinimizeResult } from "./qm";

/**
 * 卡诺图布局（2～5 变量）。
 *
 * 行变量取高位，列变量取低位，行列都按格雷码排列：
 *   2 变量：行 A，列 B
 *   3 变量：行 A，列 BC（00 01 11 10）
 *   4 变量：行 AB，列 CD
 *   5 变量：行 AB，列 CDE 采用教材常用的"反射码"排列 000 001 011 010 110 111 101 100
 *           （以中线为轴对称的格子也是逻辑相邻的）。
 * 相邻关系与合法性判断一律按"最小项编号只差一位"判定，不依赖几何位置，
 * 因此循环相邻（首尾行列、四角）以及 5 变量的对称相邻都自动正确。
 */

export const GRAY2 = [0, 1, 3, 2];
export const GRAY3 = [0, 1, 3, 2, 6, 7, 5, 4];

export interface KMapLayout {
  n: number;
  rowBits: number;
  colBits: number;
  rowCodes: number[];
  colCodes: number[];
  rowVars: string[];
  colVars: string[];
  /** cells[r][c] = 最小项编号 */
  cells: number[][];
}

export function kmapLayout(n: number, vars: string[]): KMapLayout {
  if (n < 2 || n > 5) throw new Error("卡诺图只支持 2～5 个变量");
  if (vars.length !== n) throw new Error("变量名数量与变量数不一致");
  const rowBits = n === 2 ? 1 : n === 3 ? 1 : 2;
  const colBits = n - rowBits;
  const codes = (bits: number) => (bits === 1 ? [0, 1] : bits === 2 ? GRAY2 : GRAY3);
  const rowCodes = codes(rowBits);
  const colCodes = codes(colBits);
  const cells = rowCodes.map((r) => colCodes.map((c) => (r << colBits) | c));
  return { n, rowBits, colBits, rowCodes, colCodes, rowVars: vars.slice(0, rowBits), colVars: vars.slice(rowBits), cells };
}

export function codeLabel(code: number, bits: number): string {
  return code.toString(2).padStart(bits, "0");
}

export type CellValue = 0 | 1 | "x";

export interface GroupCheck {
  ok: boolean;
  /** 合法时的蕴含项 */
  implicant?: { value: number; mask: number };
  reason?: string;
  isPrime?: boolean;
}

/** 检查一个圈是否合法：大小为 2 的幂，构成一个子立方体，且不含 0 */
export function checkGroup(cells: number[], values: CellValue[], n: number): GroupCheck {
  const set = [...new Set(cells)];
  if (set.length === 0) return { ok: false, reason: "圈内没有格子" };
  const size = set.length;
  if ((size & (size - 1)) !== 0) return { ok: false, reason: `圈内有 ${size} 个格子，卡诺圈的格子数必须是 2 的整数次幂（1、2、4、8…）` };
  const zeros = set.filter((m) => values[m] === 0);
  if (zeros.length) return { ok: false, reason: `圈住了取值为 0 的格子 m${zeros.join("、m")}；与或式的卡诺圈只能圈 1 和无关项 ×` };
  let andAll = (1 << n) - 1;
  let orAll = 0;
  for (const m of set) {
    andAll &= m;
    orAll |= m;
  }
  const mask = orAll & ~andAll; // 在圈内变化的变量位
  const free = popcount(mask);
  if (1 << free !== size) {
    return { ok: false, reason: "这些格子不构成矩形相邻块：圈内有变量取值变化但没有覆盖其全部组合。注意卡诺图的相邻是“只差一个变量”，包括首尾循环相邻。" };
  }
  const value = andAll & ~mask;
  for (const m of set) if ((m & ~mask) !== value) return { ok: false, reason: "格子不在同一个子立方体内" };
  if (set.every((m) => values[m] === "x")) return { ok: true, implicant: { value, mask }, reason: "这个圈只包含无关项，对化简没有帮助" };
  return { ok: true, implicant: { value, mask } };
}

function popcount(x: number) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

export interface CoverCheck {
  /** 圈的集合是否覆盖了全部 1 */
  coversAll: boolean;
  uncovered: number[];
  invalid: { index: number; reason: string }[];
  /** 不是质蕴含项（还能扩大）的圈 */
  notPrime: number[];
  /** 多余的圈（去掉后仍覆盖全部 1） */
  redundant: number[];
  /** 与最简解比较 */
  isMinimal: boolean;
  studentCost: { terms: number; literals: number };
  minimalCost: { terms: number; literals: number };
  reference: MinimizeResult;
}

export function checkCover(groups: number[][], values: CellValue[], n: number, vars: string[]): CoverCheck {
  const ones: number[] = [];
  const dcs: number[] = [];
  values.forEach((x, i) => (x === 1 ? ones.push(i) : x === "x" ? dcs.push(i) : null));
  const reference = minimizeSOP(n, ones, dcs, vars);
  const invalid: { index: number; reason: string }[] = [];
  const imps: ({ value: number; mask: number } | null)[] = groups.map((g, i) => {
    const r = checkGroup(g, values, n);
    if (!r.ok) {
      invalid.push({ index: i, reason: r.reason! });
      return null;
    }
    return r.implicant!;
  });
  const valid = imps.filter((x): x is { value: number; mask: number } => !!x);
  const uncovered = ones.filter((m) => !valid.some((imp) => implicantCovers(imp, m)));
  const notPrime: number[] = [];
  imps.forEach((imp, i) => {
    if (!imp) return;
    const isPrime = reference.primes.some((p) => p.value === imp.value && p.mask === imp.mask);
    if (!isPrime) notPrime.push(i);
  });
  const redundant: number[] = [];
  imps.forEach((imp, i) => {
    if (!imp) return;
    const others = imps.filter((x, j) => x && j !== i) as { value: number; mask: number }[];
    if (ones.every((m) => others.some((o) => implicantCovers(o, m)))) redundant.push(i);
  });
  // 去重：同一个蕴含项圈两次
  const uniq = new Map(valid.map((x) => [`${x.value}/${x.mask}`, x]));
  const studentCost = {
    terms: uniq.size,
    literals: [...uniq.values()].reduce((s, x) => s + literalsOf(x, n), 0),
  };
  const coversAll = uncovered.length === 0 && invalid.length === 0;
  const isMinimal =
    coversAll &&
    studentCost.terms === reference.cost.terms &&
    studentCost.literals === reference.cost.literals;
  return { coversAll, uncovered, invalid, notPrime, redundant, isMinimal, studentCost, minimalCost: reference.cost, reference };
}
