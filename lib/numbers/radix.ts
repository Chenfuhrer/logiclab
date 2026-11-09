/**
 * 进制转换（逻辑层，纯函数）。
 *
 * 内部用 BigInt 有理数 num/den 精确表示输入值，避免浮点误差：
 * 一个 b 进制、带 k 位小数的数，其值 = N / b^k（N 为把小数点去掉后的整数）。
 * 转换到目标进制时：整数部分用 BigInt.toString(base)，小数部分逐位"乘基数取整"，
 * 余数为 0 即精确结束；达到位数上限仍有余数则为"截断"，并给出精确误差。
 */

export type Radix = 2 | 8 | 10 | 16;
export const RADIXES: readonly Radix[] = [2, 8, 10, 16] as const;

export const RADIX_NAME: Record<Radix, string> = { 2: "二进制", 8: "八进制", 10: "十进制", 16: "十六进制" };

/** 有理数 num/den，den > 0 */
export interface Rational {
  num: bigint;
  den: bigint;
}

/** 解析结果：value = (negative ? -1 : 1) × num/den，num ≥ 0 */
export interface ParsedNumber {
  negative: boolean;
  num: bigint;
  den: bigint;
  base: Radix;
  intPart: bigint;
  /** 小数部分 = fracNum / den */
  fracNum: bigint;
}

