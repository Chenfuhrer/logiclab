/**
 * 数模（DAC）与模数（ADC）转换 —— 模型 E：教学近似模型（纯函数）。
 *
 * 近似条件（界面上必须注明“教学近似模型”）：
 *  - 运放理想：开环增益无穷大、输入电流为 0、无失调，反相输入端为“虚地”（电位 0）；
 *  - 模拟开关理想：导通电阻为 0、断开电阻无穷大，切换无延迟；
 *  - 电阻精确匹配（权电阻严格按 2 的幂、R-2R 网络严格为 R 与 2R）；参考电压 V_REF 恒定无噪声；
 *  - 比较器理想：无失调、无延迟，v₊ ≥ v₋ 时输出 1（恰好相等记为 1）；
 *  - 积分器理想：v_O(t) = −(1/RC)∫v dt，无漏电、无失调；计数器、时钟理想；
 *  - 采样保持理想：转换期间输入电压保持不变。
 *
 * DAC 的数字量 D = Σ dᵢ·2ⁱ（d₀ 为最低位 LSB，d_{n−1} 为最高位 MSB）。
 *
 * 1) R-2R 倒 T 形：参考电流 I = V_REF/R 从 V_REF 流入网络，每经过一个节点对半分流，
 *    第 i 位 2R 支路电流 Iᵢ = I/2^{n−i}（与开关位置无关：开关只决定它流向虚地还是地）。
 *    流入求和点的电流 i_Σ = (V_REF/R)·D/2ⁿ，反相放大：
 *        v_O = −R_f·i_Σ = −(R_f/R)·V_REF·D/2ⁿ，取 R_f = R 时 v_O = −V_REF·D/2ⁿ。
 * 2) 权电阻：第 i 位电阻 Rᵢ = 2^{n−1−i}·R（MSB 为 R、LSB 为 2^{n−1}R），dᵢ = 1 时开关接 V_REF，
 *    dᵢ = 0 时接地（电阻两端都为 0 电位，电流为 0），Iᵢ = dᵢ·V_REF/Rᵢ，
 *        i_Σ = (V_REF/R)·D/2^{n−1}，v_O = −R_f·i_Σ = −(2R_f/R)·V_REF·D/2ⁿ。
 *    通行推导取 R_f = R/2，得 v_O = −V_REF·D/2ⁿ（与 R-2R 取 R_f = R 的结果相同）；
 *    若取 R_f = R，则 v_O = −V_REF·D/2^{n−1}（是前者的 2 倍）。
 *
 * ADC 量化（单极性输入 0～V_REF，n 位）：
 *  - 只舍不入：Δ = V_REF/2ⁿ，第 k 个判决电平 kΔ（k = 1…2ⁿ−1），最大量化误差 Δ；
 *  - 四舍五入：Δ = 2V_REF/(2^{n+1}−1)，第 k 个判决电平 (k − ½)Δ，最大量化误差 Δ/2（覆盖 0～V_REF 全范围）。
 *  逐次逼近、并联比较都使用同一组判决电平，因此三者给出完全相同的数字量；双积分型按计数取整，相当于只舍不入。
 */

export const CONVERTER_NOTE =
  "教学近似模型：运放、模拟开关、比较器、积分器均理想（无失调、无延迟、开关导通电阻为 0），电阻精确匹配，参考电压恒定，采样保持期间输入不变。实际转换器存在失调、增益误差、非线性与噪声，具体指标以数据手册为准。";

// ───────────────────────── 校验与工具 ─────────────────────────

function checkBits(n: number, max = 16): void {
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`位数 n 必须是 1～${max} 的整数`);
}

function checkPositive(name: string, x: number): void {
  if (typeof x !== "number" || !isFinite(x) || !(x > 0)) throw new Error(`${name} 必须是正数`);
}

function checkCode(D: number, n: number): void {
  if (!Number.isInteger(D) || D < 0 || D > 2 ** n - 1) throw new Error(`数字量 D 必须是 0～${2 ** n - 1} 的整数（n = ${n} 位）`);
}

function checkInput(vI: number, vRef: number, allowFull = true): void {
  if (typeof vI !== "number" || !isFinite(vI)) throw new Error("输入电压 v_I 必须是有限数值");
  if (vI < 0 || (allowFull ? vI > vRef : vI >= vRef))
    throw new Error(allowFull ? `输入电压 v_I 应在 0～V_REF（${vRef} V）之间` : `输入电压 v_I 应满足 0 ≤ v_I < V_REF（${vRef} V）`);
}

