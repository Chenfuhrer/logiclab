import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  dac,
  dacResolution,
  r2rNodeVoltages,
  quantStep,
  maxQuantError,
  decisionLevel,
  quantize,
  sarConvert,
  sarConversionTime,
  flashConvert,
  flashComparatorCount,
  thermometerToBinary,
  dualSlope,
  minSamplingRate,
  bitsForMaxError,
  toBits,
  fromBits,
  type QuantMethod,
} from "@/lib/analog-models/converters";
import { exercises } from "@/content/exercises/adc-dac";

describe("DAC：R-2R 倒 T 形与权电阻", () => {
  it("R-2R 取 R_f = R：v_O = −V_REF·D/2ⁿ，支路电流逐位减半", () => {
    const r = dac({ kind: "r2r", n: 4, D: 0b1101, vRef: 10, R: 10e3 });
    expect(r.vO).toBeCloseTo(-8.125, 12);
    expect(r.iRef).toBeCloseTo(1e-3, 15);
    expect(r.branches.map((b) => b.current)).toEqual([0.5e-3, 0.25e-3, 0.125e-3, 0.0625e-3]);
    expect(r.iSum).toBeCloseTo(0.8125e-3, 15);
    expect(r.branches.map((b) => b.toSum)).toEqual([true, true, false, true]);
    expect(r.vLSB).toBeCloseTo(0.625, 12);
    expect(r.vFS).toBeCloseTo(9.375, 12);
    expect(r.resolution).toBeCloseTo(1 / 15, 15);
  });
  it("R-2R 通用形式 v_O = −(R_f/R)·V_REF·D/2ⁿ", () => {
    const r = dac({ kind: "r2r", n: 8, D: 200, vRef: 5, R: 10e3, Rf: 20e3 });
    expect(r.vO).toBeCloseTo((-2 * 5 * 200) / 256, 12);
  });
  it("权电阻：电阻按 2 的幂，d=0 的支路电流为 0；取 R_f = R/2 时 v_O = −V_REF·D/2ⁿ", () => {
    const r = dac({ kind: "weighted", n: 4, D: 0b0101, vRef: 5, R: 10e3 });
    expect(r.Rf).toBe(5e3);
    expect(r.branches.map((b) => b.resistance)).toEqual([10e3, 20e3, 40e3, 80e3]);
    expect(r.branches.map((b) => b.current)).toEqual([0, 0.25e-3, 0, 62.5e-6]);
    expect(r.iSum).toBeCloseTo(0.3125e-3, 15);
    expect(r.vO).toBeCloseTo(-1.5625, 12);
  });
  it("权电阻取 R_f = R：输出是 R_f = R/2 时的 2 倍，即 −V_REF·D/2^{n−1}", () => {
    const r = dac({ kind: "weighted", n: 4, D: 3, vRef: 8, R: 1e3, Rf: 1e3 });
    expect(r.vO).toBeCloseTo((-8 * 3) / 8, 12);
  });
  it("对任意 n、D、V_REF：R-2R(R_f=R) 与 权电阻(R_f=R/2) 结果一致，且等于 −V_REF·D/2ⁿ", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.double({ min: 0.1, max: 20, noNaN: true }), fc.nat(), (n, vRef, raw) => {
        const D = raw % 2 ** n;
        const a = dac({ kind: "r2r", n, D, vRef });
        const b = dac({ kind: "weighted", n, D, vRef });
        const expected = (-vRef * D) / 2 ** n;
        expect(a.vO).toBeCloseTo(expected, 9);
        expect(b.vO).toBeCloseTo(expected, 9);
        expect(a.vLSB).toBeCloseTo(b.vLSB, 12);
        expect(a.vFS).toBeCloseTo(b.vFS, 9);
        expect(a.vFS / a.vLSB).toBeCloseTo(2 ** n - 1, 6);
      }),
      { numRuns: 300 },
    );
  });
  it("R-2R 节点电位逐级减半；分辨率 1/(2ⁿ−1)", () => {
    expect(r2rNodeVoltages(4, 8)).toEqual([8, 4, 2, 1]);
    expect(dacResolution(8)).toBeCloseTo(1 / 255, 15);
    expect(dacResolution(10)).toBeCloseTo(1 / 1023, 15);
  });
  it("负参考电压得到正输出", () => {
    expect(dac({ kind: "r2r", n: 3, D: 5, vRef: -8 }).vO).toBeCloseTo(5, 12);
  });
});

