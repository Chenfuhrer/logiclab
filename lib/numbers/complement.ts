/**
 * 原码 / 反码 / 补码与补码加减法（逻辑层，纯函数）。
 * 位串约定：字符串左端为最高位（符号位）b_{n-1}，右端为 b_0。
 */

export type Width = 4 | 8 | 16;
export const WIDTHS: readonly Width[] = [4, 8, 16] as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function assertWidth(n: number): asserts n is Width {
  if (n !== 4 && n !== 8 && n !== 16) throw new Error(`位数只能是 4、8 或 16，收到 ${n}`);
}

/** 补码表示范围 [−2^{n−1}, 2^{n−1}−1] */
export function twosRange(n: number): { min: number; max: number } {
  assertWidth(n);
  return { min: -(2 ** (n - 1)), max: 2 ** (n - 1) - 1 };
}

/** 原码、反码表示范围 [−(2^{n−1}−1), 2^{n−1}−1]（含 +0、−0 两种零） */
export function smRange(n: number): { min: number; max: number } {
  assertWidth(n);
  return { min: -(2 ** (n - 1) - 1), max: 2 ** (n - 1) - 1 };
}

function toBits(u: number, n: number): string {
  return u.toString(2).padStart(n, "0");
}

export function invertBits(bits: string): string {
  return bits.replace(/[01]/g, (c) => (c === "0" ? "1" : "0"));
}

export interface IntInput {
  value: number;
  /** 输入为 "-0"（原码/反码区分 ±0） */
  negativeZero: boolean;
}

/** 解析十进制整数文本（允许正负号；拒绝小数、空串、非数字） */
export function parseDecimalInt(text: string): IntInput {
  const s = text.trim();
  if (s === "") throw new Error("请输入一个十进制整数");
  if (!/^[+-]?\d+$/.test(s)) {
    if (/^[+-]?\d*\.\d*$/.test(s)) throw new Error("只能输入整数（补码这里讨论定点整数）");
    throw new Error(`“${s}”不是十进制整数`);
  }
  const value = Number(s);
  if (!Number.isSafeInteger(value)) throw new Error("数值过大");
  return { value: value === 0 ? 0 : value, negativeZero: /^-0+$/.test(s) };
}

/** 原码：符号位 + 绝对值；超出范围返回 null */
export function signMagnitude(x: number, n: number, negativeZero = false): string | null {
  assertWidth(n);
  if (!Number.isInteger(x)) throw new Error("必须是整数");
  const { min, max } = smRange(n);
  if (x < min || x > max) return null;
  const sign = x < 0 || (x === 0 && negativeZero) ? "1" : "0";
  return sign + toBits(Math.abs(x), n - 1);
}

/** 反码：正数同原码；负数为原码除符号位外逐位取反 */
export function onesComplement(x: number, n: number, negativeZero = false): string | null {
  const sm = signMagnitude(x, n, negativeZero);
  if (sm === null) return null;
  if (sm[0] === "0") return sm;
  return "1" + invertBits(sm.slice(1));
}

/** 补码：正数同原码；负数为 2^n − |x|（= 反码 + 1）；超出范围返回 null */
export function twosComplement(x: number, n: number): string | null {
  assertWidth(n);
  if (!Number.isInteger(x)) throw new Error("必须是整数");
  const { min, max } = twosRange(n);
  if (x < min || x > max) return null;
  return toBits(x < 0 ? 2 ** n + x : x, n);
}

/** 补码位串 → 十进制真值 */
export function fromTwos(bits: string): number {
  if (!/^[01]+$/.test(bits)) throw new Error("补码位串只能包含 0 和 1");
  const u = parseInt(bits, 2);
  return bits[0] === "1" ? u - 2 ** bits.length : u;
}

export interface Encodings {
  n: Width;
  value: number;
  sm: string | null;
  ones: string | null;
  twos: string | null;
  notes: string[];
}

export function encodeAll(x: number, n: number, negativeZero = false): Encodings {
  assertWidth(n);
  const notes: string[] = [];
  const sm = signMagnitude(x, n, negativeZero);
  const ones = onesComplement(x, n, negativeZero);
  const twos = twosComplement(x, n);
  const r = smRange(n);
  const t = twosRange(n);
  if (sm === null) notes.push(`原码、反码的 ${n} 位表示范围是 ${r.min}～+${r.max}，${x} 超出范围`);
  if (twos === null) notes.push(`补码的 ${n} 位表示范围是 ${t.min}～+${t.max}，${x} 超出范围`);
  if (x === t.min) notes.push(`${x} 只有补码能表示（${"1" + "0".repeat(n - 1)}），原码、反码无法表示`);
  if (x === 0) notes.push(negativeZero ? "−0：原码 1 00…0、反码 1 11…1；补码中 −0 与 +0 相同，都是 00…0" : "补码中零只有一种表示 00…0；原码、反码有 +0 与 −0 两种");
  return { n, value: x, sm, ones, twos, notes };
}

/* ───────────────── 补码加减法 ───────────────── */

