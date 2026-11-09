/**
 * 电平阈值、噪声容限与扇出 —— 电气层 · 教学近似模型（纯函数）。
 *
 * 单位：电压 V，电流 mA。电流沿用数据手册符号约定：流入引脚为正、流出为负
 * （I_OH、I_IL 为负值）；计算扇出时取绝对值。
 *
 * ⚠️ 本文件所有器件参数均未在本机打开数据手册原件核对，标「⚠️待验证」，请以官方数据手册为准。
 */

export type FamilyId = "74LS" | "74HC";

/** 一组输出电平保证值及其测试电流条件 */
export interface OutputCondition {
  /** 条件说明 */
  label: string;
  VOH_min: number;
  VOL_max: number;
  /** 该条件下允许的输出电流（mA，带符号：I_OH < 0，I_OL > 0） */
  IOH: number;
  IOL: number;
}

export interface FamilyParams {
  id: FamilyId;
  name: string;
  tech: "TTL" | "CMOS";
  VCC: number;
  VIH_min: number;
  VIL_max: number;
  /** 输入电流（mA，带符号：I_IH > 0，I_IL < 0） */
  IIH: number;
  IIL: number;
  /** 驱动 TTL 负载（大电流）时的输出条件 */
  outHeavy: OutputCondition;
  /** 驱动 CMOS 负载（微安级）时的输出条件；无则与 outHeavy 相同 */
  outLight?: OutputCondition;
  /** 参数来源（界面必须显示） */
  source: string;
  verified: false;
}

export const FAMILIES: Record<FamilyId, FamilyParams> = {
  "74LS": {
    id: "74LS",
    name: "74LS（低功耗肖特基 TTL）",
    tech: "TTL",
    VCC: 5,
    VIH_min: 2.0,
    VIL_max: 0.8,
    IIH: 0.02,
    IIL: -0.4,
    outHeavy: { label: "I_OL = 8 mA，I_OH = −0.4 mA", VOH_min: 2.7, VOL_max: 0.5, IOH: -0.4, IOL: 8 },
    source:
      "TI SN54LS00/SN74LS00 数据手册（推荐工作条件与电气特性表，V_CC = 5 V），按 docs/materials-summary.md §9 录入；未在本机打开原件核对，⚠️待验证",
    verified: false,
  },
  "74HC": {
    id: "74HC",
    name: "74HC（高速 CMOS，V_CC = 5 V）",
    tech: "CMOS",
    VCC: 5,
    VIH_min: 3.5,
    VIL_max: 1.5,
    IIH: 0.001,
    IIL: -0.001,
    outHeavy: { label: "|I_O| = 4 mA（驱动 TTL 负载）", VOH_min: 3.84, VOL_max: 0.33, IOH: -4, IOL: 4 },
    outLight: { label: "|I_O| ≤ 20 µA（驱动 CMOS 负载）", VOH_min: 4.4, VOL_max: 0.1, IOH: -0.02, IOL: 0.02 },
    source:
      "典型量级，⚠️待验证，请以数据手册为准（74HC 系列在 V_CC ≈ 5 V 时的通行教学取值：V_IH ≈ 0.7V_CC、V_IL ≈ 0.3V_CC，输入电流 ≤ 1 µA 量级；输出值按 4 mA / 20 µA 两种负载条件给出）",
    verified: false,
  },
};

export const FAMILY_IDS: readonly FamilyId[] = ["74LS", "74HC"] as const;