describe("量化", () => {
  it("3 位、0～1 V：只舍不入 Δ = 1/8 V、误差上限 Δ；四舍五入 Δ = 2/15 V、误差上限 Δ/2", () => {
    expect(quantStep({ n: 3, vRef: 1, method: "truncate" })).toBeCloseTo(1 / 8, 15);
    expect(maxQuantError({ n: 3, vRef: 1, method: "truncate" })).toBeCloseTo(1 / 8, 15);
    expect(quantStep({ n: 3, vRef: 1, method: "round" })).toBeCloseTo(2 / 15, 15);
    expect(maxQuantError({ n: 3, vRef: 1, method: "round" })).toBeCloseTo(1 / 15, 15);
  });
  it("判决电平：只舍不入为 kΔ，四舍五入为 (k−½)Δ", () => {
    expect(decisionLevel({ n: 3, vRef: 7.5, method: "round" }, 1)).toBeCloseTo(0.5, 12);
    expect(decisionLevel({ n: 3, vRef: 7.5, method: "round" }, 7)).toBeCloseTo(6.5, 12);
    expect(decisionLevel({ n: 4, vRef: 8, method: "truncate" }, 3)).toBeCloseTo(1.5, 12);
  });
  it("任意输入的量化误差都在上限之内（0 ≤ e ≤ Δ；|e| ≤ Δ/2），包括满量程端点", () => {
    for (const method of ["truncate", "round"] as QuantMethod[]) {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 12 }), fc.double({ min: 0.5, max: 12, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (n, vRef, x) => {
          const vI = x * vRef;
          const q = quantize(vI, { n, vRef, method });
          const tol = 1e-12 * vRef;
          if (method === "truncate") {
            expect(q.error).toBeGreaterThanOrEqual(-tol);
            expect(q.error).toBeLessThanOrEqual(q.maxError + tol);
          } else expect(Math.abs(q.error)).toBeLessThanOrEqual(q.maxError + tol);
        }),
        { numRuns: 400 },
      );
      for (const vI of [0, 1]) {
        const q = quantize(vI, { n: 3, vRef: 1, method });
        expect(Math.abs(q.error)).toBeLessThanOrEqual(q.maxError + 1e-15);
      }
    }
  });
});

describe("逐次逼近型 ADC", () => {
  it("例：4 位、V_REF = 8 V、v_I = 5.3 V → 1010，逐拍试探 1000/1100/1010/1011", () => {
    const r = sarConvert(5.3, { n: 4, vRef: 8, method: "truncate" });
    expect(r.steps.map((s) => s.trialBits)).toEqual(["1000", "1100", "1010", "1011"]);
    expect(r.steps.map((s) => s.vDac)).toEqual([4, 6, 5, 5.5]);
    expect(r.steps.map((s) => s.keep)).toEqual([true, false, true, false]);
    expect(r.bits).toBe("1010");
    expect(r.clocks).toBe(4);
    expect(r.error).toBeCloseTo(0.3, 12);
  });
  it("对随机输入：逐次逼近结果 = 量化结果 = 并联比较结果（两种量化方式）", () => {
    for (const method of ["truncate", "round"] as QuantMethod[]) {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), fc.double({ min: 0.5, max: 12, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (n, vRef, x) => {
          const vI = x * vRef;
          const spec = { n, vRef, method };
          const s = sarConvert(vI, spec);
          const q = quantize(vI, spec);
          expect(s.code).toBe(q.code);
          expect(s.steps).toHaveLength(n);
          if (n <= 8) expect(flashConvert(vI, spec).code).toBe(q.code);
        }),
        { numRuns: 500 },
      );
    }
  });
  it("落在判决电平上的输入（恰好相等记为 1）三种算法一致", () => {
    for (const method of ["truncate", "round"] as QuantMethod[]) {
      const spec = { n: 4, vRef: 8, method };
      for (let k = 1; k <= 15; k++) {
        const v = decisionLevel(spec, k);
        expect(sarConvert(v, spec).code).toBe(k);
        expect(quantize(v, spec).code).toBe(k);
        expect(flashConvert(v, spec).code).toBe(k);
      }
    }
  });
  it("转换时间 n/f_CLK", () => {
    expect(sarConversionTime(10, 1e6)).toBeCloseTo(10e-6, 15);
  });
});

