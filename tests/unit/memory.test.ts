import { describe, expect, it } from "vitest";
import { capacity, addressLinesFor, parseSpec, formatSpec, formatWords, expansionPlan, selectChip, parseAddress, romFromExpressions, romRead } from "@/lib/memory/memory";
import { plaProgram, plaOutputExpr, plaEvaluate, mapToLut, lutRead, bitsToHex, maxMuxSelects } from "@/lib/memory/pld";
import { checkEquivalence, parseExpr, evaluate, truthTable, substitute } from "@/lib/logic";

const bitsOf = (x: number, n: number) => Array.from({ length: n }, (_, j) => ((x >> (n - 1 - j)) & 1) as 0 | 1);

describe("存储容量", () => {
  it("n 根地址线、m 根数据线", () => {
    const c = capacity(12, 8);
    expect(c.words).toBe(4096);
    expect(c.totalBits).toBe(32768);
    expect(c.bytes).toBe(4096);
    expect(c.label).toBe("4K×8");
    expect(capacity(11, 8).totalBits).toBe(16384);
    expect(capacity(16, 16).label).toBe("64K×16");
    expect(capacity(20, 8).label).toBe("1M×8");
  });
  it("寻址所需地址线", () => {
    expect(addressLinesFor(1024)).toBe(10);
    expect(addressLinesFor(65536)).toBe(16);
    expect(addressLinesFor(3072)).toBe(12);
    expect(addressLinesFor(1)).toBe(0);
  });
  it("规格解析与格式化", () => {
    expect(parseSpec("1K×4")).toEqual({ words: 1024, bits: 4 });
    expect(parseSpec(" 2kx8 ")).toEqual({ words: 2048, bits: 8 });
    expect(parseSpec("256*1")).toEqual({ words: 256, bits: 1 });
    expect(formatSpec({ words: 1 << 20, bits: 8 })).toBe("1M×8");
    expect(formatWords(3072)).toBe("3K");
    expect(() => parseSpec("1K4")).toThrow(/无法识别/);
    expect(() => parseSpec("1000×4")).toThrow(/2 的整数次幂/);
    expect(() => capacity(-1, 8)).toThrow();
    expect(() => capacity(4, 0)).toThrow(/数据线/);
  });
  it("地址解析", () => {
    expect(parseAddress("9A5")).toBe(0x9a5);
    expect(parseAddress("9a5H")).toBe(0x9a5);
    expect(parseAddress("0x9A5")).toBe(0x9a5);
    expect(() => parseAddress("XYZ")).toThrow(/无法识别/);
    expect(() => parseAddress("")).toThrow(/请输入/);
  });
});

