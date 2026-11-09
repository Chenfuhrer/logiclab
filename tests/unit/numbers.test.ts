import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  convert,
  parseNumber,
  tryConvert,
  divisionSteps,
  multiplySteps,
  rationalToDecimal,
  rationalToNumber,
  toBase,
} from "@/lib/numbers/radix";
import {
  addTwos,
  subTwos,
  encodeAll,
  fromTwos,
  onesComplement,
  parseDecimalInt,
  signMagnitude,
  twosComplement,
  twosRange,
  addBits,
  groupBits,
} from "@/lib/numbers/complement";
import {
  CODE_TABLE,
  binaryToGray,
  decimalToBCD,
  decode2421,
  diffPositions,
  encode2421,
  encode8421,
  encodeExcess3,
  grayToBinary,
  graySequence,
} from "@/lib/numbers/codes";

describe("进制转换：正常值", () => {
  it("13.625 → 1101.101（精确）", () => {
    const r = convert("13.625", 10, 2);
    expect(r.text).toBe("1101.101");
    expect(r.exact).toBe(true);
    expect(r.errorText).toBe("0");
  });
  it("1101.101(2) → 13.625(10)、15.5(8)、D.A(16)", () => {
    expect(convert("1101.101", 2, 10).text).toBe("13.625");
    expect(convert("1101.101", 2, 8).text).toBe("15.5");
    expect(convert("1101.101", 2, 16).text).toBe("D.A");
  });
  it("十六进制大小写均可，输出大写", () => {
    expect(convert("ff", 16, 10).text).toBe("255");
    expect(convert("FF", 16, 2).text).toBe("11111111");
    expect(convert("3A.C", 16, 10).text).toBe("58.75");
  });
  it("负数保留符号", () => {
    expect(convert("-13.625", 10, 2).text).toBe("-1101.101");
    expect(convert("-0", 10, 2).text).toBe("0");
  });
  it("0.1 不能用有限位二进制表示：截断到 10 位并给出精确误差", () => {
    const r = convert("0.1", 10, 2, 10);
    expect(r.exact).toBe(false);
    expect(r.text).toBe("0.0001100110");
    expect(r.fracDigits).toBe(10);
    // 0.1 − 0.0001100110(2) = 0.1 − 0.099609375 = 0.000390625
    expect(r.errorText).toBe("0.000390625");
    expect(rationalToNumber(r.error)).toBeCloseTo(0.000390625, 15);
    // 截断误差小于末位权 2^-10
    expect(rationalToNumber(r.error)).toBeLessThan(2 ** -10);
  });
  it("二/八/十六进制小数转十进制总是精确", () => {
    const r = convert("0.0000000000000000000001", 2, 10, 4);
    expect(r.exact).toBe(true);
    expect(r.text).toBe("0." + "0".repeat(6) + "2384185791015625");
  });
  it(".5 与 5. 都可以解析", () => {
    expect(convert(".5", 10, 2).text).toBe("0.1");
    expect(convert("5.", 10, 2).text).toBe("101");
  });
});

describe("进制转换：非法输入", () => {
  it("空串、非法数字、多个小数点、非法进制", () => {
    expect(() => parseNumber("", 10)).toThrow("请输入");
    expect(() => parseNumber("102", 2)).toThrow("二进制");
    expect(() => parseNumber("1.2.3", 10)).toThrow("小数点");
    expect(() => parseNumber("G", 16)).toThrow("十六进制");
    expect(() => parseNumber("-", 10)).toThrow();
    expect(() => parseNumber("1", 3)).toThrow("不支持的进制");
    expect(() => parseNumber("1".repeat(65), 2)).toThrow("过长");
    const r = tryConvert("19", 8, 2);
    expect(r.ok).toBe(false);
  });
  it("位数上限校验", () => {
    expect(() => toBase(parseNumber("0.1", 10), 2, -1)).toThrow();
    expect(() => toBase(parseNumber("0.1", 10), 2, 1.5)).toThrow();
  });
});

