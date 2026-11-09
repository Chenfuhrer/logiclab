import { describe, expect, it } from "vitest";
import { FAMILIES, analyzeLevels, fanout, noiseMargins, tryAnalyzeLevels } from "@/lib/analog-models/levels";
import { DEFAULT_PULLUP, computePullup, loadCounts, tryComputePullup, validatePullup } from "@/lib/analog-models/pullup";
import { DEFAULT_TIMING, computeTiming, tryComputeTiming } from "@/lib/analog-models/timing";

describe("电平与扇出（教学近似模型）", () => {
  it("每个参数集都带 source 且标注待验证", () => {
    for (const f of Object.values(FAMILIES)) {
      expect(f.source).toMatch(/⚠️待验证/);
      expect(f.verified).toBe(false);
    }
    expect(FAMILIES["74HC"].source).toMatch(/典型量级/);
    expect(FAMILIES["74HC"].source).toMatch(/请以数据手册为准/);
  });
  it("74LS → 74LS：V_NH = 0.7 V，V_NL = 0.3 V，扇出 20（8/0.4 与 0.4/0.02）", () => {
    const r = analyzeLevels("74LS", "74LS");
    expect(r.margins.VNH).toBeCloseTo(0.7, 10);
    expect(r.margins.VNL).toBeCloseTo(0.3, 10);
    expect(r.fanout.NL).toBe(20);
    expect(r.fanout.NH).toBe(20);
    expect(r.fanout.N).toBe(20);
    expect(r.fanout.limitedBy).toBe("both");
    expect(r.compatible).toBe(true);
  });
  it("74LS → 74HC：高电平不满足（V_NH < 0），给出接口提示", () => {
    const r = analyzeLevels("74LS", "74HC");
    expect(r.margins.VNH).toBeLessThan(0);
    expect(r.compatible).toBe(false);
    expect(r.issues.join("")).toMatch(/高电平不满足/);
    expect(r.issues.join("")).toMatch(/74HCT/);
  });
  it("74HC → 74LS：按 4 mA 条件，低电平扇出限制 N = 10", () => {
    const r = analyzeLevels("74HC", "74LS");
    expect(r.out.IOL).toBe(4);
    expect(r.fanout.N).toBe(10);
    expect(r.fanout.limitedBy).toBe("low");
    expect(r.compatible).toBe(true);
  });
  it("74HC → 74HC：按 20 µA 条件", () => {
    const r = analyzeLevels("74HC", "74HC");
    expect(r.out.VOH_min).toBe(4.4);
    expect(r.margins.VNH).toBeCloseTo(0.9, 10);
    expect(r.margins.VNL).toBeCloseTo(1.4, 10);
    expect(r.fanout.N).toBe(20);
  });
  it("非法输入", () => {
    expect(() => analyzeLevels("74XX", "74LS")).toThrow("未知器件系列");
    expect(tryAnalyzeLevels("74LS", "foo").ok).toBe(false);
    expect(() => fanout({ IOL: 8, IOH: -0.4, IIH: 0, IIL: -0.4 })).toThrow("分母");
    expect(() => fanout({ IOL: 0, IOH: -0.4, IIH: 0.02, IIL: -0.4 })).toThrow("I_OL");
    expect(() => fanout({ IOL: NaN, IOH: -0.4, IIH: 0.02, IIL: -0.4 })).toThrow("有限");
    expect(() => noiseMargins({ VOH_min: 0.4, VOL_max: 0.5, VIH_min: 2, VIL_max: 0.8 })).toThrow();
  });
});

