/**
 * 同步时序电路的建立 / 保持时间检查 —— 带延迟模型 · 教学近似（纯函数）。
 *
 * 单位：ns；频率 MHz（1000 / T[ns]）。
 *
 * 路径：发射触发器 FF1 --(t_pd: CLK→Q)--> 组合逻辑 --(t_comb)--> 捕获触发器 FF2 的 D 端。
 *
 * 时钟偏斜符号约定：
 *   t_skew = t_clk(FF2) − t_clk(FF1)，即"捕获触发器的时钟沿比发射触发器晚到多少"。
 *   t_skew > 0：捕获沿推迟，对建立时间有利、对保持时间不利；t_skew < 0 反之。
 *
 * 建立：t_pd + t_comb,max + t_su ≤ T + t_skew      ⇒ T_min = t_pd + t_comb,max + t_su − t_skew
 * 保持：t_pd + t_comb,min ≥ t_h + t_skew           ⇒ 保持裕量 = t_pd + t_comb,min − t_h − t_skew ≥ 0
 *
 * 简化：保持检查严格说应使用 CLK→Q 的最小延迟（污染延迟），此处与建立检查共用一个 t_pd。
 */

export interface TimingInput {
  /** 触发器 CLK→Q 延迟 */
  tpd: number;
  /** 组合逻辑最大延迟 */
  tcombMax: number;
  /** 组合逻辑最小延迟 */
  tcombMin: number;
  /** 建立时间 */
  tsu: number;
  /** 保持时间（部分器件可为负） */
  th: number;
  /** 时钟偏斜 = t_clk(捕获) − t_clk(发射)，可正可负 */
  tskew: number;
  /** 实际时钟周期（可选，用于计算建立裕量），> 0 */
  T?: number;
}

/** 示例参数（假设值，不对应特定器件） */
export const DEFAULT_TIMING: Required<TimingInput> = {
  tpd: 15,
  tcombMax: 20,
  tcombMin: 5,
  tsu: 20,
  th: 5,
  tskew: 0,
  T: 80,
};

export interface TimingResult {
  input: TimingInput;
  /** 最小周期 ns */
  Tmin: number;
  /** 最高频率 MHz */
  fmax: number;
  /** 用于建立裕量计算的周期（未给出时取 T_min） */
  T: number;
  /** 建立裕量 = T + t_skew − (t_pd + t_comb,max + t_su) */
  setupSlack: number;
  /** 保持裕量 = t_pd + t_comb,min − t_h − t_skew */
  holdSlack: number;
  /** 最晚数据到达（相对发射沿） */
  arrivalMax: number;
  /** 最早数据变化（相对发射沿） */
  arrivalMin: number;
  setupOk: boolean;
  holdOk: boolean;
  warnings: string[];
}

function finite(name: string, v: unknown): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} 必须是有限数值`);
}

export function validateTiming(p: TimingInput): string[] {
  const errs: string[] = [];
  const fields: [string, unknown][] = [
    ["t_pd", p.tpd],
    ["t_comb,max", p.tcombMax],
    ["t_comb,min", p.tcombMin],
    ["t_su", p.tsu],
    ["t_h", p.th],
    ["t_skew", p.tskew],
  ];
  for (const [n, v] of fields) {
    try {
      finite(n, v);
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  if (errs.length) return errs;
  if (p.tpd < 0) errs.push("t_pd 不能为负");
  if (p.tcombMax < 0 || p.tcombMin < 0) errs.push("组合逻辑延迟不能为负");
  if (p.tcombMin > p.tcombMax) errs.push("t_comb,min 不能大于 t_comb,max");
  if (p.tsu < 0) errs.push("t_su 不能为负（本模型）");
  if (p.T !== undefined) {
    if (typeof p.T !== "number" || !Number.isFinite(p.T)) errs.push("时钟周期 T 必须是有限数值");
    else if (p.T <= 0) errs.push("时钟周期 T 必须大于 0");
  }
  return errs;
}

/** @throws Error 参数非法或 T_min ≤ 0 */
export function computeTiming(p: TimingInput): TimingResult {
  const errs = validateTiming(p);
  if (errs.length) throw new Error(errs.join("；"));
  const arrivalMax = p.tpd + p.tcombMax;
  const arrivalMin = p.tpd + p.tcombMin;
  const Tmin = arrivalMax + p.tsu - p.tskew;
  if (Tmin <= 0) {
    throw new Error(`T_min = ${round(Tmin)} ns ≤ 0：时钟偏斜 t_skew 过大（捕获沿推迟超过整条路径延迟），参数不合理`);
  }
  const T = p.T ?? Tmin;
  const setupSlack = T + p.tskew - (arrivalMax + p.tsu);
  const holdSlack = arrivalMin - p.th - p.tskew;
  const EPS = 1e-9;
  const setupOk = setupSlack >= -EPS;
  const holdOk = holdSlack >= -EPS;
  const warnings: string[] = [];
  if (!setupOk) warnings.push(`建立时间违例：周期 T = ${round(T)} ns 小于 T_min = ${round(Tmin)} ns，需降低时钟频率或缩短组合逻辑最长路径。`);
  if (!holdOk)
    warnings.push("保持时间违例：最短路径上的数据在捕获沿之后太早改变。降低时钟频率无法解决，需在最短路径上插入延迟或减小时钟偏斜。");
  return { input: p, Tmin, fmax: 1000 / Tmin, T, setupSlack, holdSlack, arrivalMax, arrivalMin, setupOk, holdOk, warnings };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function tryComputeTiming(p: TimingInput): Result<TimingResult> {
  try {
    return { ok: true, value: computeTiming(p) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function round(v: number, digits = 4): string {
  return String(Number(v.toPrecision(digits)));
}