/** 数字量 → n 位二进制字符串（高位在左） */
export function toBits(D: number, n: number): string {
  checkBits(n, 32);
  checkCode(D, n);
  return D.toString(2).padStart(n, "0");
}

/** n 位二进制字符串 → 数字量 */
export function fromBits(bits: string): number {
  if (!/^[01]{1,16}$/.test(bits)) throw new Error("二进制码只能由 1～16 个 0/1 组成");
  return parseInt(bits, 2);
}

// ───────────────────────── DAC ─────────────────────────

export type DacKind = "weighted" | "r2r";

export interface DacInput {
  kind: DacKind;
  /** 位数 */
  n: number;
  /** 数字量 0～2ⁿ−1 */
  D: number;
  /** 参考电压（V），可正可负，不能为 0 */
  vRef: number;
  /** 单位电阻 R（Ω），默认 10 kΩ */
  R?: number;
  /** 反馈电阻 R_f（Ω）；默认按通行推导：权电阻取 R/2，R-2R 取 R */
  Rf?: number;
}

export interface DacBranch {
  /** 位号 i（0 = LSB） */
  bit: number;
  /** 该位取值 */
  d: 0 | 1;
  /** 支路电阻（Ω）：权电阻为 2^{n−1−i}R，R-2R 为 2R */
  resistance: number;
  /** 支路电流（A，按 V_REF 的符号带正负） */
  current: number;
  /** 电流是否流向运放求和点（虚地）；R-2R 中 dᵢ = 0 时流向地，权电阻中 dᵢ = 0 时电流为 0 */
  toSum: boolean;
}

export interface DacResult {
  kind: DacKind;
  n: number;
  D: number;
  vRef: number;
  R: number;
  Rf: number;
  /** 各位支路，按位号从高到低（MSB 在前） */
  branches: DacBranch[];
  /** 流入求和点的总电流 i_Σ（A） */
  iSum: number;
  /** R-2R：从 V_REF 流入网络的总电流 V_REF/R；权电阻：等于 i_Σ */
  iRef: number;
  /** 输出电压 v_O（V） */
  vO: number;
  /** 增益系数 k：v_O = −k·V_REF·D/2ⁿ（R-2R：k = R_f/R；权电阻：k = 2R_f/R） */
  k: number;
  /** 最小输出电压（D = 1 时的 |v_O|，即 1 LSB） */
  vLSB: number;
  /** 满量程输出（D = 2ⁿ−1 时的 |v_O|） */
  vFS: number;
  /** 分辨率 1/(2ⁿ−1) */
  resolution: number;
}

/** DAC 分辨率：最小输出电压与满量程输出电压之比 1/(2ⁿ−1) */
export function dacResolution(n: number): number {
  checkBits(n);
  return 1 / (2 ** n - 1);
}

export function dac(p: DacInput): DacResult {
  if (p.kind !== "weighted" && p.kind !== "r2r") throw new Error("DAC 类型只能是 weighted（权电阻）或 r2r（R-2R 倒 T 形）");
  checkBits(p.n);
  checkCode(p.D, p.n);
  if (typeof p.vRef !== "number" || !isFinite(p.vRef) || p.vRef === 0) throw new Error("参考电压 V_REF 必须是非零有限数值");
  const R = p.R ?? 10e3;
  checkPositive("电阻 R", R);
  const Rf = p.Rf ?? (p.kind === "weighted" ? R / 2 : R);
  checkPositive("反馈电阻 R_f", Rf);
  const { n, D, vRef } = p;
  const branches: DacBranch[] = [];
  let iSum = 0;
  for (let i = n - 1; i >= 0; i--) {
    const d = ((D >> i) & 1) as 0 | 1;
    if (p.kind === "r2r") {
      // 每个节点对半分流：第 i 位支路电流 (V_REF/R)/2^{n−i}
      const current = vRef / R / 2 ** (n - i);
      branches.push({ bit: i, d, resistance: 2 * R, current, toSum: d === 1 });
      if (d) iSum += current;
    } else {
      const resistance = 2 ** (n - 1 - i) * R;
      const current = d ? vRef / resistance : 0;
      branches.push({ bit: i, d, resistance, current, toSum: d === 1 });
      iSum += current;
    }
  }
  const k = p.kind === "r2r" ? Rf / R : (2 * Rf) / R;
  const vO = -Rf * iSum;
  const vLSB = (k * Math.abs(vRef)) / 2 ** n;
  return {
    kind: p.kind,
    n,
    D,
    vRef,
    R,
    Rf,
    branches,
    iSum,
    iRef: p.kind === "r2r" ? vRef / R : iSum,
    vO,
    k,
    vLSB,
    vFS: vLSB * (2 ** n - 1),
    resolution: 1 / (2 ** n - 1),
  };
}

