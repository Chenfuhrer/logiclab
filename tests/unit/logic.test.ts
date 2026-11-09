import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  parseExpr,
  tryParse,
  truthTable,
  minterms,
  checkEquivalence,
  toLatex,
  toText,
  minimizeSOP,
  minimizePOS,
  solutionToSOP,
  tableFromMinterms,
  BDD,
  type Expr,
  dual,
  complementByDeMorgan,
  not,
  verifyDerivation,
} from "@/lib/logic";

const tt = (s: string, vars?: string[]) => Array.from(truthTable(parseExpr(s), vars));

describe("解析器：运算优先级", () => {
  it("与优先于或", () => {
    expect(tt("A+BC", ["A", "B", "C"])).toEqual(tt("A+(B·C)", ["A", "B", "C"]));
    expect(tt("A+BC", ["A", "B", "C"])).not.toEqual(tt("(A+B)C", ["A", "B", "C"]));
  });
  it("非优先于与：AB' = A·(B')，不是 (AB)'", () => {
    expect(tt("AB'", ["A", "B"])).toEqual([0, 0, 1, 0]);
    expect(tt("(AB)'", ["A", "B"])).toEqual([1, 1, 1, 0]);
  });
  it("与优先于异或，异或优先于或", () => {
    const vars = ["A", "B", "C", "D"];
    expect(tt("A⊕BC", vars)).toEqual(tt("A⊕(BC)", vars));
    expect(tt("A+B⊕C", vars)).toEqual(tt("A+(B⊕C)", vars));
    expect(tt("A⊕B+C", vars)).toEqual(tt("(A⊕B)+C", vars));
  });
  it("异或左结合", () => {
    expect(tt("A^B^C", ["A", "B", "C"])).toEqual(tt("(A⊕B)⊕C", ["A", "B", "C"]));
  });
});

describe("解析器：多种写法", () => {
  const same = ["A'B+AB'", "Ā·B + A·B̄", "!A&B | A&~B", "¬A∧B ∨ A∧¬B", "A⊕B", "A^B", "A XOR B", "\\overline{A}B+A\\overline{B}", "(A⊙B)'", "NOT (A XNOR B)"];
  it.each(same)("%s ≡ A⊕B", (s) => {
    expect(checkEquivalence(parseExpr(s), parseExpr("A⊕B")).equivalent).toBe(true);
  });
  it("下标变量与并列", () => {
    const e = parseExpr("Q0Q1 + Q_2 + Q₃'");
    expect(toText(e)).toBe("Q0Q1 + Q2 + Q3'");
  });
  it("长非号与德摩根", () => {
    expect(checkEquivalence(parseExpr("\\overline{A+B}"), parseExpr("A'B'")).equivalent).toBe(true);
    expect(checkEquivalence(parseExpr("(AB)'"), parseExpr("A'+B'")).equivalent).toBe(true);
  });
  it("双重否定", () => {
    expect(tt("A''", ["A"])).toEqual([0, 1]);
    expect(tt("!!A", ["A"])).toEqual([0, 1]);
  });
  it("常量", () => {
    expect(tt("A+1", ["A"])).toEqual([1, 1]);
    expect(tt("A·0", ["A"])).toEqual([0, 0]);
    expect(tt("1")).toEqual([1]);
  });
});

