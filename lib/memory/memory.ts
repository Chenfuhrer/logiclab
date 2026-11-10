/**
 * 半导体存储器计算库（纯函数，逻辑层/理想模型）。
 *
 *  - 容量：n 根地址线、m 根数据线 → 2ⁿ 个字 × m 位。
 *  - 扩展：位扩展（地址线、片选并联，数据线分开）、字扩展（高位地址经译码器产生片选）、
 *    字位同时扩展；给出芯片数、译码器规格、每组芯片的地址范围（十六进制）与片选线。
 *  - ROM 实现组合逻辑：多输出函数 → 地址/数据表（地址译码器产生全部最小项，存储矩阵为或阵列）。
 *
 * 约定：变量表 vars[0] 为最高位地址 A_{n-1}，与真值表约定一致（行号 = 最小项编号 = 地址）。
 * 片选 \overline{CS} 与译码器输出 \overline{Y_i} 均为低电平有效。
 */
import { type Expr, compareVarNames, sortedVariables } from "../logic/ast";
import { ParseError, parseAssignment } from "../logic/parser";
import { truthTable } from "../logic/truthtable";

// ───────────────────────── 容量 ─────────────────────────

export interface MemSpec {
  /** 字数（存储单元个数） */
  words: number;
  /** 每个字的位数 */
  bits: number;
}

/** 字数的习惯写法：1024 → "1K"，3072 → "3K"，1048576 → "1M"，256 → "256" */
export function formatWords(words: number): string {
  if (words >= 1 << 20 && words % (1 << 20) === 0) return `${words / (1 << 20)}M`;
  if (words >= 1024 && words % 1024 === 0) return `${words / 1024}K`;
  return String(words);
}

export function formatSpec(s: MemSpec): string {
  return `${formatWords(s.words)}×${s.bits}`;
}

const isPow2 = (x: number) => Number.isInteger(x) && x > 0 && (x & (x - 1)) === 0;

/** 解析 "1K×4"、"1kx4"、"256*8"、"64K×16"、"1M×8" */
export function parseSpec(src: string): MemSpec {
  const m = /^\s*(\d+)\s*([kKmM]?)\s*[×xX*]\s*(\d+)\s*$/.exec(src);
  if (!m) throw new Error(`无法识别存储器规格"${src}"，请写成"字数×位数"，例如 1K×4、256×8`);
  const mul = m[2] === "" ? 1 : m[2].toUpperCase() === "K" ? 1024 : 1 << 20;
  const spec = { words: Number(m[1]) * mul, bits: Number(m[3]) };
  validateSpec(spec, "规格");
  return spec;
}

function validateSpec(s: MemSpec, what: string, requirePow2 = true) {
  if (!Number.isInteger(s.words) || s.words < 1) throw new Error(`${what}的字数必须是正整数`);
  if (!Number.isInteger(s.bits) || s.bits < 1) throw new Error(`${what}的位数必须是正整数`);
  if (s.bits > 64) throw new Error(`${what}的位数 ${s.bits} 过大（本实验上限 64 位）`);
  if (s.words > 1 << 30) throw new Error(`${what}的字数过大（本实验上限 1G）`);
  if (requirePow2 && !isPow2(s.words)) throw new Error(`${what}的字数 ${s.words} 不是 2 的整数次幂，单片存储器的字数应为 2ⁿ`);
}

export interface Capacity {
  addressLines: number;
  dataLines: number;
  words: number;
  totalBits: number;
  /** 以字节计（位数 / 8，可能不是整数） */
  bytes: number;
  label: string;
}

/** 由地址线数 n、数据线数 m 求容量 */
export function capacity(n: number, m: number): Capacity {
  if (!Number.isInteger(n) || n < 0) throw new Error("地址线数必须是非负整数");
  if (n > 30) throw new Error("地址线数过大（本实验上限 30 根）");
  if (!Number.isInteger(m) || m < 1) throw new Error("数据线数必须是正整数");
  const words = 2 ** n;
  return { addressLines: n, dataLines: m, words, totalBits: words * m, bytes: (words * m) / 8, label: formatSpec({ words, bits: m }) };
}

/** 寻址 words 个字所需的地址线数 ⌈log₂ words⌉ */
export function addressLinesFor(words: number): number {
  if (!Number.isInteger(words) || words < 1) throw new Error("字数必须是正整数");
  let n = 0;
  while (2 ** n < words) n++;
  return n;
}

// ───────────────────────── 地址格式 ─────────────────────────

/** 十六进制，大写，补足位数 */
export function hex(x: number, digits: number): string {
  return x.toString(16).toUpperCase().padStart(digits, "0");
}