/** R-2R 网络各节点电位（从 V_REF 一侧起：V_REF, V_REF/2, V_REF/4, …），共 n 个，对应 MSB → LSB 支路的上端 */
export function r2rNodeVoltages(n: number, vRef: number): number[] {
  checkBits(n);
  if (!isFinite(vRef) || vRef === 0) throw new Error("参考电压 V_REF 必须是非零有限数值");
  return Array.from({ length: n }, (_, j) => vRef / 2 ** j);
}

// ───────────────────────── 量化 ─────────────────────────

export type QuantMethod = "truncate" | "round";

export interface QuantSpec {
  n: number;
  vRef: number;
  method: QuantMethod;
}

/** 量化单位 Δ：只舍不入 V_REF/2ⁿ；四舍五入 2V_REF/(2^{n+1}−1) */
export function quantStep({ n, vRef, method }: QuantSpec): number {
  checkBits(n);
  checkPositive("参考电压 V_REF", vRef);
  if (method === "truncate") return vRef / 2 ** n;
  if (method === "round") return (2 * vRef) / (2 ** (n + 1) - 1);
  throw new Error("量化方式只能是 truncate（只舍不入）或 round（四舍五入）");
}

/** 最大量化误差：只舍不入为 Δ，四舍五入为 Δ/2 */
export function maxQuantError(spec: QuantSpec): number {
  const d = quantStep(spec);
  return spec.method === "truncate" ? d : d / 2;
}

/** 第 k 个判决电平（k = 1…2ⁿ−1）：v_I ≥ 该电平时数字量至少为 k */
export function decisionLevel(spec: QuantSpec, k: number): number {
  const d = quantStep(spec);
  if (!Number.isInteger(k) || k < 1 || k > 2 ** spec.n - 1) throw new Error(`判决电平序号 k 必须是 1～${2 ** spec.n - 1} 的整数`);
  return spec.method === "truncate" ? k * d : (k - 0.5) * d;
}

export interface QuantResult {
  /** 量化单位 Δ */
  delta: number;
  /** 数字量 */
  code: number;
  bits: string;
  /** 数字量代表的电压 code·Δ */
  vq: number;
  /** 量化误差 v_I − code·Δ */
  error: number;
  /** 该量化方式下的误差上限 */
  maxError: number;
}

/** 量化编码：数字量 = 不超过 v_I 的判决电平个数 */
export function quantize(vI: number, spec: QuantSpec): QuantResult {
  const delta = quantStep(spec);
  checkInput(vI, spec.vRef);
  const max = 2 ** spec.n - 1;
  const off = spec.method === "truncate" ? 0 : 0.5;
  let c = Math.min(max, Math.max(0, Math.floor(vI / delta + off)));
  // 用判决电平函数精确校正（与逐次逼近、并联比较的比较规则完全一致）
  while (c < max && decisionLevel(spec, c + 1) <= vI) c++;
  while (c > 0 && decisionLevel(spec, c) > vI) c--;
  const vq = c * delta;
  return { delta, code: c, bits: c.toString(2).padStart(spec.n, "0"), vq, error: vI - vq, maxError: maxQuantError(spec) };
}

// ───────────────────────── 逐次逼近型 ADC ─────────────────────────

export interface SarStep {
  /** 第几个时钟周期（1…n） */
  clock: number;
  /** 本拍试探的位号 */
  bit: number;
  /** 试探码（把本位置 1 后的数字量） */
  trial: number;
  trialBits: string;
  /** 内部 DAC 对试探码的输出 trial·Δ */
  vDac: number;
  /** 比较器实际比较的电压：只舍不入时等于 vDac，四舍五入时 DAC 输出下移 Δ/2 */
  vCompare: number;
  /** 比较结果：v_I ≥ vCompare */
  geq: boolean;
  /** 本位保留（1）还是舍去（0） */
  keep: boolean;
  /** 本拍结束后寄存器中的数字量 */
  after: number;
  afterBits: string;
}