describe("进制转换：逐步过程", () => {
  it("13 除 2 取余：余数自下而上 1101", () => {
    const s = divisionSteps(13n, 2);
    expect(s.map((x) => x.remainder)).toEqual([1, 0, 1, 1]);
    expect(s.map((x) => x.quotient)).toEqual([6n, 3n, 1n, 0n]);
    expect(divisionSteps(0n, 2)).toHaveLength(1);
  });
  it("0.625 乘 2 取整：1 0 1，精确", () => {
    const p = parseNumber("0.625", 10);
    const r = multiplySteps(p.fracNum, p.den, 2, 12);
    expect(r.steps.map((x) => x.digit)).toEqual([1, 0, 1]);
    expect(r.exact).toBe(true);
    expect(rationalToDecimal(r.steps[0].product)).toBe("1.25");
  });
  it("非法小数部分报错", () => {
    expect(() => multiplySteps(5n, 4n, 2, 4)).toThrow("小数");
  });
  it("性质：整数在任意进制间往返不变", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.constantFrom(2, 8, 16), (n, b) => {
        const t = convert(String(n), 10, b).text;
        expect(convert(t, b, 10).text).toBe(String(n));
      }),
    );
  });
});

describe("原码 / 反码 / 补码", () => {
  it("−5 的 8 位：原码 10000101，反码 11111010，补码 11111011", () => {
    expect(signMagnitude(-5, 8)).toBe("10000101");
    expect(onesComplement(-5, 8)).toBe("11111010");
    expect(twosComplement(-5, 8)).toBe("11111011");
  });
  it("正数三码相同", () => {
    const e = encodeAll(5, 8);
    expect(e.sm).toBe("00000101");
    expect(e.ones).toBe("00000101");
    expect(e.twos).toBe("00000101");
  });
  it("范围边界：−128 只有 8 位补码能表示；128 都超出", () => {
    expect(twosRange(8)).toEqual({ min: -128, max: 127 });
    const e = encodeAll(-128, 8);
    expect(e.twos).toBe("10000000");
    expect(e.sm).toBeNull();
    expect(e.ones).toBeNull();
    expect(encodeAll(128, 8).twos).toBeNull();
    expect(twosComplement(-8, 4)).toBe("1000");
    expect(twosComplement(-32768, 16)).toBe("1000000000000000");
  });
  it("±0：原码/反码区分，补码唯一", () => {
    const z = parseDecimalInt("-0");
    expect(z.negativeZero).toBe(true);
    const e = encodeAll(z.value, 8, z.negativeZero);
    expect(e.sm).toBe("10000000");
    expect(e.ones).toBe("11111111");
    expect(e.twos).toBe("00000000");
  });
  it("补码 → 真值", () => {
    expect(fromTwos("11111011")).toBe(-5);
    expect(fromTwos("10000000")).toBe(-128);
    expect(fromTwos("0111")).toBe(7);
  });
  it("非法输入", () => {
    expect(() => parseDecimalInt("")).toThrow();
    expect(() => parseDecimalInt("1.5")).toThrow("整数");
    expect(() => parseDecimalInt("abc")).toThrow();
    expect(() => twosComplement(1, 5)).toThrow("位数");
    expect(() => fromTwos("012")).toThrow();
  });
});

describe("补码加减法与溢出", () => {
  it("127 + 1 溢出：Cn=0，Cn−1=1，V=1，结果读作 −128", () => {
    const r = addTwos(127, 1, 8);
    expect(r.sum).toBe("10000000");
    expect(r.cn).toBe(0);
    expect(r.cn1).toBe(1);
    expect(r.overflow).toBe(true);
    expect(r.resultValue).toBe(-128);
    expect(r.trueValue).toBe(128);
  });
  it("−128 + (−1) 溢出：Cn=1，Cn−1=0", () => {
    const r = addTwos(-128, -1, 8);
    expect(r.cn).toBe(1);
    expect(r.cn1).toBe(0);
    expect(r.overflow).toBe(true);
  });
  it("(−5) + 3 = −2，Cn=0 不溢出；(−5)+(−3) Cn=1 也不溢出", () => {
    expect(addTwos(-5, 3, 8).resultValue).toBe(-2);
    const r = addTwos(-5, -3, 8);
    expect(r.cn).toBe(1);
    expect(r.overflow).toBe(false);
    expect(r.resultValue).toBe(-8);
  });
  it("减法：5 − 7 = −2；4 位 7 − (−1) 溢出", () => {
    const r = subTwos(5, 7, 8);
    expect(r.b).toBe("11111001");
    expect(r.resultValue).toBe(-2);
    expect(r.overflow).toBe(false);
    expect(subTwos(7, -1, 4).overflow).toBe(true);
  });
  it("B = −2^{n−1} 时改用 A + B̄ + 1（C0 = 1）", () => {
    const r = subTwos(-1, -128, 8);
    expect(r.carries[0]).toBe(1);
    expect(r.b).toBe("01111111");
    expect(r.resultValue).toBe(127);
    expect(r.overflow).toBe(false);
    expect(subTwos(0, -128, 8).overflow).toBe(true);
  });
  it("操作数超出范围报错", () => {
    expect(() => addTwos(128, 0, 8)).toThrow("超出");
    expect(() => subTwos(0, 8, 4)).toThrow("超出");
    expect(() => addBits("01", "1", 0)).toThrow();
  });
  it("性质：V = 1 当且仅当真值超出范围；无溢出时结果等于真值", () => {
    fc.assert(
      fc.property(fc.constantFrom(4, 8, 16), fc.boolean(), fc.integer(), fc.integer(), (n, isAdd, ra, rb) => {
        const { min, max } = twosRange(n);
        const span = max - min + 1;
        const a = min + (((ra % span) + span) % span);
        const b = min + (((rb % span) + span) % span);
        const r = isAdd ? addTwos(a, b, n) : subTwos(a, b, n);
        const outOfRange = r.trueValue < min || r.trueValue > max;
        expect(r.overflow).toBe(outOfRange);
        if (!outOfRange) expect(r.resultValue).toBe(r.trueValue);
      }),
    );
  });
  it("按 4 位分组", () => {
    expect(groupBits("11111011")).toBe("1111 1011");
    expect(groupBits("101")).toBe("101");
  });
});

