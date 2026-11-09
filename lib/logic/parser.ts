import { type Expr, and, or, not, xor, xnor, C0, C1 } from "./ast";

/**
 * 布尔表达式解析器（递归下降）。
 *
 * 支持的写法：
 *   或   A+B  A|B  A∨B  A OR B
 *   与   AB  A·B  A*B  A&B  A∧B  A AND B
 *   非   A′  A'  Ā  A̅  !A  ~A  ¬A  NOT A  \overline{AB}  \bar{A}
 *   异或 A⊕B  A^B  A XOR B
 *   同或 A⊙B  A XNOR B
 *   常量 0 1
 * 变量名：一个字母，后接可选的数字下标（Q0、Q_1、Q₂）。因此 "AB" 是 A·B，"Q0Q1" 是 Q0·Q1。
 *
 * 优先级（高→低）：非 > 与 > 异或/同或 > 或。
 */

export class ParseError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

type Tok =
  | { t: "id"; name: string; pos: number }
  | { t: "const"; v: 0 | 1; pos: number }
  | { t: "or" | "and" | "xor" | "xnor" | "not" | "prime" | "lp" | "rp" | "overline"; pos: number }
  | { t: "end"; pos: number };

const PRECOMPOSED_BAR: Record<string, string> = {
  "Ā": "A", "ā": "a", "Ē": "E", "ē": "e", "Ī": "I", "ī": "i", "Ō": "O", "ō": "o",
  "Ū": "U", "ū": "u", "Ȳ": "Y", "ȳ": "y", "Ǣ": "AE",
};
const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const COMBINING_BAR = new Set(["̄", "̅"]);
const WORD_OPS: Record<string, Tok["t"]> = { OR: "or", AND: "and", XOR: "xor", XNOR: "xnor", NOT: "not" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  // 判断单词运算符：前后必须是空白、括号或字符串边界
  const isBoundary = (ch: string | undefined) => ch === undefined || /[\s()]/.test(ch);
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // LaTeX 风格长非号
    if (src.startsWith("\\overline{", i) || src.startsWith("\\bar{", i)) {
      const len = src.startsWith("\\overline{", i) ? 10 : 5;
      toks.push({ t: "overline", pos: i });
      toks.push({ t: "lp", pos: i + len - 1 });
      i += len;
      continue;
    }
    if (ch === "{") {
      toks.push({ t: "lp", pos: i });
      i++;
      continue;
    }
    if (ch === "}") {
      toks.push({ t: "rp", pos: i });
      i++;
      continue;
    }
    // 单词运算符
    const word = /^[A-Za-z]+/.exec(src.slice(i));
    if (word && WORD_OPS[word[0].toUpperCase()] && isBoundary(src[i - 1]) && isBoundary(src[i + word[0].length])) {
      toks.push({ t: WORD_OPS[word[0].toUpperCase()], pos: i } as Tok);
      i += word[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(ch) || PRECOMPOSED_BAR[ch]) {
      const start = i;
      let name: string;
      let barred = false;
      if (PRECOMPOSED_BAR[ch]) {
        name = PRECOMPOSED_BAR[ch];
        barred = true;
      } else {
        name = ch;
      }
      i++;
      // 组合上划线可能出现在字母后
      while (i < n && COMBINING_BAR.has(src[i])) {
        barred = !barred;
        i++;
      }
      // 下标：Q0、Q_0、Q₀、Q_{0}
      let digits = "";
      if (src[i] === "_") {
        if (src[i + 1] === "{") {
          const m = /^_\{(\d+)\}/.exec(src.slice(i));
          if (!m) throw new ParseError("下标格式应为 Q_{0}", i);
          digits = m[1];
          i += m[0].length;
        } else {
          const m = /^_(\d+)/.exec(src.slice(i));
          if (!m) throw new ParseError("下划线后应跟数字下标，例如 Q_0", i);
          digits = m[1];
          i += m[0].length;
        }
      } else {
        while (i < n && (/\d/.test(src[i]) || SUBSCRIPT_DIGITS.includes(src[i]))) {
          const d = SUBSCRIPT_DIGITS.indexOf(src[i]);
          digits += d >= 0 ? String(d) : src[i];
          i++;
        }
      }
      while (i < n && COMBINING_BAR.has(src[i])) {
        barred = !barred;
        i++;
      }
      toks.push({ t: "id", name: name + digits, pos: start });
      if (barred) toks.push({ t: "prime", pos: i - 1 });
      continue;
    }
    if (ch === "0" || ch === "1") {
      toks.push({ t: "const", v: ch === "1" ? 1 : 0, pos: i });
      i++;
      continue;
    }
    if (/\d/.test(ch)) throw new ParseError(`常量只能是 0 或 1，不能是 "${ch}"`, i);
    const single: Record<string, Tok["t"]> = {
      "+": "or", "|": "or", "∨": "or",
      "·": "and", "⋅": "and", "•": "and", "*": "and", "&": "and", "∧": "and", "×": "and",
      "⊕": "xor", "^": "xor",
      "⊙": "xnor",
      "!": "not", "~": "not", "¬": "not",
      "′": "prime", "'": "prime", "’": "prime", "`": "prime",
      "(": "lp", "（": "lp", "[": "lp",
      ")": "rp", "）": "rp", "]": "rp",
    };
    const t = single[ch];
    if (t) {
      toks.push({ t, pos: i } as Tok);
      i++;
      continue;
    }
    if (ch === "\\") {
      const m = /^\\(oplus|odot|cdot|lor|land|lnot|neg)\b/.exec(src.slice(i));
      if (m) {
        const map: Record<string, Tok["t"]> = { oplus: "xor", odot: "xnor", cdot: "and", lor: "or", land: "and", lnot: "not", neg: "not" };
        toks.push({ t: map[m[1]], pos: i } as Tok);
        i += m[0].length;
        continue;
      }
    }
    if (ch === "=") throw new ParseError("表达式中不能出现 \"=\"；如需写 Y = …，请只输入等号右边", i);
    throw new ParseError(`无法识别的字符 "${ch}"`, i);
  }
  toks.push({ t: "end", pos: n });
  return toks;
}

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok {
    return this.toks[this.i];
  }
  private next(): Tok {
    return this.toks[this.i++];
  }
  parse(): Expr {
    if (this.peek().t === "end") throw new ParseError("表达式为空", 0);
    const e = this.parseOr();
    const t = this.peek();
    if (t.t !== "end") {
      if (t.t === "rp") throw new ParseError("右括号多余或不匹配", t.pos);
      throw new ParseError("表达式在此处无法继续解析", t.pos);
    }
    return e;
  }
  private parseOr(): Expr {
    const items = [this.parseXor()];
    while (this.peek().t === "or") {
      this.next();
      items.push(this.parseXor());
    }
    return items.length === 1 ? items[0] : or(...items);
  }
  private parseXor(): Expr {
    let left = this.parseAnd();
    while (this.peek().t === "xor" || this.peek().t === "xnor") {
      const op = this.next().t;
      const right = this.parseAnd();
      left = op === "xor" ? xor(left, right) : xnor(left, right);
    }
    return left;
  }
  private startsUnary(t: Tok): boolean {
    return t.t === "id" || t.t === "const" || t.t === "lp" || t.t === "not" || t.t === "overline";
  }
  private parseAnd(): Expr {
    const items = [this.parseUnary()];
    for (;;) {
      const t = this.peek();
      if (t.t === "and") {
        this.next();
        items.push(this.parseUnary());
      } else if (this.startsUnary(t)) {
        items.push(this.parseUnary()); // 并列书写即为与
      } else break;
    }
    return items.length === 1 ? items[0] : and(...items);
  }
  private parseUnary(): Expr {
    const t = this.peek();
    if (t.t === "not") {
      this.next();
      return not(this.parseUnary());
    }
    let e = this.parseAtom();
    while (this.peek().t === "prime") {
      this.next();
      e = not(e);
    }
    return e;
  }
  private parseAtom(): Expr {
    const t = this.next();
    switch (t.t) {
      case "id":
        return { k: "var", name: t.name };
      case "const":
        return t.v ? C1 : C0;
      case "overline":
      case "lp": {
        const isBar = t.t === "overline";
        if (isBar) this.next(); // 吃掉 overline 后面的 {
        const inner = this.parseOr();
        const close = this.next();
        if (close.t !== "rp") throw new ParseError("缺少右括号", close.pos);
        return isBar ? not(inner) : inner;
      }
      case "end":
        throw new ParseError("表达式不完整：运算符后缺少操作数", t.pos);
      case "rp":
        throw new ParseError("括号内为空或右括号位置错误", t.pos);
      case "prime":
        throw new ParseError("撇号 ′ 前面缺少被取反的变量", t.pos);
      default:
        throw new ParseError("运算符位置错误：此处应为变量、常量或左括号", t.pos);
    }
  }
}

export function parseExpr(src: string): Expr {
  return new Parser(tokenize(src)).parse();
}

/** 安全解析：不抛出异常 */
export function tryParse(src: string): { ok: true; expr: Expr } | { ok: false; error: string; pos: number } {
  try {
    return { ok: true, expr: parseExpr(src) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos };
    throw e;
  }
}

/** 解析 "Y = 表达式" 形式；没有等号时名称为 null */
export function parseAssignment(src: string): { name: string | null; expr: Expr } {
  const m = /^\s*([A-Za-z]\w*(?:\^\{?n\+1\}?|\*)?)\s*=(.*)$/s.exec(src);
  if (m) return { name: m[1], expr: parseExpr(m[2]) };
  return { name: null, expr: parseExpr(src) };
}