export interface SarResult extends QuantResult {
  steps: SarStep[];
  /** 逐位比较所用时钟周期数（= n） */
  clocks: number;
}

/**
 * 逐次逼近：从最高位起逐位试探置 1，内部 DAC 输出与 v_I 比较，v_I ≥ 比较电压则保留该位，否则清 0。
 * n 位转换用 n 个时钟周期完成逐位比较（实际电路启动、输出另需节拍，与具体电路有关，这里不计）。
 */
export function sarConvert(vI: number, spec: QuantSpec): SarResult {
  const delta = quantStep(spec);
  checkInput(vI, spec.vRef);
  const { n } = spec;
  let reg = 0;
  const steps: SarStep[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const trial = reg | (1 << i);
    const vDac = trial * delta;
    const vCompare = spec.method === "round" ? decisionLevel(spec, trial) : vDac;
    const geq = vI >= vCompare;
    if (geq) reg = trial;
    steps.push({
      clock: n - i,
      bit: i,
      trial,
      trialBits: trial.toString(2).padStart(n, "0"),
      vDac,
      vCompare,
      geq,
      keep: geq,
      after: reg,
      afterBits: reg.toString(2).padStart(n, "0"),
    });
  }
  const vq = reg * delta;
  return { delta, code: reg, bits: reg.toString(2).padStart(n, "0"), vq, error: vI - vq, maxError: maxQuantError(spec), steps, clocks: n };
}

/** 逐次逼近型 ADC 逐位比较所需时间 n/f_CLK（理想，不计启动与输出节拍） */
export function sarConversionTime(n: number, fClk: number): number {
  checkBits(n);
  checkPositive("时钟频率 f_CLK", fClk);
  return n / fClk;
}

// ───────────────────────── 并联比较型 ADC ─────────────────────────

export interface FlashComparator {
  /** 比较器序号 k（1 = 参考电压最低） */
  k: number;
  vRef: number;
  /** v_I ≥ 参考电压时输出 1 */
  out: 0 | 1;
}

export interface FlashResult extends QuantResult {
  /** 比较器个数 2ⁿ − 1 */
  count: number;
  /** 按 k 从小到大 */
  comparators: FlashComparator[];
  /** 温度计码：从最高参考电压的比较器写到最低（左边为 C_{2ⁿ−1}） */
  thermometer: string;
}

/** 并联比较型 ADC 需要的比较器个数 */
export function flashComparatorCount(n: number): number {
  checkBits(n);
  return 2 ** n - 1;
}

/**
 * 温度计码 → 二进制（优先编码器）。outs[k−1] 为第 k 个比较器输出（k 从 1 起，参考电压递增）。
 * 输出 = 输出为 1 的最高序号；valid 表示是否为合法温度计码（低位全 1、高位全 0，中间无“气泡”）。
 */
export function thermometerToBinary(outs: (0 | 1 | boolean)[]): { code: number; valid: boolean } {
  const m = outs.length;
  if (m < 1 || !Number.isInteger(Math.log2(m + 1))) throw new Error("比较器个数必须是 2ⁿ − 1（n ≥ 1）");
  let code = 0;
  for (let k = m; k >= 1; k--)
    if (outs[k - 1]) {
      code = k;
      break;
    }
  let valid = true;
  for (let k = 1; k <= m; k++) if (Boolean(outs[k - 1]) !== k <= code) valid = false;
  return { code, valid };
}

export function flashConvert(vI: number, spec: QuantSpec): FlashResult {
  const delta = quantStep(spec);
  checkBits(spec.n, 10);
  checkInput(vI, spec.vRef);
  const count = 2 ** spec.n - 1;
  const comparators: FlashComparator[] = [];
  for (let k = 1; k <= count; k++) {
    const vRef = decisionLevel(spec, k);
    comparators.push({ k, vRef, out: vI >= vRef ? 1 : 0 });
  }
  const { code } = thermometerToBinary(comparators.map((c) => c.out));
  const thermometer = comparators
    .map((c) => String(c.out))
    .reverse()
    .join("");
  const vq = code * delta;
  return { delta, code, bits: code.toString(2).padStart(spec.n, "0"), vq, error: vI - vq, maxError: maxQuantError(spec), count, comparators, thermometer };
}