export interface ConvertResult {
  base: Radix;
  /** 结果文本（大写十六进制，负数带 "-"） */
  text: string;
  intText: string;
  fracText: string;
  /** 小数部分是否精确表示 */
  exact: boolean;
  /** 实际输出的小数位数 */
  fracDigits: number;
  /** 截断误差（原值 − 截断值，非负，按绝对值）；exact 时为 0/1 */
  error: Rational;
  /** 误差的十进制字符串（精确，必要时最多 40 位有效小数后截断） */
  errorText: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DIGITS = "0123456789ABCDEF";
export const MAX_INPUT_LENGTH = 64;

function isRadix(b: number): b is Radix {
  return b === 2 || b === 8 || b === 10 || b === 16;
}

function assertRadix(b: number): asserts b is Radix {
  if (!isRadix(b)) throw new Error(`不支持的进制：${b}（只支持 2、8、10、16）`);
}

function digitValue(ch: string): number {
  return DIGITS.indexOf(ch.toUpperCase());
}

/**
 * 解析某进制的数（可带正负号与小数点）。
 * 允许 "0.5"、".5"、"5."；不允许空串、多个小数点、非法数字。
 * @throws Error 中文错误信息
 */
export function parseNumber(text: string, base: number): ParsedNumber {
  assertRadix(base);
  const s = text.trim().replace(/[\s_]/g, "");
  if (s === "") throw new Error("请输入一个数");
  if (s.length > MAX_INPUT_LENGTH) throw new Error(`输入过长（最多 ${MAX_INPUT_LENGTH} 个字符）`);
  let body = s;
  let negative = false;
  if (body[0] === "-" || body[0] === "+") {
    negative = body[0] === "-";
    body = body.slice(1);
  }
  const dots = body.split(".").length - 1;
  if (dots > 1) throw new Error("小数点多于一个");
  const [intStr = "", fracStr = ""] = body.split(".");
  if (intStr === "" && fracStr === "") throw new Error("没有数字");
  const allowed = DIGITS.slice(0, base);
  for (const ch of intStr + fracStr) {
    const v = digitValue(ch);
    if (v < 0 || v >= base) {
      throw new Error(`“${ch}”不是合法的${RADIX_NAME[base]}数字（只允许 ${allowed.length > 10 ? "0–9、A–F" : `0–${allowed[allowed.length - 1]}`}）`);
    }
  }
  const B = BigInt(base);
  let intPart = 0n;
  for (const ch of intStr) intPart = intPart * B + BigInt(digitValue(ch));
  let fracNum = 0n;
  for (const ch of fracStr) fracNum = fracNum * B + BigInt(digitValue(ch));
  const den = B ** BigInt(fracStr.length);
  const num = intPart * den + fracNum;
  if (num === 0n) negative = false;
  return { negative, num, den, base, intPart, fracNum };
}

export function tryParseNumber(text: string, base: number): Result<ParsedNumber> {
  try {
    return { ok: true, value: parseNumber(text, base) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export function reduce(r: Rational): Rational {
  if (r.num === 0n) return { num: 0n, den: 1n };
  const g = gcd(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

/** 有理数 → 十进制字符串；不能在 maxDigits 位内结束时以 "…" 结尾 */
export function rationalToDecimal(r: Rational, maxDigits = 40): string {
  const { num, den } = reduce(r);
  const neg = num < 0n;
  const n = neg ? -num : num;
  const ip = n / den;
  let rem = n % den;
  let frac = "";
  while (rem !== 0n && frac.length < maxDigits) {
    rem *= 10n;
    frac += (rem / den).toString();
    rem %= den;
  }
  return (neg ? "-" : "") + ip.toString() + (frac ? "." + frac : "") + (rem !== 0n ? "…" : "");
}

/** 有理数 → 浮点近似（用于科学计数法显示） */
export function rationalToNumber(r: Rational): number {
  // 先按数量级缩放出约 17 位有效数字再转 Number，避免极小/极大值丢失精度
  const { num, den } = reduce(r);
  if (num === 0n) return 0;
  const neg = num < 0n;
  const n = neg ? -num : num;
  const k = den.toString().length - n.toString().length + 17;
  const scaled = k >= 0 ? (n * 10n ** BigInt(k)) / den : n / (den * 10n ** BigInt(-k));
  const v = Number(scaled) * 10 ** -k;
  return neg ? -v : v;
}

/**
 * 把解析结果转换到目标进制。
 * @param maxFrac 小数部分最多输出位数（≥0，≤64）
 */
export function toBase(value: ParsedNumber, base: number, maxFrac = 12): ConvertResult {
  assertRadix(base);
  if (!Number.isInteger(maxFrac) || maxFrac < 0 || maxFrac > 64) throw new Error("小数位数上限必须是 0～64 的整数");
  const B = BigInt(base);
  const intText = value.intPart.toString(base).toUpperCase();
  let rem = value.fracNum;
  const den = value.den;
  let fracText = "";
  while (rem !== 0n && fracText.length < maxFrac) {
    rem *= B;
    const d = rem / den;
    fracText += DIGITS[Number(d)];
    rem %= den;
  }
  const exact = rem === 0n;
  // 剩余误差 = rem / (den × B^位数)
  const error = reduce({ num: rem, den: den * B ** BigInt(fracText.length) });
  const text = (value.negative ? "-" : "") + intText + (fracText ? "." + fracText : "");
  return { base, text, intText, fracText, exact, fracDigits: fracText.length, error, errorText: rationalToDecimal(error) };
}

/** 一步到位：文本 + 源进制 → 目标进制。目标为十进制时自动放宽位数上限（2/8/16 进制小数转十进制总是有限小数）。 */
export function convert(text: string, from: number, to: number, maxFrac = 12): ConvertResult {
  const v = parseNumber(text, from);
  return toBase(v, to, to === 10 ? Math.max(maxFrac, 64) : maxFrac);
}

export function tryConvert(text: string, from: number, to: number, maxFrac = 12): Result<ConvertResult> {
  try {
    return { ok: true, value: convert(text, from, to, maxFrac) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ───────────────── 逐步过程 ───────────────── */

export interface DivisionStep {
  dividend: bigint;
  quotient: bigint;
  remainder: number;
  /** 该余数是第几位（0 = 最低位） */
  bitIndex: number;
}

/** 整数部分"除基数取余"：余数自下而上（先得到的是最低位） */
export function divisionSteps(n: bigint, base: number): DivisionStep[] {
  assertRadix(base);
  if (n < 0n) throw new Error("除基取余只对非负整数部分进行");
  const B = BigInt(base);
  const steps: DivisionStep[] = [];
  let x = n;
  let i = 0;
  if (x === 0n) return [{ dividend: 0n, quotient: 0n, remainder: 0, bitIndex: 0 }];
  while (x > 0n) {
    steps.push({ dividend: x, quotient: x / B, remainder: Number(x % B), bitIndex: i++ });
    x /= B;
  }
  return steps;
}

export interface MultiplyStep {
  /** 本步的小数 (fraction = num/den) */
  fraction: Rational;
  /** 乘以基数后的积 */
  product: Rational;
  /** 取出的整数位 */
  digit: number;
  /** 第几位小数（1 = 小数点后第一位，权 base^-1） */
  position: number;
}

export interface MultiplyResult {
  steps: MultiplyStep[];
  exact: boolean;
  /** 截断后剩余的小数（未取完部分）为 rest/den，即误差 = rest/(den·base^N) */
  rest: Rational;
}

/** 小数部分"乘基数取整"：取整得到的位自上而下（先得到的是最高位） */
export function multiplySteps(fracNum: bigint, den: bigint, base: number, maxDigits: number): MultiplyResult {
  assertRadix(base);
  if (den <= 0n || fracNum < 0n || fracNum >= den) throw new Error("小数部分必须满足 0 ≤ 小数 < 1");
  if (!Number.isInteger(maxDigits) || maxDigits < 0 || maxDigits > 64) throw new Error("位数上限必须是 0～64 的整数");
  const B = BigInt(base);
  const steps: MultiplyStep[] = [];
  let rem = fracNum;
  while (rem !== 0n && steps.length < maxDigits) {
    const p = rem * B;
    const d = p / den;
    steps.push({ fraction: { num: rem, den }, product: { num: p, den }, digit: Number(d), position: steps.length + 1 });
    rem = p % den;
  }
  return { steps, exact: rem === 0n, rest: { num: rem, den } };
}

export function digitChar(d: number): string {
  return DIGITS[d] ?? "?";
}
