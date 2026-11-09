/**
 * 555 定时器 —— 模型 E：教学近似模型（纯函数）。
 *
 * 近似条件（界面上必须注明“教学近似模型”）：
 *  - 内部 3 个等值电阻分压：未接控制端 CO 时，上阈值 V_U = 2/3·V_CC（阈值比较器 C1），下阈值 V_L = 1/3·V_CC（触发比较器 C2）；
 *    CO 外加电压 V_CO 时，V_U = V_CO，V_L = V_CO/2；
 *  - 比较器、RS 锁存器理想（无延迟、无失调），放电管 T_D 导通电阻为 0、截止时漏电为 0；
 *  - 忽略 TH、TR 端输入电流与输出级压降：输出高电平 = V_CC，低电平 = 0；
 *  - 电容按理想 RC 指数规律充放电：v(t) = V∞ + (v0 − V∞)·e^{−t/τ}。
 *
 * 功能表（依据 TI NE555 数据手册功能表的逻辑关系）：
 *   \overline{R_D} = 0                          → 输出 0，放电管导通
 *   v_TR < V_L（不论 v_TH）                      → 输出 1，放电管截止（触发端优先）
 *   v_TR > V_L 且 v_TH > V_U                     → 输出 0，放电管导通
 *   v_TR > V_L 且 v_TH < V_U                     → 保持原状态
 *
 * 引脚（DIP-8）：1 GND，2 \overline{TR}（触发），3 OUT，4 \overline{R_D}（复位），5 CO（控制电压），6 TH（阈值），7 D（放电），8 V_CC。
 */

export const MODEL_E_NOTE =
  "教学近似模型：比较器与锁存器理想，放电管导通电阻为 0，忽略 TH/TR 输入电流与输出级压降；阈值由内部 3 个等值电阻分压决定。实际器件的阈值精度、放电管饱和压降与输出高电平均有偏差，以数据手册为准。";

export interface Thresholds {
  /** 上阈值（阈值比较器 C1 的参考） */
  upper: number;
  /** 下阈值（触发比较器 C2 的参考） */
  lower: number;
}

export function thresholds(Vcc: number, Vco?: number): Thresholds {
  if (!(Vcc > 0)) throw new Error("V_CC 必须大于 0");
  if (Vco !== undefined) {
    if (!(Vco > 0 && Vco < Vcc)) throw new Error("控制电压 V_CO 应在 0 与 V_CC 之间");
    return { upper: Vco, lower: Vco / 2 };
  }
  return { upper: (2 * Vcc) / 3, lower: Vcc / 3 };
}

/** 555 内部锁存器：返回新的输出状态（1 = 输出高、放电管截止） */
export function latch555(q: 0 | 1, inp: { reset: 0 | 1; vTH: number; vTR: number }, th: Thresholds): 0 | 1 {
  if (inp.reset === 0) return 0;
  if (inp.vTR < th.lower) return 1;
  if (inp.vTH > th.upper) return 0;
  return q;
}

/** 从 v0 向 vInf 按时间常数 tau 变化，到达 vTarget 需要的时间；到达不了返回 Infinity */
export function rcTimeTo(v0: number, vInf: number, tau: number, vTarget: number): number {
  if (v0 === vTarget) return 0;
  const a = (vInf - v0) / (vInf - vTarget);
  if (!(a > 1) || !isFinite(a)) return Infinity;
  return tau * Math.log(a);
}

export function rcValue(v0: number, vInf: number, tau: number, t: number): number {
  return vInf + (v0 - vInf) * Math.exp(-t / tau);
}

export interface Segment {
  t0: number;
  t1: number;
  v0: number;
  vInf: number;
  tau: number;
  /** 本段输出 */
  out: 0 | 1;
}

export function vcAt(segs: Segment[], t: number): number {
  const s = segs.find((x) => t >= x.t0 && t <= x.t1) ?? segs[segs.length - 1];
  return rcValue(s.v0, s.vInf, s.tau, Math.min(t, s.t1) - s.t0);
}