describe("OC 门上拉电阻", () => {
  it("默认假设参数：R_min = 4.6/7.2 kΩ，R_max = 2/0.28 kΩ", () => {
    const r = computePullup(DEFAULT_PULLUP);
    expect(r.Rmin).toBeCloseTo(4.6 / 7.2, 10);
    expect(r.Rmax).toBeCloseTo(2 / 0.28, 10);
    expect(r.feasible).toBe(true);
  });
  it("边界：分母 I_OL − m'|I_IL| = 0 报错", () => {
    const r = tryComputePullup({ ...DEFAULT_PULLUP, IOL_max: 0.8, mLow: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/R_min 的分母/);
  });
  it("分母 n·I_OH + m·I_IH = 0 报错", () => {
    const r = tryComputePullup({ ...DEFAULT_PULLUP, IOH: 0, IIH: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/R_max 的分母/);
  });
  it("R_min > R_max 时无可行解", () => {
    const r = computePullup({ ...DEFAULT_PULLUP, VOH_min: 4.9, m: 20, mLow: 2, n: 8 });
    expect(r.feasible).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("负载结构 → m、m'：与非门同组输入并联，低电平按门数计", () => {
    expect(loadCounts("nand", 2, 2)).toEqual({ m: 4, mLow: 2 });
    expect(loadCounts("nor", 2, 2)).toEqual({ m: 4, mLow: 4 });
    expect(() => loadCounts("nand", -1, 2)).toThrow();
    expect(() => loadCounts("nand", 1, 0)).toThrow();
  });
  it("非法参数：负电流、非整数个数、V_OH ≥ V_CC、m' > m", () => {
    expect(validatePullup({ ...DEFAULT_PULLUP, IIL: -0.4 }).join()).toMatch(/绝对值/);
    expect(validatePullup({ ...DEFAULT_PULLUP, n: 1.5 }).join()).toMatch(/整数/);
    expect(validatePullup({ ...DEFAULT_PULLUP, n: 0 }).join()).toMatch(/至少为 1/);
    expect(validatePullup({ ...DEFAULT_PULLUP, VOH_min: 5 }).join()).toMatch(/V_OH\(min\) 必须小于 V_CC/);
    expect(validatePullup({ ...DEFAULT_PULLUP, mLow: 5 }).join()).toMatch(/m'/);
    expect(validatePullup({ ...DEFAULT_PULLUP, VCC: NaN }).join()).toMatch(/有限/);
    expect(() => computePullup({ ...DEFAULT_PULLUP, VCC: 0 })).toThrow();
  });
});

describe("同步电路时序", () => {
  it("示例参数：T_min = 15+20+20 = 55 ns，f_max ≈ 18.18 MHz，保持裕量 15 ns", () => {
    const r = computeTiming(DEFAULT_TIMING);
    expect(r.Tmin).toBe(55);
    expect(r.fmax).toBeCloseTo(1000 / 55, 10);
    expect(r.setupSlack).toBe(25);
    expect(r.holdSlack).toBe(15);
    expect(r.setupOk && r.holdOk).toBe(true);
  });
  it("正偏斜（捕获沿晚到）减小 T_min、减小保持裕量", () => {
    const r = computeTiming({ ...DEFAULT_TIMING, tskew: 5 });
    expect(r.Tmin).toBe(50);
    expect(r.holdSlack).toBe(10);
  });
  it("负偏斜增大 T_min", () => {
    expect(computeTiming({ ...DEFAULT_TIMING, tskew: -5 }).Tmin).toBe(60);
  });
  it("保持违例：偏斜大于最短路径延迟 − t_h", () => {
    const r = computeTiming({ ...DEFAULT_TIMING, tskew: 16 });
    expect(r.holdOk).toBe(false);
    expect(r.warnings.join("")).toMatch(/保持时间违例/);
  });
  it("建立违例：T < T_min", () => {
    const r = computeTiming({ ...DEFAULT_TIMING, T: 50 });
    expect(r.setupOk).toBe(false);
    expect(r.setupSlack).toBe(-5);
  });
  it("边界：T = T_min 时建立裕量为 0 且通过；不给 T 时取 T_min", () => {
    const r = computeTiming({ ...DEFAULT_TIMING, T: 55 });
    expect(r.setupSlack).toBe(0);
    expect(r.setupOk).toBe(true);
    const { T: _omit, ...noT } = DEFAULT_TIMING;
    void _omit;
    expect(computeTiming(noT).T).toBe(55);
  });
  it("非法输入", () => {
    expect(tryComputeTiming({ ...DEFAULT_TIMING, tcombMin: 30 }).ok).toBe(false);
    expect(tryComputeTiming({ ...DEFAULT_TIMING, tpd: -1 }).ok).toBe(false);
    expect(tryComputeTiming({ ...DEFAULT_TIMING, tsu: NaN }).ok).toBe(false);
    expect(tryComputeTiming({ ...DEFAULT_TIMING, T: 0 }).ok).toBe(false);
    const r = tryComputeTiming({ ...DEFAULT_TIMING, tskew: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/T_min/);
  });
});
