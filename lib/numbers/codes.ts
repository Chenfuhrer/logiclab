/**
 * 常用编码：8421BCD、2421（"5～9 用 1011～1111"的通行编码）、余 3 码、格雷码（逻辑层，纯函数）。
 * 位串约定：左端为最高位。格雷码下标：B_{n−1}…B_0、G_{n−1}…G_0。
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function checkDigit(d: number) {
  if (!Number.isInteger(d) || d < 0 || d > 9) throw new Error(`十进制数码必须是 0～9 的整数，收到 ${d}`);
}

const bits4 = (v: number) => v.toString(2).padStart(4, "0");

export function encode8421(d: number): string {
  checkDigit(d);
  return bits4(d);
}

/** 2421 码（自补码）：0～4 为 0000～0100，5～9 为 1011～1111 */
export function encode2421(d: number): string {
  checkDigit(d);
  return bits4(d < 5 ? d : d + 6);
}

/** 余 3 码 = 8421 码 + 0011 */
export function encodeExcess3(d: number): string {
  checkDigit(d);
  return bits4(d + 3);
}

export interface CodeRow {
  digit: number;
  bcd8421: string;
  c2421: string;
  excess3: string;
}

export const CODE_TABLE: readonly CodeRow[] = Array.from({ length: 10 }, (_, d) => ({
  digit: d,
  bcd8421: encode8421(d),
  c2421: encode2421(d),
  excess3: encodeExcess3(d),
}));

/** 按权展开解码 2421 码（检验用） */
export function decode2421(bits: string): number {
  if (!/^[01]{4}$/.test(bits)) throw new Error("2421 码必须是 4 位二进制");
  const w = [2, 4, 2, 1];
  return [...bits].reduce((s, b, i) => s + Number(b) * w[i], 0);
}

export interface BcdDigit {
  digit: number;
  code: string;
}

export const MAX_BCD_DIGITS = 20;

/** 十进制数（非负，可带小数点）→ 每位 8421BCD */
export function decimalToBCD(text: string): { intDigits: BcdDigit[]; fracDigits: BcdDigit[]; text: string } {
  const s = text.trim();
  if (s === "") throw new Error("请输入一个十进制数");
  if (s.startsWith("-")) throw new Error("8421BCD 这里只对非负数编码（符号需另加符号位）");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`“${s}”不是合法的非负十进制数`);
  const [ip, fp = ""] = s.split(".");
  if (ip.length + fp.length > MAX_BCD_DIGITS) throw new Error(`最多 ${MAX_BCD_DIGITS} 位数字`);
  const map = (str: string) => [...str].map((c) => ({ digit: Number(c), code: encode8421(Number(c)) }));
  const intDigits = map(ip);
  const fracDigits = map(fp);
  const join = (ds: BcdDigit[]) => ds.map((d) => d.code).join(" ");
  return { intDigits, fracDigits, text: join(intDigits) + (fracDigits.length ? " . " + join(fracDigits) : "") };
}

export function tryDecimalToBCD(text: string): Result<ReturnType<typeof decimalToBCD>> {
  try {
    return { ok: true, value: decimalToBCD(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ───────────────── 格雷码 ───────────────── */

export const MAX_GRAY_BITS = 16;

function checkBits(bits: string, name: string): string {
  const s = bits.trim().replace(/\s+/g, "");
  if (s === "") throw new Error(`请输入${name}`);
  if (!/^[01]+$/.test(s)) throw new Error(`${name}只能包含 0 和 1`);
  if (s.length > MAX_GRAY_BITS) throw new Error(`${name}最多 ${MAX_GRAY_BITS} 位`);
  return s;
}

export interface GrayStep {
  /** 位下标 i（n−1 为最高位） */
  i: number;
  /** 高一位：二进制→格雷码时为 B_{i+1}；格雷码→二进制时为已求出的 B_{i+1}；最高位为 null */
  higher: number | null;
  /** 本位输入：B_i 或 G_i */
  input: number;
  /** 本位输出：G_i 或 B_i */
  output: number;
}

export interface GrayResult {
  input: string;
  output: string;
  steps: GrayStep[];
}

/** 二进制 → 格雷码：G_{n−1} = B_{n−1}，G_i = B_{i+1} ⊕ B_i */
export function binaryToGray(bitsIn: string): GrayResult {
  const b = checkBits(bitsIn, "二进制数");
  const n = b.length;
  const steps: GrayStep[] = [];
  let out = "";
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k;
    const bi = Number(b[k]);
    const higher = k === 0 ? null : Number(b[k - 1]);
    const g = higher === null ? bi : higher ^ bi;
    steps.push({ i, higher, input: bi, output: g });
    out += g;
  }
  return { input: b, output: out, steps };
}

/** 格雷码 → 二进制：B_{n−1} = G_{n−1}，B_i = B_{i+1} ⊕ G_i（从高位往低位逐位求） */
export function grayToBinary(grayIn: string): GrayResult {
  const g = checkBits(grayIn, "格雷码");
  const n = g.length;
  const steps: GrayStep[] = [];
  let out = "";
  let prev: number | null = null;
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k;
    const gi = Number(g[k]);
    const b: number = prev === null ? gi : prev ^ gi;
    steps.push({ i, higher: prev, input: gi, output: b });
    out += b;
    prev = b;
  }
  return { input: g, output: out, steps };
}

export function tryGray(dir: "b2g" | "g2b", bits: string): Result<GrayResult> {
  try {
    return { ok: true, value: dir === "b2g" ? binaryToGray(bits) : grayToBinary(bits) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** n 位格雷码序列（第 k 项 = k ⊕ (k >> 1)） */
export function graySequence(n: number): string[] {
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error("序列位数必须是 1～6 的整数");
  return Array.from({ length: 2 ** n }, (_, k) => (k ^ (k >> 1)).toString(2).padStart(n, "0"));
}

/** 两个等长位串中不同的位的下标（以字符串位置计，0 = 最高位） */
export function diffPositions(a: string, b: string): number[] {
  if (a.length !== b.length) throw new Error("两个位串必须等长");
  const out: number[] = [];
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) out.push(k);
  return out;
}
