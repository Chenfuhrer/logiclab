import type { Expr } from "./ast";
import { checkEquivalence, describeCounterexample } from "./equivalence";
import { parseExpr } from "./parser";

/** 逻辑代数公式库：推导的每一步必须注明依据 */
export const RULES = {
  "complement-law": { name: "互补律", latex: "A + \\overline{A} = 1,\\quad A\\overline{A} = 0" },
  "identity": { name: "0-1 律", latex: "A + 0 = A,\\ A\\cdot 1 = A,\\ A + 1 = 1,\\ A\\cdot 0 = 0" },
  "idempotent": { name: "重叠律", latex: "A + A = A,\\quad AA = A" },
  "distributive": { name: "分配律", latex: "A(B + C) = AB + AC,\\quad A + BC = (A+B)(A+C)" },
  "absorption": { name: "吸收律", latex: "A + AB = A,\\quad A + \\overline{A}B = A + B" },
  "consensus": { name: "冗余项定理（包含律）", latex: "AB + \\overline{A}C + BC = AB + \\overline{A}C" },
  "demorgan": { name: "反演律（德·摩根定理）", latex: "\\overline{A+B} = \\overline{A}\\,\\overline{B},\\quad \\overline{AB} = \\overline{A} + \\overline{B}" },
  "involution": { name: "还原律", latex: "\\overline{\\overline{A}} = A" },
  "multiply-one": { name: "配项法", latex: "X = X(A + \\overline{A})" },
  "commutative": { name: "交换律 / 结合律", latex: "A+B=B+A,\\ AB=BA" },
  "merge": { name: "合并项", latex: "AB + A\\overline{B} = A" },
  "xor-def": { name: "异或定义", latex: "A\\oplus B = A\\overline{B} + \\overline{A}B" },
  "characteristic": { name: "特性方程代入", latex: "Q^{n+1} = J\\overline{Q^n} + \\overline{K}Q^n" },
} as const;

export type RuleId = keyof typeof RULES;

export interface DerivationStep {
  /** 当前表达式（文本形式，交给解析器） */
  expr: string;
  rule?: RuleId;
  /** 这一步的逻辑解释 */
  explain?: string;
  /** 适用条件 */
  condition?: string;
  /** 常见错误 */
  pitfall?: string;
}

export interface VerifiedStep extends DerivationStep {
  parsed: Expr | null;
  parseError?: string;
  /** 与上一步逻辑等价？第一步为 null */
  equivalentToPrev: boolean | null;
  /** 与第一步逻辑等价？ */
  equivalentToStart: boolean | null;
  counterexample?: string;
}

/**
 * 校验推导链：每一步都与上一步逐一比较等价性。
 * 推导中引入的变量并集用于穷举，从而在"配项"时也能正确判断。
 */
export function verifyDerivation(steps: DerivationStep[]): VerifiedStep[] {
  const out: VerifiedStep[] = [];
  let first: Expr | null = null;
  let prev: Expr | null = null;
  for (const s of steps) {
    let parsed: Expr | null = null;
    let parseError: string | undefined;
    try {
      parsed = parseExpr(s.expr);
    } catch (e) {
      parseError = (e as Error).message;
    }
    let equivalentToPrev: boolean | null = null;
    let equivalentToStart: boolean | null = null;
    let counterexample: string | undefined;
    if (parsed && prev) {
      const r = checkEquivalence(prev, parsed);
      equivalentToPrev = r.equivalent;
      if (!r.equivalent) counterexample = describeCounterexample(r, "本步", "上一步");
    }
    if (parsed && first) equivalentToStart = checkEquivalence(first, parsed).equivalent;
    out.push({ ...s, parsed, parseError, equivalentToPrev, equivalentToStart, counterexample });
    if (parsed) {
      if (!first) first = parsed;
      prev = parsed;
    }
  }
  return out;
}