function positive(name: string, x: number) {
  if (!(x > 0) || !isFinite(x)) throw new Error(`${name} 必须是正数`);
}

// ───────────────────────── 多谐振荡器 ─────────────────────────

export interface AstableInput {
  Vcc: number;
  /** 接在 V_CC 与放电端之间 */
  R1: number;
  /** 接在放电端与 TH/TR 之间 */
  R2: number;
  C: number;
  Vco?: number;
  cycles?: number;
}

export interface AstableResult {
  th: Thresholds;
  /** 充电时间常数 (R1+R2)C */
  tauCharge: number;
  /** 放电时间常数 R2·C */
  tauDischarge: number;
  /** 输出高电平时间 */
  tH: number;
  /** 输出低电平时间 */
  tL: number;
  T: number;
  f: number;
  /** 占空比 tH/T */
  duty: number;
  /** 上电后第一次从 0 充到上阈值的时间（第一个高电平更长） */
  tFirst: number;
  segments: Segment[];
}

/**
 * 基本多谐振荡器：R1、R2、C 串联，7 脚接 R1、R2 之间，2、6 脚接电容。
 * 充电（输出 1）：经 R1+R2 向 V_CC 充电，V_L → V_U；放电（输出 0）：经 R2 由放电管放电，V_U → V_L。
 * 未接 CO 时：t_H = (R1+R2)C·ln2，t_L = R2·C·ln2，占空比 = (R1+R2)/(R1+2R2) > 50%。
 */
export function astable(p: AstableInput): AstableResult {
  positive("V_CC", p.Vcc);
  positive("R1", p.R1);
  positive("R2", p.R2);
  positive("C", p.C);
  const th = thresholds(p.Vcc, p.Vco);
  const tauCharge = (p.R1 + p.R2) * p.C;
  const tauDischarge = p.R2 * p.C;
  const tH = rcTimeTo(th.lower, p.Vcc, tauCharge, th.upper);
  const tL = rcTimeTo(th.upper, 0, tauDischarge, th.lower);
  const tFirst = rcTimeTo(0, p.Vcc, tauCharge, th.upper);
  const T = tH + tL;
  const segments: Segment[] = [{ t0: 0, t1: tFirst, v0: 0, vInf: p.Vcc, tau: tauCharge, out: 1 }];
  let t = tFirst;
  for (let k = 0; k < (p.cycles ?? 3); k++) {
    segments.push({ t0: t, t1: t + tL, v0: th.upper, vInf: 0, tau: tauDischarge, out: 0 });
    t += tL;
    segments.push({ t0: t, t1: t + tH, v0: th.lower, vInf: p.Vcc, tau: tauCharge, out: 1 });
    t += tH;
  }
  return { th, tauCharge, tauDischarge, tH, tL, T, f: 1 / T, duty: tH / T, tFirst, segments };
}

// ───────────────────────── 单稳态触发器 ─────────────────────────

export interface MonostableInput {
  Vcc: number;
  R: number;
  C: number;
  Vco?: number;
}

/**
 * 单稳态：R 接 V_CC 与 6、7 脚，C 接 6、7 脚与地，触发脉冲（负脉冲）接 2 脚。
 * 稳态：输出 0，放电管导通，v_C ≈ 0。触发后输出 1，电容经 R 充电到 V_U 时翻回。
 * 未接 CO 时：t_W = RC·ln3 ≈ 1.1RC。要求触发负脉冲宽度小于 t_W（否则触发端优先，输出要等触发撤销才回 0）。
 */
export function monostable(p: MonostableInput): { th: Thresholds; tau: number; tW: number } {
  positive("V_CC", p.Vcc);
  positive("R", p.R);
  positive("C", p.C);
  const th = thresholds(p.Vcc, p.Vco);
  const tau = p.R * p.C;
  return { th, tau, tW: rcTimeTo(0, p.Vcc, tau, th.upper) };
}

// ───────────────────────── 施密特触发器 ─────────────────────────