describe("位扩展 / 字扩展", () => {
  it("位扩展 1K×1 → 1K×8", () => {
    const p = expansionPlan(parseSpec("1K×1"), parseSpec("1K×8"));
    expect(p.kind).toBe("bit");
    expect(p.chips).toBe(8);
    expect(p.decoder).toBeNull();
    expect(p.addressLines).toBe(10);
    expect(p.placements.map((x) => [x.dataHi, x.dataLo])).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, i]));
    expect(p.groups).toHaveLength(1);
    expect([p.groups[0].startHex, p.groups[0].endHex]).toEqual(["000", "3FF"]);
  });
  it("字扩展 1K×8 → 4K×8", () => {
    const p = expansionPlan(parseSpec("1K×8"), parseSpec("4K×8"));
    expect(p.kind).toBe("word");
    expect(p.chips).toBe(4);
    expect(p.decoder?.inputs).toBe(2);
    expect(p.decoder?.outputs).toBe(4);
    expect(p.groups.map((g) => `${g.startHex}-${g.endHex}`)).toEqual(["000-3FF", "400-7FF", "800-BFF", "C00-FFF"]);
    expect(p.groups.map((g) => g.highBits)).toEqual(["00", "01", "10", "11"]);
  });
  it("字位同时扩展 1K×4 → 4K×8", () => {
    const p = expansionPlan(parseSpec("1K×4"), parseSpec("4K×8"));
    expect(p.kind).toBe("both");
    expect(p.chips).toBe(8);
    expect(p.wordGroups).toBe(4);
    expect(p.bitGroups).toBe(2);
    expect(p.chipAddressLines).toBe(10);
    expect(p.addressLines).toBe(12);
    const s = selectChip(p, 0x9a5);
    expect(s.row).toBe(2);
    expect(s.chips).toEqual([4, 5]);
    expect(s.highBits).toBe("10");
    expect(s.offsetHex).toBe("1A5");
    expect(() => selectChip(p, 0x1000)).toThrow(/超出/);
  });
  it("2K×4 → 16K×8 需要 16 片，3 线-8 线译码", () => {
    const p = expansionPlan(parseSpec("2K×4"), parseSpec("16K×8"));
    expect(p.chips).toBe(16);
    expect(p.decoder?.label).toBe("3 线-8 线");
    expect(p.groups[5].startHex).toBe("2800");
    expect(p.groups[5].endHex).toBe("2FFF");
  });
  it("字数不是 2 的幂：1K×8 → 3K×8，译码器剩一个输出不用", () => {
    const p = expansionPlan(parseSpec("1K×8"), { words: 3072, bits: 8 });
    expect(p.chips).toBe(3);
    expect(p.decoder?.unused).toEqual([3]);
    const s = selectChip(p, 0xc00);
    expect(s.row).toBeNull();
    expect(s.chips).toEqual([]);
  });
  it("每个地址恰好选中一组（穷举 256×4 → 1K×8）", () => {
    const p = expansionPlan(parseSpec("256×4"), parseSpec("1K×8"));
    for (let a = 0; a < 1024; a++) {
      const s = selectChip(p, a);
      const g = p.groups.filter((x) => a >= x.start && a <= x.end);
      expect(g).toHaveLength(1);
      expect(s.row).toBe(g[0].row);
      expect(s.chips).toHaveLength(2);
    }
  });
  it("非法规格给出中文错误", () => {
    expect(() => expansionPlan(parseSpec("1K×4"), parseSpec("512×8"))).toThrow(/小于单片字数/);
    expect(() => expansionPlan(parseSpec("1K×4"), parseSpec("1K×2"))).toThrow(/小于单片位数/);
    expect(() => expansionPlan(parseSpec("1K×4"), { words: 1024, bits: 6 })).toThrow(/整数倍/);
    expect(() => expansionPlan(parseSpec("1K×4"), { words: 1536, bits: 4 })).toThrow(/整数倍/);
  });
});

describe("ROM 实现组合逻辑", () => {
  it("全加器 8×2 ROM", () => {
    const r = romFromExpressions(["S = A⊕B⊕C", "CO = AB+AC+BC"]);
    expect(r.vars).toEqual(["A", "B", "C"]);
    expect(r.words).toBe(8);
    expect(r.bits).toBe(2);
    expect(r.totalBits).toBe(16);
    expect(r.minterms).toEqual([
      [1, 2, 4, 7],
      [3, 5, 6, 7],
    ]);
    expect(r.rows.map((x) => x.data.join(""))).toEqual(["00", "10", "10", "01", "10", "01", "01", "11"]);
    expect(r.dots).toBe(8);
    expect(romRead(r, 7)).toEqual([1, 1]);
  });
  it("ROM 数据表与原函数逐点一致", () => {
    const srcs = ["Y1 = A'B + CD", "Y2 = A⊙D", "Y3 = (A+B)(C+D')", "Y4 = 1"];
    const r = romFromExpressions(srcs);
    for (const row of r.rows) {
      const env = Object.fromEntries(r.vars.map((x, j) => [x, bitsOf(row.addr, r.vars.length)[j]]));
      r.outputs.forEach((o, i) => expect(row.data[i]).toBe(evaluate(o.expr, env)));
    }
  });
  it("默认输出名与错误信息", () => {
    expect(romFromExpressions(["AB", "A+B"]).outputs.map((o) => o.name)).toEqual(["Y1", "Y2"]);
    expect(() => romFromExpressions([])).toThrow(/至少/);
    expect(() => romFromExpressions(["A+"])).toThrow(/无法解析/);
    expect(() => romFromExpressions(["Y = A", "Y = B"])).toThrow(/重复/);
    expect(() => romFromExpressions(["Y = A + B", "A = B"])).toThrow(/重名/);
    expect(() => romFromExpressions(["1"])).toThrow(/没有输入变量/);
    expect(() => romFromExpressions(["A+B", "C"], { maxOutputs: 1 })).toThrow(/最多/);
    expect(() => romFromExpressions(["ABCDEF"], { maxVars: 5 })).toThrow(/超过上限/);
  });
});

