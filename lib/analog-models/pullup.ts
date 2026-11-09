/**
 * OC（集电极开路）门"线与"时上拉电阻 R_L 的取值范围 —— 电气层 · 教学近似模型（纯函数）。
 *
 * 单位：电压 V，电流 mA，电阻 kΩ（V / mA = kΩ）。电流一律输入绝对值（非负）。
 *
 * 教材通行公式（最坏情况）：
 *  · 低电平：只有 1 个 OC 门导通，它要吸收上拉电流 + m' 个负载输入的低电平电流
 *      R_min = (V_CC − V_OL(max)) / (I_OL(max) − m'·|I_IL|)
 *  · 高电平：n 个 OC 门全部截止，R_L 上流过 n 个截止漏电流 + m 个负载输入的高电平电流
 *      R_max = (V_CC − V_OH(min)) / (n·I_OH + m·I_IH)
 *
 *  m  = 高电平时的负载输入端总数（每个输入端各自流入 I_IH）
 *  m' = 低电平时的负载"等效输入数"：TTL 与非门同一个门的几个输入并联时，
 *       低电平电流只相当于一个输入（多发射极共用一个基极电阻），所以 m' 按负载门个数计；
 *       或非门各输入独立，m' 按输入端数计。
 */

export interface PullupInput {
  VCC: number;
  /** 并联（线与）的 OC 门个数 n */
  n: number;
  /** 高电平时的负载输入端总数 m */
  m: number;
  /** 低电平时的等效负载输入数 m' */
  mLow: number;
  /** OC 门输出低电平时允许的最大灌电流 I_OL(max) */
  IOL_max: number;
  /** 要求的输出低电平上限 V_OL(max) */
  VOL_max: number;
  /** 要求的输出高电平下限 V_OH(min) */
  VOH_min: number;
  /** OC 门截止时的漏电流 I_OH */
  IOH: number;
  /** 负载门高电平输入电流 I_IH */
  IIH: number;
  /** 负载门低电平输入电流 |I_IL| */
  IIL: number;
}

/** 假设参数（教学示例，不是某一器件手册值） */
export const DEFAULT_PULLUP: PullupInput = {
  VCC: 5,
  n: 2,
  m: 4,
  mLow: 2,
  IOL_max: 8,
  VOL_max: 0.4,
  VOH_min: 3.0,
  IOH: 0.1,
  IIH: 0.02,
  IIL: 0.4,
};

export type LoadGateKind = "nand" | "nor";

/**
 * 由负载结构求 m 与 m'。
 * @param gates 负载门个数
 * @param inputsPerGate 每个负载门接到线与节点上的输入端数（同一门的几个输入并联）
 * 与非门：m = gates × inputsPerGate，m' = gates；或非门：m = m' = gates × inputsPerGate。
 */
export function loadCounts(kind: LoadGateKind, gates: number, inputsPerGate: number): { m: number; mLow: number } {
  if (!Number.isInteger(gates) || gates < 0) throw new Error("负载门个数必须是非负整数");
  if (!Number.isInteger(inputsPerGate) || inputsPerGate < 1) throw new Error("每个门接入的输入端数必须是正整数");
  const m = gates * inputsPerGate;
  return { m, mLow: kind === "nand" ? gates : m };
}

export interface PullupResult {
  input: PullupInput;
  /** kΩ */
  Rmin: number;
  /** kΩ */
  Rmax: number;
  numMin: number;
  denMin: number;
  numMax: number;
  denMax: number;
  /** R_min ≤ R_max 时有可行解 */
  feasible: boolean;
  warnings: string[];
}

const LABEL: Record<keyof PullupInput, string> = {
  VCC: "V_CC",
  n: "OC 门个数 n",
  m: "负载输入端数 m",
  mLow: "低电平等效负载数 m'",
  IOL_max: "I_OL(max)",
  VOL_max: "V_OL(max)",
  VOH_min: "V_OH(min)",
  IOH: "I_OH（截止漏电流）",
  IIH: "I_IH",
  IIL: "|I_IL|",
};

export function validatePullup(p: PullupInput): string[] {
  const errs: string[] = [];
  for (const k of Object.keys(LABEL) as (keyof PullupInput)[]) {
    const v = p[k];
    if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`${LABEL[k]} 必须是有限数值`);
  }
  if (errs.length) return errs;
  if (p.VCC <= 0) errs.push("V_CC 必须大于 0");
  for (const k of ["n", "m", "mLow"] as const) {
    if (!Number.isInteger(p[k]) || p[k] < 0) errs.push(`${LABEL[k]} 必须是非负整数`);
  }
  if (p.n < 1) errs.push("OC 门个数 n 至少为 1");
  if (p.mLow > p.m) errs.push("m' 不应大于 m（低电平等效负载数不超过输入端总数）");
  for (const k of ["IOL_max", "IOH", "IIH", "IIL"] as const) {
    if (p[k] < 0) errs.push(`${LABEL[k]} 请输入绝对值（不能为负）`);
  }
  if (p.VOL_max < 0) errs.push("V_OL(max) 不能为负");
  if (p.VOL_max >= p.VCC) errs.push("V_OL(max) 必须小于 V_CC");
  if (p.VOH_min >= p.VCC) errs.push("V_OH(min) 必须小于 V_CC（否则上拉电阻上没有压降可用）");
  if (p.VOH_min <= p.VOL_max) errs.push("V_OH(min) 必须大于 V_OL(max)");
  return errs;
}

/**
 * 计算上拉电阻范围。
 * @throws Error 参数非法或分母 ≤ 0
 */
export function computePullup(p: PullupInput): PullupResult {
  const errs = validatePullup(p);
  if (errs.length) throw new Error(errs.join("；"));
  const numMin = p.VCC - p.VOL_max;
  const denMin = p.IOL_max - p.mLow * p.IIL;
  const numMax = p.VCC - p.VOH_min;
  const denMax = p.n * p.IOH + p.m * p.IIH;
  if (denMin <= 0) {
    throw new Error(
      `R_min 的分母 I_OL(max) − m'·|I_IL| = ${fmt(p.IOL_max)} − ${p.mLow}×${fmt(p.IIL)} = ${fmt(denMin)} mA ≤ 0：负载的低电平电流已超过 OC 门的灌电流能力，无论上拉电阻取多大都无法保证低电平。请减少负载或换用驱动能力更大的 OC 门。`,
    );
  }
  if (denMax <= 0) {
    throw new Error(
      `R_max 的分母 n·I_OH + m·I_IH = ${fmt(denMax)} mA ≤ 0：高电平时 R_L 上没有电流，公式给不出上限（实际 OC 门总存在漏电流，请填入 I_OH）。`,
    );
  }
  const Rmin = numMin / denMin;
  const Rmax = numMax / denMax;
  const warnings: string[] = [];
  const feasible = Rmin <= Rmax;
  if (!feasible) warnings.push(`R_min = ${fmt(Rmin)} kΩ > R_max = ${fmt(Rmax)} kΩ，没有可行的上拉电阻，需要减少负载或改变器件。`);
  return { input: p, Rmin, Rmax, numMin, denMin, numMax, denMax, feasible, warnings };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function tryComputePullup(p: PullupInput): Result<PullupResult> {
  try {
    return { ok: true, value: computePullup(p) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 去掉多余尾零的数值格式化 */
export function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  return String(Number(v.toPrecision(digits)));
}