export interface AddColumns {
  /** 被加数位串 */
  a: string;
  /** 加数位串（减法时为 [−B]补 或 B̄） */
  b: string;
  /** carries[i] = C_i，进入第 i 位的进位；carries[0] = C_0（进位输入），carries[n] = C_n */
  carries: number[];
  /** 和位串 */
  sum: string;
}

/** 逐位相加（行波进位）。位串左端为最高位。 */
export function addBits(a: string, b: string, cin: 0 | 1 = 0): AddColumns {
  if (a.length !== b.length || !/^[01]+$/.test(a) || !/^[01]+$/.test(b)) throw new Error("两个位串必须等长且只含 0/1");
  const n = a.length;
  const carries: number[] = new Array(n + 1).fill(0);
  carries[0] = cin;
  const s: string[] = new Array(n).fill("0");
  for (let i = 0; i < n; i++) {
    const ai = Number(a[n - 1 - i]);
    const bi = Number(b[n - 1 - i]);
    const t = ai + bi + carries[i];
    s[n - 1 - i] = String(t & 1);
    carries[i + 1] = t >> 1;
  }
  return { a, b, carries, sum: s.join("") };
}

export interface TwosOpResult extends AddColumns {
  n: Width;
  op: "add" | "sub";
  A: number;
  B: number;
  /** C_n：最高位（符号位）产生的进位 */
  cn: number;
  /** C_{n−1}：次高位进入符号位的进位 */
  cn1: number;
  /** V = C_n ⊕ C_{n−1} */
  overflow: boolean;
  /** 按 n 位补码解释和位串得到的值 */
  resultValue: number;
  /** 数学上的真值 A ± B */
  trueValue: number;
  /** 减法时加数的说明 */
  addendLabel: string;
  notes: string[];
}

function checkOperand(x: number, n: Width, name: string) {
  if (!Number.isInteger(x)) throw new Error(`${name} 必须是整数`);
  const { min, max } = twosRange(n);
  if (x < min || x > max) throw new Error(`${name} = ${x} 超出 ${n} 位补码范围 [${min}, ${max}]`);
}

function finish(n: Width, op: "add" | "sub", A: number, B: number, cols: AddColumns, addendLabel: string, notes: string[]): TwosOpResult {
  const cn = cols.carries[n];
  const cn1 = cols.carries[n - 1];
  const overflow = (cn ^ cn1) === 1;
  const trueValue = op === "add" ? A + B : A - B;
  const resultValue = fromTwos(cols.sum);
  if (overflow) {
    notes.push(
      `Cₙ = ${cn}，Cₙ₋₁ = ${cn1}，V = 1：溢出。真值 ${trueValue} 超出 ${n} 位补码范围，和位串按补码读作 ${resultValue}（错误）`,
    );
  } else {
    notes.push(`Cₙ = ${cn}，Cₙ₋₁ = ${cn1}，V = 0：无溢出${cn === 1 ? "；Cₙ = 1 的进位直接丢弃，不代表溢出" : ""}`);
  }
  return { ...cols, n, op, A, B, cn, cn1, overflow, resultValue, trueValue, addendLabel, notes };
}

/** [A]补 + [B]补 */
export function addTwos(A: number, B: number, n: number): TwosOpResult {
  assertWidth(n);
  checkOperand(A, n, "A");
  checkOperand(B, n, "B");
  const cols = addBits(twosComplement(A, n)!, twosComplement(B, n)!, 0);
  return finish(n, "add", A, B, cols, "[B]补", []);
}

/**
 * [A−B]补 = [A]补 + [−B]补。
 * 若 B = −2^{n−1}，−B 不能用 n 位补码表示，此时按硬件做法：A + B̄ + 1（取反后令 C_0 = 1）。
 */
export function subTwos(A: number, B: number, n: number): TwosOpResult {
  assertWidth(n);
  checkOperand(A, n, "A");
  checkOperand(B, n, "B");
  const a = twosComplement(A, n)!;
  const negB = twosComplement(-B, n);
  if (negB !== null) {
    const cols = addBits(a, negB, 0);
    return finish(n, "sub", A, B, cols, "[−B]补", [`[−B]补 = [${-B}]补 = ${negB}（把 [B]补 连同符号位逐位取反再加 1）`]);
  }
  const bInv = invertBits(twosComplement(B, n)!);
  const cols = addBits(a, bInv, 1);
  return finish(n, "sub", A, B, cols, "B̄（C₀=1）", [
    `B = ${B} 时 −B = ${-B} 超出 ${n} 位补码范围，无法写出 [−B]补；改用硬件做法：A + B̄ + 1，即加数取 B 的逐位取反 ${bInv}，最低位进位输入 C₀ = 1`,
  ]);
}

export function tryOp(op: "add" | "sub", A: number, B: number, n: number): Result<TwosOpResult> {
  try {
    return { ok: true, value: op === "add" ? addTwos(A, B, n) : subTwos(A, B, n) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function tryParseDecimalInt(text: string): Result<IntInput> {
  try {
    return { ok: true, value: parseDecimalInt(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 位串按 4 位分组显示 */
export function groupBits(bits: string, size = 4): string {
  const out: string[] = [];
  for (let i = bits.length; i > 0; i -= size) out.unshift(bits.slice(Math.max(0, i - size), i));
  return out.join(" ");
}