describe("PLA 编程", () => {
  const srcs = ["F1 = AB + A'C", "F2 = AB + BC'", "F3 = A'C + BC'"];
  it("乘积项共享：3 条乘积线、6 个或阵列连接点", () => {
    const p = plaProgram(srcs);
    expect(p.stats.terms).toBe(3);
    expect(p.stats.termsWithoutSharing).toBe(6);
    expect(p.stats.orConnections).toBe(6);
    expect(p.stats.andConnections).toBe(6);
    expect(p.terms.every((t) => t.outputs.length === 2)).toBe(true);
    const ns = plaProgram(srcs, { share: false });
    expect(ns.stats.terms).toBe(6);
  });
  it("由连接矩阵重建的与或式与原函数等价（checkEquivalence）", () => {
    const cases = [srcs, ["Y1 = A⊕B⊕C", "Y2 = AB+AC+BC"], ["X = A'B'C'D' + ABCD + AB'C", "Z = (A+B)(C+D)", "W = A⊙B⊙C⊙D"], ["G = 1", "H = 0", "K = A + A'"]];
    for (const c of cases)
      for (const share of [true, false]) {
        const p = plaProgram(c, { share });
        p.outputs.forEach((o, j) => {
          const r = checkEquivalence(plaOutputExpr(p, j), o.expr, p.vars);
          expect(r.equivalent, `${o.src}（share=${share}）`).toBe(true);
          expect(checkEquivalence(o.sop, o.expr, p.vars).equivalent).toBe(true);
        });
      }
  });
  it("拨动输入：乘积线与输出的值与原函数一致", () => {
    const p = plaProgram(["Y1 = A⊕B⊕C", "Y2 = AB+AC+BC"]);
    for (let m = 0; m < 8; m++) {
      const ins = bitsOf(m, 3);
      const env = { A: ins[0], B: ins[1], C: ins[2] };
      const r = plaEvaluate(p, ins);
      p.outputs.forEach((o, j) => expect(r.outputs[j]).toBe(evaluate(o.expr, env)));
      p.terms.forEach((t, i) => expect(r.terms[i]).toBe(evaluate(t.expr, env)));
    }
    // 全加器：S 4 项 + CO 3 项，无相同乘积项
    expect(p.stats.terms).toBe(7);
  });
  it("常量输出：全 1 用一条不接任何输入的乘积线，全 0 不用乘积线", () => {
    const p = plaProgram(["G = A + A'", "H = AA'"]);
    expect(p.outputs[0].terms).toHaveLength(1);
    expect(p.andMatrix[p.outputs[0].terms[0]].every((c) => c === null)).toBe(true);
    expect(p.outputs[1].terms).toHaveLength(0);
    expect(plaEvaluate(p, [0]).outputs).toEqual([1, 0]);
  });
  it("多个最简解时优先选可共享的乘积项", () => {
    // F1 = Σm(0,1,2,5,6,7) 有两个最简解；F2 = A'B' + BC 先占用 A'B'、BC
    const p = plaProgram(["F2 = A'B' + BC", "F1 = A'B'C' + A'B'C + A'BC' + AB'C + ABC' + ABC"]);
    const f1 = p.outputs[1];
    expect(f1.alternatives).toBe(2);
    expect(p.stats.terms).toBe(4);
    expect(checkEquivalence(plaOutputExpr(p, 1), f1.expr).equivalent).toBe(true);
  });
});