// ───────────────────────── 双积分型 ADC ─────────────────────────

export interface DualSlopeInput {
  /** 计数器位数：第一阶段固定计满 2ⁿ 个时钟 */
  n: number;
  /** 参考电压大小（V，取正值；第二阶段积分器接与 v_I 极性相反的参考电压） */
  vRef: number;
  /** 输入电压，0 ≤ v_I < V_REF */
  vI: number;
  /** 时钟频率（Hz） */
  fClk: number;
  /** 积分时间常数 RC（s） */
  RC: number;
}

export interface DualSlopeResult {
  /** 时钟周期 T_C */
  Tc: number;
  /** 第一阶段固定积分时间 T₁ = 2ⁿ·T_C */
  T1: number;
  /** 第一阶段结束时积分器输出（负值）V_P = −v_I·T₁/RC */
  vPeak: number;
  /** 第一阶段斜率 −v_I/RC（V/s） */
  slope1: number;
  /** 第二阶段斜率 +V_REF/RC（V/s） */
  slope2: number;
  /** 第二阶段反向积分时间 T₂ = |V_P|·RC/V_REF = T₁·v_I/V_REF */
  T2: number;
  /** 输出数字量 = 第二阶段计数值 N = ⌊T₂/T_C⌋ */
  count: number;
  bits: string;
  /** 量化单位 V_REF/2ⁿ */
  delta: number;
  vq: number;
  error: number;
  maxError: number;
  /** 积分器输出折线：(0,0) → (T₁, V_P) → (T₁+T₂, 0) */
  points: { t: number; v: number }[];
}

/**
 * 双积分：第一阶段对 v_I 积分固定时间 T₁ = 2ⁿT_C（计数器计满一圈后清零），
 * 第二阶段对反极性 V_REF 积分直到积分器输出回到 0，所用时间 T₂ 内的计数值就是输出数字量。
 * |V_P| = v_I·T₁/RC = V_REF·T₂/RC ⇒ T₂ = T₁·v_I/V_REF，N = 2ⁿ·v_I/V_REF（取整）——RC 被约掉。
 */
export function dualSlope(p: DualSlopeInput): DualSlopeResult {
  checkBits(p.n);
  checkPositive("参考电压 V_REF", p.vRef);
  checkPositive("时钟频率 f_CLK", p.fClk);
  checkPositive("积分时间常数 RC", p.RC);
  checkInput(p.vI, p.vRef, false);
  const Tc = 1 / p.fClk;
  const T1 = 2 ** p.n * Tc;
  const slope1 = -p.vI / p.RC;
  const vPeak = slope1 * T1;
  const slope2 = p.vRef / p.RC;
  // 第二阶段：从 V_P 以斜率 V_REF/RC 回到 0
  const T2 = -vPeak / slope2;
  // 计数器在 T₂ 内计到的完整时钟数（相对容差只用于吸收浮点舍入）
  const count = Math.min(2 ** p.n - 1, Math.floor((T2 / Tc) * (1 + 1e-12)));
  const delta = p.vRef / 2 ** p.n;
  const vq = count * delta;
  return {
    Tc,
    T1,
    vPeak,
    slope1,
    slope2,
    T2,
    count,
    bits: count.toString(2).padStart(p.n, "0"),
    delta,
    vq,
    error: p.vI - vq,
    maxError: delta,
    points: [
      { t: 0, v: 0 },
      { t: T1, v: vPeak },
      { t: T1 + T2, v: 0 },
    ],
  };
}

// ───────────────────────── 采样 ─────────────────────────

/** 采样定理：为了能从采样值恢复信号，f_s ≥ 2·f_max。返回最低采样频率 */
export function minSamplingRate(fMax: number): number {
  checkPositive("信号最高频率 f_max", fMax);
  return 2 * fMax;
}

/** 满足给定最大量化误差所需的最少位数 */
export function bitsForMaxError(vRef: number, maxErr: number, method: QuantMethod): number {
  checkPositive("参考电压 V_REF", vRef);
  checkPositive("允许的最大量化误差", maxErr);
  for (let n = 1; n <= 16; n++) if (maxQuantError({ n, vRef, method }) <= maxErr) return n;
  throw new Error("16 位以内无法满足该量化误差要求");
}