function finite(name: string, v: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} 必须是有限数值`);
}

export interface NoiseMargins {
  /** V_NH = V_OH(min) − V_IH(min) */
  VNH: number;
  /** V_NL = V_IL(max) − V_OL(max) */
  VNL: number;
}

export function noiseMargins(p: { VOH_min: number; VOL_max: number; VIH_min: number; VIL_max: number }): NoiseMargins {
  finite("V_OH(min)", p.VOH_min);
  finite("V_OL(max)", p.VOL_max);
  finite("V_IH(min)", p.VIH_min);
  finite("V_IL(max)", p.VIL_max);
  if (p.VOL_max >= p.VOH_min) throw new Error("V_OL(max) 必须小于 V_OH(min)");
  if (p.VIL_max >= p.VIH_min) throw new Error("V_IL(max) 必须小于 V_IH(min)");
  return { VNH: p.VOH_min - p.VIH_min, VNL: p.VIL_max - p.VOL_max };
}

export interface Fanout {
  /** 低电平扇出 I_OL / |I_IL| */
  NL: number;
  /** 高电平扇出 |I_OH| / I_IH */
  NH: number;
  /** N = min(NL, NH)，向下取整 */
  N: number;
  limitedBy: "low" | "high" | "both";
}

/** 扇出 N = min(⌊I_OL/|I_IL|⌋, ⌊|I_OH|/I_IH⌋)（只考虑直流电流，不含电容负载） */
export function fanout(p: { IOL: number; IOH: number; IIH: number; IIL: number }): Fanout {
  finite("I_OL", p.IOL);
  finite("I_OH", p.IOH);
  finite("I_IH", p.IIH);
  finite("I_IL", p.IIL);
  if (p.IOL <= 0) throw new Error("I_OL(max) 必须大于 0");
  if (p.IOH === 0) throw new Error("I_OH(max) 不能为 0");
  if (p.IIH === 0) throw new Error("I_IH 不能为 0（分母为 0）");
  if (p.IIL === 0) throw new Error("I_IL 不能为 0（分母为 0）");
  // 浮点除法后加微小量再取整，避免 0.4/0.02 = 19.999… 被截成 19
  const NL = Math.floor(p.IOL / Math.abs(p.IIL) + 1e-9);
  const NH = Math.floor(Math.abs(p.IOH) / Math.abs(p.IIH) + 1e-9);
  const N = Math.min(NL, NH);
  return { NL, NH, N, limitedBy: NL === NH ? "both" : NL < NH ? "low" : "high" };
}

export interface LevelsAnalysis {
  driver: FamilyParams;
  load: FamilyParams;
  out: OutputCondition;
  margins: NoiseMargins;
  fanout: Fanout;
  /** 高、低电平是否都满足（噪声容限 ≥ 0） */
  compatible: boolean;
  issues: string[];
  notes: string[];
}

export function getFamily(id: string): FamilyParams {
  const f = (FAMILIES as Record<string, FamilyParams | undefined>)[id];
  if (!f) throw new Error(`未知器件系列：${id}（可选 ${FAMILY_IDS.join("、")}）`);
  return f;
}

/** 驱动门 → 负载门 的电平与扇出分析 */
export function analyzeLevels(driverId: string, loadId: string): LevelsAnalysis {
  const driver = getFamily(driverId);
  const load = getFamily(loadId);
  if (driver.VCC !== load.VCC) throw new Error("本模型只讨论同一电源电压下的互连");
  // CMOS 负载取微安级输出条件（若驱动门给出），TTL 负载取大电流条件
  const out = load.tech === "CMOS" && driver.outLight ? driver.outLight : driver.outHeavy;
  const margins = noiseMargins({ VOH_min: out.VOH_min, VOL_max: out.VOL_max, VIH_min: load.VIH_min, VIL_max: load.VIL_max });
  const fo = fanout({ IOL: out.IOL, IOH: out.IOH, IIH: load.IIH, IIL: load.IIL });
  const issues: string[] = [];
  const notes: string[] = [];
  if (margins.VNH < 0) {
    issues.push(
      `高电平不满足：驱动门 V_OH(min) = ${out.VOH_min} V < 负载门 V_IH(min) = ${load.VIH_min} V，高电平可能被识别为不确定电平。`,
    );
    if (driver.tech === "TTL" && load.tech === "CMOS") {
      issues.push(
        "常见解决办法：在 TTL 输出端接上拉电阻到 V_CC 提高高电平；或改用输入与 TTL 电平兼容的 74HCT 系列作为负载；或加电平转换电路。",
      );
    }
  }
  if (margins.VNL < 0) {
    issues.push(`低电平不满足：驱动门 V_OL(max) = ${out.VOL_max} V > 负载门 V_IL(max) = ${load.VIL_max} V。`);
  }
  if (load.tech === "CMOS") {
    notes.push("CMOS 输入几乎不取直流电流，按直流算出的扇出很大；实际扇出主要受负载电容对上升/下降时间与速度的影响。");
  }
  if (driver.outLight && load.tech === "TTL") {
    notes.push("驱动 TTL 负载时输出电流较大，按 4 mA 条件取输出电平，高电平比驱动 CMOS 时低。");
  }
  return { driver, load, out, margins, fanout: fo, compatible: margins.VNH >= 0 && margins.VNL >= 0, issues, notes };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function tryAnalyzeLevels(driverId: string, loadId: string): Result<LevelsAnalysis> {
  try {
    return { ok: true, value: analyzeLevels(driverId, loadId) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