describe("并联比较型 ADC", () => {
  it("3 位、四舍五入、V_REF = 7.5 V：参考电压 0.5～6.5 V，v_I = 4.2 V → 温度计码 0001111 → 100", () => {
    const r = flashConvert(4.2, { n: 3, vRef: 7.5, method: "round" });
    expect(r.count).toBe(7);
    expect(r.comparators.map((c) => +c.vRef.toFixed(9))).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]);
    expect(r.thermometer).toBe("0001111");
    expect(r.bits).toBe("100");
    expect(r.error).toBeCloseTo(0.2, 12);
  });
  it("比较器个数 2ⁿ−1；温度计码编码与气泡检测", () => {
    expect(flashComparatorCount(3)).toBe(7);
    expect(flashComparatorCount(8)).toBe(255);
    expect(thermometerToBinary([1, 1, 1, 0, 0, 0, 0])).toEqual({ code: 3, valid: true });
    expect(thermometerToBinary([0, 0, 0, 0, 0, 0, 0])).toEqual({ code: 0, valid: true });
    expect(thermometerToBinary([1, 1, 1, 1, 1, 1, 1])).toEqual({ code: 7, valid: true });
    expect(thermometerToBinary([1, 0, 1, 0, 0, 0, 0])).toEqual({ code: 3, valid: false });
    // 穷举：所有合法温度计码都编码为“1 的个数”
    for (let n = 1; n <= 5; n++) {
      const m = 2 ** n - 1;
      for (let c = 0; c <= m; c++) expect(thermometerToBinary(Array.from({ length: m }, (_, i) => (i < c ? 1 : 0)))).toEqual({ code: c, valid: true });
    }
    expect(() => thermometerToBinary([1, 0])).toThrow("2ⁿ − 1");
  });
});

describe("双积分型 ADC", () => {
  const base = { n: 10, vRef: 5, vI: 2, fClk: 100e3, RC: 10e-3 };
  it("例：T₁ = 10.24 ms、V_P = −2.048 V、T₂ = 4.096 ms、N = 409", () => {
    const r = dualSlope(base);
    expect(r.T1).toBeCloseTo(10.24e-3, 15);
    expect(r.vPeak).toBeCloseTo(-2.048, 12);
    expect(r.T2).toBeCloseTo(4.096e-3, 15);
    expect(r.count).toBe(409);
    expect(r.points).toHaveLength(3);
  });
  it("计数值与 RC 无关：RC 改变只改变斜率与峰值", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }), fc.double({ min: 0, max: 0.999, noNaN: true }), fc.double({ min: 1e-5, max: 1, noNaN: true }), fc.double({ min: 1e-5, max: 1, noNaN: true }), (n, x, rc1, rc2) => {
        const p = { n, vRef: 5, vI: x * 5, fClk: 50e3 };
        const a = dualSlope({ ...p, RC: rc1 });
        const b = dualSlope({ ...p, RC: rc2 });
        expect(a.count).toBe(b.count);
        expect(a.T2).toBeCloseTo(b.T2, 12);
        expect(a.T2).toBeCloseTo((a.T1 * p.vI) / p.vRef, 12);
        // 与只舍不入量化一致
        expect(a.count).toBe(quantize(p.vI, { n, vRef: 5, method: "truncate" }).code);
      }),
      { numRuns: 400 },
    );
    const r1 = dualSlope(base);
    const r2 = dualSlope({ ...base, RC: 20e-3 });
    expect(r2.vPeak).toBeCloseTo(r1.vPeak / 2, 12);
    expect(r2.count).toBe(r1.count);
  });
  it("落在量化台阶上的输入不因浮点误差少计 1", () => {
    for (let k = 0; k < 64; k++) expect(dualSlope({ n: 6, vRef: 3.3, vI: (k * 3.3) / 64, fClk: 1e4, RC: 0.0123 }).count).toBe(k);
  });
});

describe("采样与位数", () => {
  it("采样定理 f_s ≥ 2f_max；满足误差要求的最少位数", () => {
    expect(minSamplingRate(20e3)).toBe(40e3);
    expect(bitsForMaxError(5, 2e-3, "truncate")).toBe(12);
    expect(bitsForMaxError(5, 5e-3, "truncate")).toBe(10);
  });
  it("toBits / fromBits", () => {
    expect(toBits(5, 4)).toBe("0101");
    expect(fromBits("1010")).toBe(10);
  });
});