describe("BCD / 2421 / 余 3 码", () => {
  it("对照表", () => {
    expect(CODE_TABLE).toHaveLength(10);
    expect(encode8421(9)).toBe("1001");
    expect(encode2421(4)).toBe("0100");
    expect(encode2421(5)).toBe("1011");
    expect(encode2421(9)).toBe("1111");
    expect(encodeExcess3(0)).toBe("0011");
    expect(encodeExcess3(9)).toBe("1100");
  });
  it("2421 码采用自补方案（与课程 codes.mdx 一致，5 = 1011）", () => {
    expect(CODE_TABLE.map((r) => r.c2421)).toEqual([
      "0000", "0001", "0010", "0011", "0100", "1011", "1100", "1101", "1110", "1111",
    ]);
  });
  it("2421 码按权 2-4-2-1 解码正确，且是自补码", () => {
    for (const r of CODE_TABLE) {
      expect(decode2421(r.c2421)).toBe(r.digit);
      const inv = [...r.c2421].map((c) => (c === "0" ? "1" : "0")).join("");
      expect(decode2421(inv)).toBe(9 - r.digit);
    }
  });
  it("十进制 → 8421BCD", () => {
    expect(decimalToBCD("239").text).toBe("0010 0011 1001");
    expect(decimalToBCD("12.5").text).toBe("0001 0010 . 0101");
  });
  it("非法输入", () => {
    expect(() => encode8421(10)).toThrow();
    expect(() => decimalToBCD("")).toThrow();
    expect(() => decimalToBCD("-3")).toThrow("非负");
    expect(() => decimalToBCD("1a")).toThrow();
  });
});

describe("格雷码", () => {
  it("1011 → 1110，逐位 Gi = Bi+1 ⊕ Bi", () => {
    const r = binaryToGray("1011");
    expect(r.output).toBe("1110");
    expect(r.steps[0]).toEqual({ i: 3, higher: null, input: 1, output: 1 });
    expect(r.steps[1]).toEqual({ i: 2, higher: 1, input: 0, output: 1 });
  });
  it("1110 → 1011，逐位 Bi = Bi+1 ⊕ Gi", () => {
    expect(grayToBinary("1110").output).toBe("1011");
  });
  it("往返：所有 1～8 位二进制", () => {
    for (let n = 1; n <= 8; n++) {
      for (let k = 0; k < 2 ** n; k++) {
        const b = k.toString(2).padStart(n, "0");
        expect(grayToBinary(binaryToGray(b).output).output).toBe(b);
      }
    }
  });
  it("相邻格雷码（含首尾循环）只差一位", () => {
    const seq = graySequence(4);
    expect(seq).toHaveLength(16);
    for (let k = 0; k < seq.length; k++) {
      expect(diffPositions(seq[k], seq[(k + 1) % seq.length])).toHaveLength(1);
    }
    expect(seq[5]).toBe(binaryToGray("0101").output);
  });
  it("非法输入", () => {
    expect(() => binaryToGray("")).toThrow();
    expect(() => binaryToGray("102")).toThrow("0 和 1");
    expect(() => grayToBinary("1".repeat(17))).toThrow("最多");
    expect(() => graySequence(0)).toThrow();
    expect(() => diffPositions("01", "1")).toThrow();
  });
});