/** 2、6 脚接在一起作为输入：上升到 V_U 时输出变 0，下降到 V_L 时输出变 1（反相施密特），回差 ΔV = V_U − V_L */
export function schmitt(Vcc: number, Vco?: number): { th: Thresholds; vtPlus: number; vtMinus: number; hysteresis: number } {
  const th = thresholds(Vcc, Vco);
  return { th, vtPlus: th.upper, vtMinus: th.lower, hysteresis: th.upper - th.lower };
}

// ───────────────────────── 通用时间步进仿真（独立校核） ─────────────────────────

export type Circuit555 =
  | { kind: "astable"; Vcc: number; R1: number; R2: number; C: number; Vco?: number }
  | { kind: "monostable"; Vcc: number; R: number; C: number; Vco?: number; trigger: (t: number) => number }
  | { kind: "schmitt"; Vcc: number; Vco?: number; input: (t: number) => number };

export interface Sample {
  t: number;
  /** 电容电压（施密特时为输入电压） */
  v: number;
  out: 0 | 1;
  /** 两个比较器的输出：c1 = v_TH > V_U，c2 = v_TR < V_L */
  c1: boolean;
  c2: boolean;
  /** 放电管导通 */
  discharge: boolean;
}

/**
 * 按固定步长 dt 推进：每一步内按当前放电管状态用指数解析解更新电容电压，再按功能表更新锁存器。
 * 与上面的解析公式相互独立，用于测试中交叉校核（误差量级为 dt）。
 */
export function simulate555(c: Circuit555, tEnd: number, dt: number, q0: 0 | 1 = 0, v0 = 0): Sample[] {
  if (!(dt > 0) || !(tEnd > 0)) throw new Error("时间参数必须为正");
  if (tEnd / dt > 2_000_000) throw new Error("步数过多，请增大 dt");
  const th = thresholds(c.Vcc, c.Vco);
  let q: 0 | 1 = q0;
  let v = v0;
  const out: Sample[] = [];
  const steps = Math.ceil(tEnd / dt);
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    let vTH: number;
    let vTR: number;
    if (c.kind === "schmitt") {
      v = c.input(t);
      vTH = vTR = v;
    } else if (c.kind === "astable") {
      vTH = vTR = v;
    } else {
      vTH = v;
      vTR = c.trigger(t);
    }
    q = latch555(q, { reset: 1, vTH, vTR }, th);
    out.push({ t, v, out: q, c1: vTH > th.upper, c2: vTR < th.lower, discharge: q === 0 });
    // 电容在下一步内的变化
    if (c.kind === "astable") {
      v = q === 1 ? rcValue(v, c.Vcc, (c.R1 + c.R2) * c.C, dt) : rcValue(v, 0, c.R2 * c.C, dt);
    } else if (c.kind === "monostable") {
      v = q === 1 ? rcValue(v, c.Vcc, c.R * c.C, dt) : 0; // 放电管理想导通：电容立即放电
    }
  }
  return out;
}

/** 从采样序列中找输出跳变时刻 */
export function edgesOf(samples: Sample[]): { t: number; to: 0 | 1 }[] {
  const r: { t: number; to: 0 | 1 }[] = [];
  for (let i = 1; i < samples.length; i++) if (samples[i].out !== samples[i - 1].out) r.push({ t: samples[i].t, to: samples[i].out });
  return r;
}

/** 工程单位格式化：1.2e-3 s → "1.20 ms" */
export function fmtSI(x: number, unit: string, digits = 3): string {
  if (!isFinite(x)) return "∞";
  const pre: [number, string][] = [
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const a = Math.abs(x);
  const [m, p] = pre.find(([m]) => a >= m * 0.9995) ?? pre[pre.length - 1];
  const v = x / m;
  const intDigits = v === 0 ? 1 : Math.floor(Math.log10(Math.abs(v))) + 1;
  return `${v.toFixed(Math.max(0, digits - intDigits))} ${p}${unit}`;
}