describe("LUT", () => {
  it("bitsToHex：最高地址在最左", () => {
    expect(bitsToHex([0, 0, 0, 1])).toBe("8");
    expect(bitsToHex(Uint8Array.from({ length: 16 }, (_, i) => (i === 15 ? 1 : 0)))).toBe("8000");
    expect(bitsToHex([1, 0])).toBe("1");
  });
  it("4-LUT 内容：AB+CD → F888，四变量奇校验 → 6996", () => {
    const m = mapToLut("AB+CD", 4);
    expect(m.fits).toBe(true);
    expect(m.single!.hex).toBe("F888");
    expect(mapToLut("A⊕B⊕C⊕D", 4).single!.hex).toBe("6996");
    expect(mapToLut("ABCD", 4).single!.hex).toBe("8000");
  });
  it("LUT 内容与真值表逐位一致；变量少于 k 时内容按周期复制", () => {
    const e = parseExpr("AB+C");
    const m = mapToLut("Y = AB+C", 4);
    expect(m.single!.inputs).toEqual([null, "A", "B", "C"]);
    const t = truthTable(e, ["A", "B", "C"]);
    for (let i = 0; i < 16; i++) expect(m.single!.bits[i]).toBe(t[i % 8]);
    const m6 = mapToLut("A'B + CD'E + F", 6);
    expect(m6.single!.bits).toHaveLength(64);
    const t6 = truthTable(parseExpr("A'B + CD'E + F"), ["A", "B", "C", "D", "E", "F"]);
    expect([...m6.single!.bits]).toEqual([...t6]);
  });
  it("选择器容量：4-LUT 装 2 选 1，6-LUT 装 4 选 1", () => {
    expect(maxMuxSelects(3)).toBe(1);
    expect(maxMuxSelects(4)).toBe(1);
    expect(maxMuxSelects(6)).toBe(2);
  });
  it("5 变量函数映射到 4-LUT：3 个 LUT、2 级", () => {
    const m = mapToLut("A⊕B⊕C⊕D⊕E", 4);
    expect(m.fits).toBe(false);
    expect(m.plan!.selectVars).toEqual(["A"]);
    expect(m.plan!.cofactors.map((c) => c.hex)).toEqual(["6996", "9669"]);
    expect(m.plan!.totalLuts).toBe(3);
    expect(m.plan!.depth).toBe(2);
  });
  it("6 变量 / 4-LUT：4 个余因子 + 3 个 2 选 1；8 变量 / 6-LUT：4 个余因子 + 1 个 4 选 1", () => {
    const a = mapToLut("ABCDEF", 4);
    expect(a.plan!.totalLuts).toBe(7);
    expect(a.plan!.depth).toBe(3);
    expect(a.plan!.optimizedLuts).toBe(4);
    const b = mapToLut("AB + CDEFGH'", 6);
    expect(b.plan!.cofactors).toHaveLength(4);
    expect(b.plan!.mux).toEqual([{ selects: ["A", "B"], luts: 1, inputsPerLut: 6 }]);
    expect(b.plan!.totalLuts).toBe(5);
    // 8 变量：4-LUT 需 16 + (8+4+2+1) = 31 个、5 级；6-LUT 需 4 + 1 = 5 个、2 级
    const c4 = mapToLut("A⊕B⊕C⊕D⊕E⊕F⊕G⊕H", 4);
    expect(c4.plan!.totalLuts).toBe(31);
    expect(c4.plan!.depth).toBe(5);
    const c6 = mapToLut("A⊕B⊕C⊕D⊕E⊕F⊕G⊕H", 6);
    expect(c6.plan!.totalLuts).toBe(5);
    expect(c6.plan!.depth).toBe(2);
    // 例题：AB+C 映射到 4-LUT，内容 EAEA；AB'+C'D → 2F22
    expect(mapToLut("AB+C", 4).single!.hex).toBe("EAEA");
    expect(mapToLut("AB'+C'D", 4).single!.hex).toBe("2F22");
  });
  it("PAL 输出反馈：G = A'B + AB'，F = G'C + GC' 等价于 A⊕B⊕C", () => {
    const fb = substitute(parseExpr("G'C + GC'"), { G: parseExpr("A'B + AB'") });
    expect(checkEquivalence(fb, parseExpr("A⊕B⊕C")).equivalent).toBe(true);
    expect(plaProgram(["F = A⊕B⊕C"]).outputs[0].terms).toHaveLength(4);
  });
  it("级联方案逐点读出 = 原函数", () => {
    for (const [src, k] of [["A⊕B⊕C⊕D⊕E", 4], ["AB'C + D'EF + A'G", 4], ["AB + CDEFGH'", 6], ["ABCDEFG + A'B'", 6]] as const) {
      const m = mapToLut(src, k);
      const n = m.vars.length;
      for (let x = 0; x < 2 ** n; x++) {
        const ins = bitsOf(x, n);
        const env = Object.fromEntries(m.vars.map((name, j) => [name, ins[j]]));
        expect(lutRead(m, ins).value, `${src} @ ${x}`).toBe(evaluate(m.expr, env));
      }
    }
  });
  it("错误信息", () => {
    expect(() => mapToLut("", 4)).toThrow(/请输入/);
    expect(() => mapToLut("A+(", 4)).toThrow(/无法解析/);
    expect(() => mapToLut("1", 4)).toThrow(/没有变量/);
    expect(() => mapToLut("AB", 7)).toThrow(/k 应为/);
    expect(() => mapToLut("ABCDEFGHIJK", 6)).toThrow(/上限/);
    expect(() => mapToLut("ABC", 2)).toThrow(/2 选 1/);
  });
});