/** 地址的十六进制位数：⌈n/4⌉，至少 1 位 */
export function hexDigits(addressLines: number): number {
  return Math.max(1, Math.ceil(addressLines / 4));
}

/** 解析十六进制地址文本："9A5"、"9A5H"、"0x9A5" 均可 */
export function parseAddress(src: string): number {
  const t = src.trim().replace(/\s+/g, "");
  if (t === "") throw new Error("请输入地址");
  const m = /^(?:0[xX])?([0-9A-Fa-f]+)[hH]?$/.exec(t);
  if (m) return parseInt(m[1], 16);
  throw new Error(`无法识别地址"${src}"：请输入十六进制数，例如 9A5、9A5H 或 0x9A5`);
}

// ───────────────────────── 扩展 ─────────────────────────

export type ExpansionKind = "none" | "bit" | "word" | "both";
export const EXPANSION_TEXT: Record<ExpansionKind, string> = { none: "不需要扩展", bit: "位扩展", word: "字扩展", both: "字位同时扩展" };

export interface ChipPlacement {
  /** 编号（行优先，从 0 开始） */
  index: number;
  /** 字组号（第几组片选），0 起 */
  row: number;
  /** 位组号，0 = 最低位那一片 */
  col: number;
  /** 本片数据线接到系统数据线 D_hi…D_lo */
  dataHi: number;
  dataLo: number;
}

export interface WordGroup {
  row: number;
  start: number;
  end: number;
  startHex: string;
  endHex: string;
  /** 高位地址取值（译码器输入），二进制串；无字扩展时为空串 */
  highBits: string;
  /** 片选来源说明，例如 "\overline{Y_2}"（LaTeX）或 "外部 \overline{CS}" */
  csLatex: string;
  csText: string;
}

export interface ExpansionPlan {
  chip: MemSpec;
  target: MemSpec;
  kind: ExpansionKind;
  /** 每组字需要的片数（目标位数 / 单片位数） */
  bitGroups: number;
  /** 字组数（目标字数 / 单片字数） */
  wordGroups: number;
  chips: number;
  /** 单片地址线数（并联到所有芯片的低位地址 A_{nc-1}…A_0） */
  chipAddressLines: number;
  /** 系统地址线数 */
  addressLines: number;
  /** 参与片选译码的高位地址线数 */
  highAddressLines: number;
  /** 片选译码器；无字扩展时为 null */
  decoder: null | { inputs: number; outputs: number; label: string; used: number; unused: number[] };
  /** 系统数据线数 */
  dataLines: number;
  hexDigits: number;
  placements: ChipPlacement[];
  groups: WordGroup[];
  /** 文字步骤说明 */
  steps: string[];
}