describe("解析器：非法输入", () => {
  it.each([
    ["", "表达式为空"],
    ["A+", "不完整"],
    ["(A+B", "右括号"],
    ["A+B)", "右括号"],
    ["A+2", "0 或 1"],
    ["A=B", "="],
    ["A#B", "无法识别"],
    ["+A", "运算符位置"],
    ["'A", "撇号"],
  ])("%s", (src, msg) => {
    const r = tryParse(src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

describe("真值表与最小项", () => {
  it("变量顺序：第一个变量为最高位", () => {
    // F = A：在 A=1 的行（m4..m7）为 1
    expect(minterms(truthTable(parseExpr("A"), ["A", "B", "C"]))).toEqual([4, 5, 6, 7]);
    expect(minterms(truthTable(parseExpr("C"), ["A", "B", "C"]))).toEqual([1, 3, 5, 7]);
  });
  it("Y = AB + A'C + BC 的最小项", () => {
    expect(minterms(truthTable(parseExpr("AB+A'C+BC"), ["A", "B", "C"]))).toEqual([1, 3, 6, 7]);
  });
});

describe("等价验证", () => {
  it("包含律", () => {
    expect(checkEquivalence(parseExpr("AB+A'C+BC"), parseExpr("AB+A'C")).equivalent).toBe(true);
  });
  it("不等价时给出反例", () => {
    const r = checkEquivalence(parseExpr("A+B"), parseExpr("AB"));
    expect(r.equivalent).toBe(false);
    const { env, left, right } = r.counterexample!;
    expect(left).not.toBe(right);
    expect(env.A !== env.B).toBe(true);
  });
  it("常量函数", () => {
    expect(checkEquivalence(parseExpr("A+A'"), parseExpr("1")).equivalent).toBe(true);
    expect(checkEquivalence(parseExpr("AA'"), parseExpr("0")).equivalent).toBe(true);
  });
  it("变量多于 16 个时走 BDD", () => {
    const vars = Array.from({ length: 20 }, (_, i) => `X${i}`);
    const a = parseExpr(vars.join("⊕"));
    const b = parseExpr(`(${vars.slice(0, 10).join("⊕")})⊕(${vars.slice(10).join("⊕")})`);
    const r = checkEquivalence(a, b);
    expect(r.method).toBe("bdd");
    expect(r.equivalent).toBe(true);
    const r2 = checkEquivalence(a, parseExpr(vars.slice(1).join("⊕")));
    expect(r2.equivalent).toBe(false);
    expect(r2.counterexample!.left).not.toBe(r2.counterexample!.right);
  });
});

// 随机表达式生成器
const VARS = ["A", "B", "C", "D", "E"];
const exprArb: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom(...VARS).map((name) => ({ k: "var", name }) as Expr),
    fc.constantFrom(0, 1).map((x) => ({ k: "const", v: x as 0 | 1 }) as Expr),
    tie("e").map((e) => ({ k: "not", e }) as Expr),
    fc.array(tie("e"), { minLength: 2, maxLength: 3 }).map((es) => ({ k: "and", es }) as Expr),
    fc.array(tie("e"), { minLength: 2, maxLength: 3 }).map((es) => ({ k: "or", es }) as Expr),
    fc.tuple(tie("e"), tie("e")).map(([a, b]) => ({ k: "xor", a, b }) as Expr),
    fc.tuple(tie("e"), tie("e")).map(([a, b]) => ({ k: "xnor", a, b }) as Expr),
  ),
})).e;

describe("性质测试（fast-check）", () => {
  it("toText → parse 往返后逻辑等价", () => {
    fc.assert(
      fc.property(exprArb, (e) => checkEquivalence(e, parseExpr(toText(e)), VARS).equivalent),
      { numRuns: 400 },
    );
  });
  it("BDD 与穷举真值表结论一致", () => {
    fc.assert(
      fc.property(exprArb, exprArb, (a, b) => {
        const t = checkEquivalence(a, b, VARS).equivalent;
        const bdd = new BDD(VARS);
        return t === (bdd.build(a) === bdd.build(b));
      }),
      { numRuns: 400 },
    );
  });
  it("反演定理：反演式 = 原函数取反", () => {
    fc.assert(
      fc.property(exprArb, (e) => checkEquivalence(complementByDeMorgan(e), not(e), VARS).equivalent),
      { numRuns: 300 },
    );
  });
  it("对偶定理：两式相等则对偶式也相等（以 e 与其 QM 化简结果为例）", () => {
    fc.assert(
      fc.property(exprArb, (e) => {
        const tbl = truthTable(e, VARS);
        const res = minimizeSOP(5, minterms(tbl), [], VARS);
        const m = solutionToSOP(res);
        return checkEquivalence(dual(e), dual(m), VARS).equivalent;
      }),
      { numRuns: 200 },
    );
  });
  it("QM 化简结果与原函数等价（含无关项时在非无关项上一致）", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(0, 1, 2), { minLength: 32, maxLength: 32 }), (cells) => {
        const ones = cells.flatMap((x, i) => (x === 1 ? [i] : []));
        const dcs = cells.flatMap((x, i) => (x === 2 ? [i] : []));
        const res = minimizeSOP(5, ones, dcs, VARS);
        return res.solutions.every((_, k) => {
          const t = truthTable(solutionToSOP(res, k), VARS);
          return cells.every((x, i) => x === 2 || t[i] === x);
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe("QM + Petrick", () => {
  it("经典例题：F(A,B,C,D)=Σm(0,1,2,5,6,7,8,9,10,14)", () => {
    const res = minimizeSOP(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
    expect(res.exact).toBe(true);
    // B'C' + CD' + A'BD；与独立暴力搜索结果核对
    expect(res.cost).toEqual({ terms: 3, literals: 7 });
    expect(res.cost).toEqual(bruteForceMinCost(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]));
  });
  it("循环质蕴含（无必要质蕴含项）有多个最简解：Σm(0,1,2,5,6,7)", () => {
    const res = minimizeSOP(3, [0, 1, 2, 5, 6, 7]);
    expect(res.essential).toEqual([]);
    expect(res.solutions.length).toBe(2);
    expect(res.cost).toEqual({ terms: 3, literals: 6 });
  });
  it("无关项参与化简：8421BCD 中 ≥5 判断 Σm(5,6,7,8,9)+d(10..15) = A + BD + BC", () => {
    const res = minimizeSOP(4, [5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15]);
    expect(checkEquivalence(solutionToSOP(res), parseExpr("A+BD+BC")).equivalent).toBe(true);
    expect(res.cost).toEqual({ terms: 3, literals: 5 });
  });
  it("全 0 与全 1", () => {
    expect(minimizeSOP(3, []).cost.terms).toBe(0);
    const all = minimizeSOP(3, [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(toText(solutionToSOP(all))).toBe("1");
  });
  it("最简或与式", () => {
    const pos = minimizePOS(3, [1, 3, 6, 7]);
    expect(checkEquivalence(pos.expr, parseExpr("AB+A'C")).equivalent).toBe(true);
    expect(pos.expr.k).toBe("and");
  });
});

/**
 * 独立参考方法：枚举所有蕴含项（不经 QM 合并过程），
 * 按"项数最少、再字面量最少"做穷举最小覆盖搜索。用于验证 3 变量全部 256 个函数的最简性。
 */
function bruteForceMinCost(n: number, ones: number[]): { terms: number; literals: number } {
  if (ones.length === 0) return { terms: 0, literals: 0 };
  const size = 1 << n;
  const oneSet = new Set(ones);
  const imps: { cover: number; lits: number }[] = [];
  // 每个蕴含项 = 每个变量取 0/1/- 的组合（3^n 个）
  const total = 3 ** n;
  for (let code = 0; code < total; code++) {
    let c = code;
    let cover = 0;
    let lits = 0;
    const pattern: number[] = [];
    for (let j = 0; j < n; j++) {
      pattern.push(c % 3);
      c = Math.floor(c / 3);
    }
    let ok = true;
    for (let m = 0; m < size; m++) {
      const inside = pattern.every((p, j) => p === 2 || ((m >> (n - 1 - j)) & 1) === p);
      if (inside) {
        if (!oneSet.has(m)) {
          ok = false;
          break;
        }
        cover |= 1 << m;
      }
    }
    if (!ok) continue;
    lits = pattern.filter((p) => p !== 2).length;
    imps.push({ cover, lits });
  }
  const target = ones.reduce((s, m) => s | (1 << m), 0);
  let best = { terms: Infinity, literals: Infinity };
  // 按项数从小到大枚举组合
  const rec = (start: number, k: number, chosen: number, lits: number, cover: number) => {
    if (k === 0) {
      if (cover === target && (chosen < best.terms || (chosen === best.terms && lits < best.literals)))
        best = { terms: chosen, literals: lits };
      return;
    }
    for (let i = start; i < imps.length; i++) rec(i + 1, k - 1, chosen + 1, lits + imps[i].lits, cover | imps[i].cover);
  };
  for (let k = 1; k <= ones.length && best.terms === Infinity; k++) rec(0, k, 0, 0, 0);
  return best;
}

describe("穷举：全部 256 个三变量函数的最简性（独立参考方法）", () => {
  it("QM+Petrick 的成本与暴力最小覆盖一致，且结果等价", () => {
    for (let f = 0; f < 256; f++) {
      const ones = Array.from({ length: 8 }, (_, m) => m).filter((m) => (f >> m) & 1);
      const res = minimizeSOP(3, ones);
      expect(res.cost, `f=${f}`).toEqual(bruteForceMinCost(3, ones));
      const t = truthTable(solutionToSOP(res), ["A", "B", "C"]);
      expect(Array.from(t)).toEqual(Array.from(tableFromMinterms(3, ones)));
    }
  });
});

describe("LaTeX 输出", () => {
  it("上划线与撇号两种记法", () => {
    const e = parseExpr("A'B + (C+D)'");
    expect(toLatex(e)).toBe("\\overline{A}B + \\overline{C + D}");
    expect(toLatex(e, { negation: "prime" })).toBe("A'B + \\left(C + D\\right)'");
  });
  it("下标与括号", () => {
    expect(toLatex(parseExpr("Q0Q1 ⊕ (A+B)"))).toBe("Q_{0}Q_{1} \\oplus \\left(A + B\\right)");
  });
});

describe("推导验证", () => {
  it("包含律推导链每一步都等价", () => {
    const r = verifyDerivation([
      { expr: "AB + A'C + BC" },
      { expr: "AB + A'C + BC(A+A')", rule: "multiply-one" },
      { expr: "AB + A'C + ABC + A'BC", rule: "distributive" },
      { expr: "AB(1+C) + A'C(1+B)", rule: "distributive" },
      { expr: "AB + A'C", rule: "identity" },
    ]);
    expect(r.every((s) => s.equivalentToPrev !== false)).toBe(true);
    expect(r[4].equivalentToStart).toBe(true);
  });
  it("错误的一步被指出", () => {
    const r = verifyDerivation([{ expr: "A + A'B" }, { expr: "A·B", rule: "absorption" }]);
    expect(r[1].equivalentToPrev).toBe(false);
    expect(r[1].counterexample).toBeTruthy();
  });
});

describe("判分：或与式题拒绝与或式", async () => {
  const { grade } = await import("@/lib/exercises/grade");
  const ex = { id: "t", lesson: "kmap", level: "analysis", title: "", prompt: "", knowledge: [], hints: ["h"], explanation: "e", kind: "expression", vars: ["A", "B", "C"], target: { minterms: [1, 3, 6, 7] }, minimal: "pos" } as const;
  it("与或式不算或与式", () => {
    const r = grade(ex as never, { kind: "expression", value: "AB+A'C" });
    expect(r.correct).toBe(false);
    expect(r.partial).toBe(true);
  });
  it("最简或与式正确", () => {
    expect(grade(ex as never, { kind: "expression", value: "(A+C)(A'+B)" }).correct).toBe(true);
  });
});