describe("非法输入给出中文错误", () => {
  it("DAC", () => {
    expect(() => dac({ kind: "r2r", n: 0, D: 0, vRef: 5 })).toThrow("位数");
    expect(() => dac({ kind: "r2r", n: 4.5, D: 0, vRef: 5 })).toThrow("位数");
    expect(() => dac({ kind: "r2r", n: 4, D: 16, vRef: 5 })).toThrow("数字量");
    expect(() => dac({ kind: "r2r", n: 4, D: -1, vRef: 5 })).toThrow("数字量");
    expect(() => dac({ kind: "r2r", n: 4, D: 1.5, vRef: 5 })).toThrow("数字量");
    expect(() => dac({ kind: "r2r", n: 4, D: 1, vRef: 0 })).toThrow("参考电压");
    expect(() => dac({ kind: "weighted", n: 4, D: 1, vRef: 5, R: -1 })).toThrow("电阻");
    expect(() => dac({ kind: "weighted", n: 4, D: 1, vRef: 5, Rf: 0 })).toThrow("反馈电阻");
    expect(() => dac({ kind: "x" as "r2r", n: 4, D: 1, vRef: 5 })).toThrow("DAC 类型");
    expect(() => dac({ kind: "r2r", n: 4, D: 1, vRef: NaN })).toThrow("参考电压");
  });
  it("ADC", () => {
    expect(() => quantize(-0.1, { n: 3, vRef: 1, method: "truncate" })).toThrow("输入电压");
    expect(() => quantize(1.1, { n: 3, vRef: 1, method: "truncate" })).toThrow("输入电压");
    expect(() => quantize(NaN, { n: 3, vRef: 1, method: "truncate" })).toThrow("输入电压");
    expect(() => quantize(0.5, { n: 3, vRef: -1, method: "truncate" })).toThrow("参考电压");
    expect(() => quantize(0.5, { n: 3, vRef: 1, method: "x" as QuantMethod })).toThrow("量化方式");
    expect(() => sarConvert(0.5, { n: 17, vRef: 1, method: "truncate" })).toThrow("位数");
    expect(() => flashConvert(0.5, { n: 11, vRef: 1, method: "truncate" })).toThrow("位数");
    expect(() => decisionLevel({ n: 3, vRef: 1, method: "round" }, 8)).toThrow("判决电平");
    expect(() => dualSlope({ ...{ n: 8, vRef: 5, fClk: 1e3, RC: 1 }, vI: 5 })).toThrow("v_I < V_REF");
    expect(() => dualSlope({ n: 8, vRef: 5, vI: 1, fClk: 1e3, RC: 0 })).toThrow("RC");
    expect(() => dualSlope({ n: 8, vRef: 5, vI: 1, fClk: -1, RC: 1 })).toThrow("时钟频率");
    expect(() => minSamplingRate(0)).toThrow("最高频率");
    expect(() => fromBits("102")).toThrow("二进制");
  });
});

describe("题库答案由计算库核对", () => {
  const ans = (id: string) => {
    const e = exercises.find((x) => x.id === id);
    if (!e) throw new Error(`缺少题目 ${id}`);
    return e;
  };
  const num = (id: string) => {
    const e = ans(id);
    if (e.kind !== "numeric") throw new Error(`${id} 不是数值题`);
    return e;
  };
  const txt = (id: string) => {
    const e = ans(id);
    if (e.kind !== "text") throw new Error(`${id} 不是文本题`);
    return e.accept[0];
  };
  it("数值与文本答案", () => {
    expect(Math.abs(num("adc-dac-2").answer - dacResolution(8) * 100)).toBeLessThanOrEqual(num("adc-dac-2").tolerance ?? 0);
    expect(num("adc-dac-3").answer).toBe(minSamplingRate(4e3) / 1e3);
    expect(num("adc-dac-4").answer).toBeCloseTo(dac({ kind: "r2r", n: 4, D: 0b1011, vRef: 8 }).vO, 12);
    expect(num("adc-dac-5").answer).toBeCloseTo(dac({ kind: "weighted", n: 4, D: 0b1010, vRef: 5, R: 10e3 }).iSum * 1e3, 12);
    expect(num("adc-dac-6").answer).toBeCloseTo(dac({ kind: "r2r", n: 8, D: 1, vRef: 5.12 }).vLSB * 1e3, 9);
    expect(txt("adc-dac-7")).toBe(sarConvert(2.7, { n: 4, vRef: 8, method: "truncate" }).bits);
    expect(Math.abs(num("adc-dac-8").answer - maxQuantError({ n: 3, vRef: 1, method: "round" }) * 1e3)).toBeLessThanOrEqual(num("adc-dac-8").tolerance ?? 0);
    expect(txt("adc-dac-9")).toBe(flashConvert(4.2, { n: 3, vRef: 7.5, method: "round" }).bits);
    expect(num("adc-dac-10").answer).toBe(dualSlope({ n: 10, vRef: 5, vI: 2, fClk: 100e3, RC: 10e-3 }).count);
    expect(num("adc-dac-11").answer).toBe(bitsForMaxError(5, 5e-3, "truncate"));
    expect(num("adc-dac-13").answer).toBeCloseTo(sarConversionTime(10, 1e6) * 1e6, 12);
    expect(num("adc-dac-14").answer).toBeCloseTo(dac({ kind: "weighted", n: 8, D: 1, vRef: 5, R: 10e3 }).branches.at(-1)!.resistance / 1e3, 9);
  });
  it("SAR 第 3 拍试探码；R_f 设计", () => {
    expect(txt("adc-dac-15")).toBe(sarConvert(6.4, { n: 4, vRef: 8, method: "truncate" }).steps[2].trialBits);
    const rf = num("adc-dac-17").answer * 1e3;
    expect(dac({ kind: "r2r", n: 8, D: 1, vRef: 5, R: 10e3, Rf: rf }).vLSB).toBeCloseTo(25e-3, 12);
  });
});
