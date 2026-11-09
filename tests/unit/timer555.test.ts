import { describe, expect, it } from "vitest";
import { astable, monostable, schmitt, simulate555, edgesOf, thresholds, latch555, rcTimeTo, fmtSI } from "@/lib/analog-models/timer555";

describe("555 阈值与功能表", () => {
  it("未接 CO：2/3 与 1/3 V_CC；接 CO：V_CO 与 V_CO/2", () => {
    expect(thresholds(9)).toEqual({ upper: 6, lower: 3 });
    expect(thresholds(12, 8)).toEqual({ upper: 8, lower: 4 });
    expect(() => thresholds(5, 6)).toThrow();
  });
  it("复位优先；触发端优先于阈值端；中间区间保持", () => {
    const th = thresholds(9);
    expect(latch555(1, { reset: 0, vTH: 0, vTR: 0 }, th)).toBe(0);
    expect(latch555(0, { reset: 1, vTH: 8, vTR: 1 }, th)).toBe(1);
    expect(latch555(1, { reset: 1, vTH: 7, vTR: 7 }, th)).toBe(0);
    expect(latch555(1, { reset: 1, vTH: 4, vTR: 4 }, th)).toBe(1);
    expect(latch555(0, { reset: 1, vTH: 4, vTR: 4 }, th)).toBe(0);
  });
  it("RC 到达时间：0 充到 2/3 为 τ·ln3，1/3 充到 2/3 为 τ·ln2，到达不了为 ∞", () => {
    expect(rcTimeTo(0, 9, 1, 6)).toBeCloseTo(Math.log(3), 12);
    expect(rcTimeTo(3, 9, 1, 6)).toBeCloseTo(Math.log(2), 12);
    expect(rcTimeTo(0, 5, 1, 6)).toBe(Infinity);
  });
});

describe("多谐振荡器", () => {
  const p = { Vcc: 5, R1: 1e3, R2: 10e3, C: 0.1e-6 };
  it("解析公式：t_H = 0.693(R1+R2)C，t_L = 0.693 R2 C，占空比 (R1+R2)/(R1+2R2)", () => {
    const r = astable(p);
    expect(r.tH).toBeCloseTo(Math.LN2 * 11e3 * 0.1e-6, 12);
    expect(r.tL).toBeCloseTo(Math.LN2 * 10e3 * 0.1e-6, 12);
    expect(r.duty).toBeCloseTo(11 / 21, 12);
    expect(r.f).toBeCloseTo(1 / (Math.LN2 * 21e3 * 0.1e-6), 6);
    expect(r.tFirst).toBeCloseTo(Math.log(3) * 11e3 * 0.1e-6, 12);
  });
  it("与时间步进仿真交叉校核（误差 < 2 个步长）", () => {
    const r = astable(p);
    const dt = r.T / 20000;
    const s = simulate555({ kind: "astable", ...p }, r.tFirst + 3 * r.T, dt, 1, 0);
    const e = edgesOf(s);
    // 第一次下降沿在 tFirst，之后周期为 T
    expect(e[0].to).toBe(0);
    expect(Math.abs(e[0].t - r.tFirst)).toBeLessThan(2 * dt);
    expect(Math.abs(e[1].t - e[0].t - r.tL)).toBeLessThan(2 * dt);
    expect(Math.abs(e[2].t - e[1].t - r.tH)).toBeLessThan(2 * dt);
    expect(Math.abs(e[4].t - e[2].t - r.T)).toBeLessThan(2 * dt);
    // 稳定后电容电压在 1/3～2/3 V_CC 之间
    const tail = s.filter((x) => x.t > r.tFirst);
    expect(Math.min(...tail.map((x) => x.v))).toBeGreaterThan(5 / 3 - 0.01);
    expect(Math.max(...tail.map((x) => x.v))).toBeLessThan(10 / 3 + 0.01);
  });
  it("接 CO 改变频率：V_CO 升高，t_H 变长；t_L 不变（V_CO 放电到 V_CO/2 恒为 ln2）", () => {
    const a = astable(p);
    const b = astable({ ...p, Vco: 4 });
    expect(b.tH).toBeGreaterThan(a.tH);
    expect(b.tL).toBeCloseTo(a.tL, 15);
    expect(b.tL).toBeCloseTo(10e3 * 0.1e-6 * Math.LN2, 12); // V_CO→V_CO/2 放电始终是 ln2
  });
  it("非法参数", () => {
    expect(() => astable({ ...p, R1: 0 })).toThrow();
    expect(() => astable({ ...p, C: -1 })).toThrow();
  });
});

