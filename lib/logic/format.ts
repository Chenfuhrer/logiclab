import type { Expr } from "./ast";

export type NegationStyle = "overline" | "prime";
export interface FormatOptions {
  negation?: NegationStyle;
  /** 与运算是否显式写出 · */
  andDot?: boolean;
}

const PREC: Record<Expr["k"], number> = { or: 1, xor: 2, xnor: 2, and: 3, not: 4, var: 5, const: 5 };

function varLatex(name: string): string {
  const m = /^([A-Za-z]+)(\d+)$/.exec(name);
  return m ? `${m[1]}_{${m[2]}}` : name;
}

export function toLatex(e: Expr, opt: FormatOptions = {}): string {
  const neg = opt.negation ?? "overline";
  const dot = opt.andDot ? " \\cdot " : "";
  const wrap = (x: Expr, minPrec: number) => {
    const s = go(x);
    return PREC[x.k] < minPrec ? `\\left(${s}\\right)` : s;
  };
  const go = (x: Expr): string => {
    switch (x.k) {
      case "const":
        return String(x.v);
      case "var":
        return varLatex(x.name);
      case "not":
        if (neg === "overline") return `\\overline{${go(x.e)}}`;
        return PREC[x.e.k] >= 4 ? `${go(x.e)}'` : `\\left(${go(x.e)}\\right)'`;
      case "and": {
        // 并列书写；两个相邻的上划线之间加细空格，避免与长非号 \overline{AB} 混淆
        if (dot) return x.es.map((c) => wrap(c, 3)).join(dot);
        let s = "";
        x.es.forEach((c, i) => {
          if (i > 0 && neg === "overline" && c.k === "not" && x.es[i - 1].k === "not") s += "\\,";
          if (i > 0 && (c.k === "const" || x.es[i - 1].k === "const")) s += " \\cdot ";
          s += wrap(c, 3);
        });
        return s;
      }
      case "or":
        return x.es.map((c) => wrap(c, 2)).join(" + ");
      case "xor":
      case "xnor":
        return `${wrap(x.a, 3)} ${x.k === "xor" ? "\\oplus" : "\\odot"} ${wrap(x.b, 3)}`;
    }
  };
  return go(e);
}

/** 纯文本形式（用于输入框回填、错误提示），非号统一用撇号 */
export function toText(e: Expr, opt: { andDot?: boolean } = {}): string {
  const wrap = (x: Expr, minPrec: number) => (PREC[x.k] < minPrec ? `(${go(x)})` : go(x));
  const go = (x: Expr): string => {
    switch (x.k) {
      case "const":
        return String(x.v);
      case "var":
        return x.name;
      case "not":
        return PREC[x.e.k] >= 4 ? `${go(x.e)}'` : `(${go(x.e)})'`;
      case "and":
        // 子项以数字开头（常量）时必须显式写 ·，否则 "A0" 会被读成变量 A0
        return x.es
          .map((c) => wrap(c, 3))
          .reduce((acc, s, i) => {
            if (i === 0) return s;
            // 常量、或多字母变量名（如 EN、QA）相邻时必须显式写 ·，否则读回会被拆成单字母变量
            const multi = (c: Expr) => c.k === "var" && /^[A-Za-z]{2,}/.test(c.name);
            const needDot = opt.andDot || /^\d/.test(s) || multi(x.es[i]) || multi(x.es[i - 1]) || (x.es[i - 1].k === "not" && multi((x.es[i - 1] as { e: Expr }).e));
            return acc + (needDot ? "·" : "") + s;
          }, "");
      case "or":
        return x.es.map((c) => wrap(c, 2)).join(" + ");
      case "xor":
      case "xnor":
        return `${wrap(x.a, 3)} ${x.k === "xor" ? "⊕" : "⊙"} ${wrap(x.b, 3)}`;
    }
  };
  return go(e);
}

/** 变量名的 LaTeX 形式（Q0 → Q_{0}） */
export function varToLatex(name: string, negated = false, neg: NegationStyle = "overline"): string {
  const s = varLatex(name);
  if (!negated) return s;
  return neg === "overline" ? `\\overline{${s}}` : `${s}'`;
}

/** 次态符号：Q^{n+1} 或 Q^{*} */
export type NextStateStyle = "n+1" | "star";
export function nextStateLatex(name: string, style: NextStateStyle = "n+1"): string {
  const s = varLatex(name);
  return style === "star" ? `${s}^{*}` : `${s}^{n+1}`;
}