/** 求扩展方案。target.words 必须是 chip.words 的整数倍（可以不是 2 的幂，例如用 1K×8 组成 3K×8） */
export function expansionPlan(chip: MemSpec, target: MemSpec): ExpansionPlan {
  validateSpec(chip, "单片");
  validateSpec(target, "目标存储器", false);
  if (target.words < chip.words) throw new Error(`目标字数 ${formatWords(target.words)} 小于单片字数 ${formatWords(chip.words)}，不需要扩展字数，请检查规格`);
  if (target.bits < chip.bits) throw new Error(`目标位数 ${target.bits} 小于单片位数 ${chip.bits}，不能用"扩展"得到`);
  if (target.words % chip.words !== 0) throw new Error(`目标字数 ${formatWords(target.words)} 不是单片字数 ${formatWords(chip.words)} 的整数倍`);
  if (target.bits % chip.bits !== 0) throw new Error(`目标位数 ${target.bits} 不是单片位数 ${chip.bits} 的整数倍`);
  const wordGroups = target.words / chip.words;
  const bitGroups = target.bits / chip.bits;
  if (wordGroups > 64) throw new Error(`需要 ${wordGroups} 组片选，超过本实验上限 64 组`);
  if (wordGroups * bitGroups > 256) throw new Error(`需要 ${wordGroups * bitGroups} 片，超过本实验上限 256 片`);
  const chipAddressLines = addressLinesFor(chip.words);
  const highAddressLines = addressLinesFor(wordGroups);
  const addressLines = chipAddressLines + highAddressLines;
  const kind: ExpansionKind = wordGroups === 1 ? (bitGroups === 1 ? "none" : "bit") : bitGroups === 1 ? "word" : "both";
  const digits = hexDigits(addressLines);
  const decOutputs = 2 ** highAddressLines;
  const decoder =
    wordGroups === 1
      ? null
      : {
          inputs: highAddressLines,
          outputs: decOutputs,
          label: highAddressLines === 1 ? "1 线-2 线（可用一个非门代替）" : `${highAddressLines} 线-${decOutputs} 线`,
          used: wordGroups,
          unused: Array.from({ length: decOutputs - wordGroups }, (_, i) => wordGroups + i),
        };
  const placements: ChipPlacement[] = [];
  for (let r = 0; r < wordGroups; r++)
    for (let c = 0; c < bitGroups; c++) placements.push({ index: r * bitGroups + c, row: r, col: c, dataHi: (c + 1) * chip.bits - 1, dataLo: c * chip.bits });
  const groups: WordGroup[] = [];
  for (let r = 0; r < wordGroups; r++) {
    const start = r * chip.words;
    const end = start + chip.words - 1;
    groups.push({
      row: r,
      start,
      end,
      startHex: hex(start, digits),
      endHex: hex(end, digits),
      highBits: highAddressLines ? r.toString(2).padStart(highAddressLines, "0") : "",
      csLatex: decoder ? `\\overline{Y_{${r}}}` : "\\overline{CS}",
      csText: decoder ? `Y${r}′` : "外部 CS′",
    });
  }
  const A = (i: number) => `A${i}`;
  const steps: string[] = [];
  steps.push(`单片 ${formatSpec(chip)}：${chipAddressLines} 根地址线（${chipAddressLines ? `${A(chipAddressLines - 1)}～A0` : "无"}），${chip.bits} 根数据线。`);
  steps.push(`目标 ${formatSpec(target)}：需要 ${addressLines} 根地址线、${target.bits} 根数据线。`);
  steps.push(`芯片数 = (${formatWords(target.words)}/${formatWords(chip.words)}) × (${target.bits}/${chip.bits}) = ${wordGroups} × ${bitGroups} = ${wordGroups * bitGroups} 片。`);
  if (bitGroups > 1) steps.push(`位扩展：每组 ${bitGroups} 片的地址线、R/W′、片选分别并联，数据线分开接 D${target.bits - 1}～D0（每片 ${chip.bits} 位）。`);
  if (decoder) {
    steps.push(`字扩展：低位地址 ${A(chipAddressLines - 1)}～A0 接到每片的地址端；高位地址 ${A(addressLines - 1)}${highAddressLines > 1 ? `～${A(chipAddressLines)}` : ""} 接 ${decoder.label}译码器，输出 Y0′～Y${wordGroups - 1}′ 分别作为各组的片选。`);
    if (decoder.unused.length) steps.push(`译码器输出 ${decoder.unused.map((i) => `Y${i}′`).join("、")} 不用，对应地址空间空着。`);
  }
  return {
    chip,
    target,
    kind,
    bitGroups,
    wordGroups,
    chips: wordGroups * bitGroups,
    chipAddressLines,
    addressLines,
    highAddressLines,
    decoder,
    dataLines: target.bits,
    hexDigits: digits,
    placements,
    groups,
    steps,
  };
}

export interface SelectResult {
  address: number;
  hex: string;
  /** 被选中的字组；地址落在未使用的译码输出上时为 null */
  row: number | null;
  /** 被选中的芯片编号 */
  chips: number[];
  /** 高位地址（译码器输入）二进制串 */
  highBits: string;
  /** 片内地址（低位地址） */
  offset: number;
  offsetHex: string;
}

/** 给定系统地址，判断哪一组芯片被选中 */
export function selectChip(plan: ExpansionPlan, address: number): SelectResult {
  if (!Number.isInteger(address) || address < 0) throw new Error("地址必须是非负整数");
  const max = 2 ** plan.addressLines;
  if (address >= max) throw new Error(`地址 ${hex(address, plan.hexDigits)}H 超出 ${plan.addressLines} 根地址线的范围（最大 ${hex(max - 1, plan.hexDigits)}H）`);
  const high = Math.floor(address / plan.chip.words);
  const offset = address % plan.chip.words;
  const row = high < plan.wordGroups ? high : null;
  return {
    address,
    hex: hex(address, plan.hexDigits),
    row,
    chips: row === null ? [] : plan.placements.filter((p) => p.row === row).map((p) => p.index),
    highBits: plan.highAddressLines ? high.toString(2).padStart(plan.highAddressLines, "0") : "",
    offset,
    offsetHex: hex(offset, hexDigits(plan.chipAddressLines)),
  };
}

// ───────────────────────── ROM 实现组合逻辑 ─────────────────────────

export interface RomOutput {
  name: string;
  src: string;
  expr: Expr;
}