describe("单稳态触发器", () => {
  it("t_W = RC·ln3 ≈ 1.1RC，与仿真一致", () => {
    const R = 100e3;
    const C = 10e-6;
    const m = monostable({ Vcc: 9, R, C });
    expect(m.tW).toBeCloseTo(R * C * Math.log(3), 12);
    expect(m.tW / (R * C)).toBeCloseTo(1.0986, 4);
    const dt = m.tW / 20000;
    const s = simulate555({ kind: "monostable", Vcc: 9, R, C, trigger: (t) => (t >= 0.1 && t < 0.1 + 0.01 ? 0 : 9) }, 2, dt);
    const e = edgesOf(s);
    expect(e[0].to).toBe(1);
    expect(Math.abs(e[1].t - e[0].t - m.tW)).toBeLessThan(2 * dt);
  });
  it("触发脉冲比 t_W 还宽：输出要等触发撤销才回 0（触发端优先）", () => {
    const m = monostable({ Vcc: 9, R: 10e3, C: 10e-6 });
    const width = 3 * m.tW;
    const dt = m.tW / 5000;
    const s = simulate555({ kind: "monostable", Vcc: 9, R: 10e3, C: 10e-6, trigger: (t) => (t >= 0.01 && t < 0.01 + width ? 0 : 9) }, 0.01 + 5 * m.tW, dt);
    const e = edgesOf(s);
    expect(Math.abs(e[1].t - e[0].t - width)).toBeLessThan(2 * dt);
  });
  it("不可重复触发：输出为 1 期间再来触发，脉宽不变", () => {
    const m = monostable({ Vcc: 9, R: 10e3, C: 10e-6 });
    const dt = m.tW / 5000;
    const trig = (t: number) => ((t >= 0.01 && t < 0.011) || (t >= 0.01 + m.tW / 2 && t < 0.011 + m.tW / 2) ? 0 : 9);
    const e = edgesOf(simulate555({ kind: "monostable", Vcc: 9, R: 10e3, C: 10e-6, trigger: trig }, 0.01 + 3 * m.tW, dt));
    expect(e.length).toBe(2);
    expect(Math.abs(e[1].t - e[0].t - m.tW)).toBeLessThan(2 * dt);
  });
});

describe("施密特触发器", () => {
  it("V_T+ = 2/3 V_CC，V_T− = 1/3 V_CC，回差 1/3 V_CC；反相输出", () => {
    const s = schmitt(12);
    expect(s.vtPlus).toBe(8);
    expect(s.vtMinus).toBe(4);
    expect(s.hysteresis).toBe(4);
    const tri = (t: number) => (t < 1 ? 12 * t : 12 * (2 - t)); // 0→12→0 的三角波
    const smp = simulate555({ kind: "schmitt", Vcc: 12, input: tri }, 2, 1e-4, 1);
    const e = edgesOf(smp);
    expect(e.map((x) => x.to)).toEqual([0, 1]);
    expect(tri(e[0].t)).toBeCloseTo(8, 2);
    expect(tri(e[1].t)).toBeCloseTo(4, 2);
  });
});

describe("单位格式化", () => {
  it("fmtSI", () => {
    expect(fmtSI(1.2e-3, "s")).toBe("1.20 ms");
    expect(fmtSI(4.7e3, "Ω", 2)).toBe("4.7 kΩ");
    expect(fmtSI(1e-7, "F", 2)).toBe("100 nF");
  });
});