export interface RomRow {
  /** 地址 = 最小项编号 */
  addr: number;
  /** 地址二进制串（vars[0] 在最左） */
  addrBits: string;
  /** 各输出在该地址存的位 */
  data: (0 | 1)[];
}

export interface RomTable {
  vars: string[];
  outputs: RomOutput[];
  /** 字数 2ⁿ */
  words: number;
  /** 位数 = 输出个数 */
  bits: number;
  /** 存储容量（位） */
  totalBits: number;
  rows: RomRow[];
  /** 每个输出的最小项（即该位为 1 的地址） */
  minterms: number[][];
  /** 存储矩阵中"有点"（存 1）的个数 */
  dots: number;
}

export interface RomOptions {
  /** 指定地址变量顺序（必须包含全部出现的变量） */
  vars?: string[];
  maxVars?: number;
  maxOutputs?: number;
}

/** 解析多输出函数（"Y1 = AB + C" 或只写 "AB + C"），检查名称冲突 */
export function parseOutputs(srcs: string[], opts: { vars?: string[]; maxVars: number; maxOutputs: number; defaultPrefix?: string }): { vars: string[]; outputs: RomOutput[] } {
  const prefix = opts.defaultPrefix ?? "Y";
  if (srcs.length === 0) throw new Error("至少输入一个输出函数");
  if (srcs.length > opts.maxOutputs) throw new Error(`输出函数最多 ${opts.maxOutputs} 个，当前 ${srcs.length} 个`);
  const outputs: RomOutput[] = [];
  srcs.forEach((raw, i) => {
    const src = raw.trim();
    const label = `第 ${i + 1} 个输出`;
    if (src === "") throw new Error(`${label}为空，请输入表达式`);
    let parsed: { name: string | null; expr: Expr };
    try {
      parsed = parseAssignment(src);
    } catch (e) {
      if (e instanceof ParseError) throw new Error(`${label}无法解析（第 ${e.pos + 1} 个字符附近）：${e.message}`);
      throw e;
    }
    const name = parsed.name ?? `${prefix}${srcs.length === 1 ? "" : i + 1}`;
    if (outputs.some((o) => o.name === name)) throw new Error(`输出名 ${name} 重复`);
    outputs.push({ name, src, expr: parsed.expr });
  });
  const set = new Set<string>();
  for (const o of outputs) for (const x of sortedVariables(o.expr)) set.add(x);
  let vars: string[];
  if (opts.vars) {
    const missing = [...set].filter((x) => !opts.vars!.includes(x));
    if (missing.length) throw new Error(`表达式中的变量 ${missing.join("、")} 不在指定的变量表中`);
    if (new Set(opts.vars).size !== opts.vars.length) throw new Error("变量表中有重复的变量");
    vars = [...opts.vars];
  } else vars = [...set].sort(compareVarNames);
  if (vars.length === 0) throw new Error("表达式中没有输入变量：至少需要一个变量");
  if (vars.length > opts.maxVars) throw new Error(`输入变量 ${vars.length} 个（${vars.join("、")}），超过上限 ${opts.maxVars} 个`);
  const clash = outputs.find((o) => vars.includes(o.name));
  if (clash) throw new Error(`输出名 ${clash.name} 与输入变量重名，请换一个输出名`);
  return { vars, outputs };
}

/** 由多输出函数得到 ROM 的地址/数据表：n 个变量 → 2ⁿ 个字，k 个输出 → 每字 k 位 */
export function romFromExpressions(srcs: string[], opts: RomOptions = {}): RomTable {
  const { vars, outputs } = parseOutputs(srcs, { vars: opts.vars, maxVars: opts.maxVars ?? 8, maxOutputs: opts.maxOutputs ?? 8 });
  const n = vars.length;
  const tables = outputs.map((o) => truthTable(o.expr, vars));
  const words = 2 ** n;
  const rows: RomRow[] = [];
  let dots = 0;
  for (let a = 0; a < words; a++) {
    const data = tables.map((t) => t[a] as 0 | 1);
    dots += data.filter(Boolean).length;
    rows.push({ addr: a, addrBits: a.toString(2).padStart(n, "0"), data });
  }
  const minterms = tables.map((t) => {
    const r: number[] = [];
    t.forEach((x, i) => x && r.push(i));
    return r;
  });
  return { vars, outputs, words, bits: outputs.length, totalBits: words * outputs.length, rows, minterms, dots };
}

/** 按地址读 ROM */
export function romRead(rom: RomTable, addr: number): (0 | 1)[] {
  if (!Number.isInteger(addr) || addr < 0 || addr >= rom.words) throw new Error(`地址 ${addr} 超出范围 0～${rom.words - 1}`);
  return rom.rows[addr].data;
}
