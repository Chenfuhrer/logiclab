import { HdlError, type Decl, type Expr, type Item, type LValue, type Module, type Pos, type Sens, type Stmt } from "./ast";

type TokKind = "id" | "num" | "op" | "kw" | "eof";
interface Tok {
  k: TokKind;
  v: string;
  pos: Pos;
  num?: { width: number | null; val: number; xm: number };
}

const KEYWORDS = new Set([
  "module", "endmodule", "input", "output", "inout", "wire", "reg", "logic", "assign", "always", "always_ff", "always_comb",
  "begin", "end", "if", "else", "case", "endcase", "default", "posedge", "negedge", "or", "parameter", "localparam",
  "initial", "integer", "function", "task", "generate", "signed", "casez", "casex", "for", "while", "forever",
]);
const UNSUPPORTED: Record<string, string> = {
  initial: "不支持 initial 块（可在 reg 声明处写初值，或在实验台中设置输入激励）",
  integer: "不支持 integer 类型，请使用 reg [n:0]",
  function: "不支持 function",
  task: "不支持 task",
  generate: "不支持 generate",
  signed: "不支持 signed（本子集只处理无符号数）",
  casez: "不支持 casez，请改用 case",
  casex: "不支持 casex，请改用 case",
  for: "不支持 for 循环",
  while: "不支持 while 循环",
  forever: "不支持 forever",
  inout: "不支持 inout 端口",
};
const OPS = ["<<<", ">>>", "===", "!==", "~^", "^~", "~&", "~|", "<=", ">=", "==", "!=", "&&", "||", "<<", ">>", "(", ")", "[", "]", "{", "}", ";", ",", ":", "?", "=", "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "<", ">", "@", ".", "#", "$"];

function parseNumber(text: string, pos: Pos): { width: number | null; val: number; xm: number } {
  const t = text.replace(/_/g, "");
  const m = /^(\d*)'([bBoOdDhH])([0-9a-fA-FxXzZ?]+)$/.exec(t);
  if (!m) {
    if (!/^\d+$/.test(t)) throw new HdlError(`无法识别的数字 ${text}`, pos);
    const v = Number(t);
    if (v > 0xffffffff) throw new HdlError("数值超过 32 位", pos);
    return { width: null, val: v >>> 0, xm: 0 };
  }
  const width = m[1] ? Number(m[1]) : null;
  if (width !== null && (width < 1 || width > 32)) throw new HdlError("位宽必须在 1～32 之间", pos);
  const base = { b: 2, o: 8, d: 10, h: 16 }[m[2].toLowerCase() as "b"]!;
  const digits = m[3].toLowerCase();
  let val = 0;
  let xm = 0;
  if (base === 10) {
    if (/[xz?]/.test(digits)) throw new HdlError("十进制数中不能有 x/z", pos);
    val = Number(digits) >>> 0;
  } else {
    const bits = base === 2 ? 1 : base === 8 ? 3 : 4;
    for (const ch of digits) {
      val = (val << bits) >>> 0;
      xm = (xm << bits) >>> 0;
      if (ch === "x" || ch === "z" || ch === "?") xm = (xm | ((1 << bits) - 1)) >>> 0;
      else {
        const d = parseInt(ch, base);
        if (Number.isNaN(d)) throw new HdlError(`数字 ${text} 中的 ${ch} 不是合法的 ${base} 进制数字`, pos);
        val = (val | d) >>> 0;
      }
    }
  }
  if (width !== null && width < 32) {
    const mask = (2 ** width - 1) >>> 0;
    val = (val & mask) >>> 0;
    xm = (xm & mask) >>> 0;
  }
  return { width, val, xm };
}

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const adv = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else col++;
      i++;
    }
  };
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      adv(1);
      continue;
    }
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") adv(1);
      continue;
    }
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new HdlError("块注释没有结束 */", { line, col });
      adv(end + 2 - i);
      continue;
    }
    const pos = { line, col };
    if (ch === "`") throw new HdlError("不支持编译指令（如 `timescale、`define）", pos);
    const num = /^(\d[\d_]*)?'[bBoOdDhH][0-9a-fA-FxXzZ?_]+|^\d[\d_]*/.exec(src.slice(i));
    if (num) {
      toks.push({ k: "num", v: num[0], pos, num: parseNumber(num[0], pos) });
      adv(num[0].length);
      continue;
    }
    if (ch === "'") throw new HdlError("数字格式错误，例如 4'b1010、8'hFF", pos);
    const id = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(src.slice(i));
    if (id) {
      toks.push({ k: KEYWORDS.has(id[0]) ? "kw" : "id", v: id[0], pos });
      adv(id[0].length);
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      if (op === "$") throw new HdlError("不支持系统任务（如 $display、$finish）", pos);
      if (op === "===" || op === "!==") throw new HdlError(`不支持 ${op}，请使用 == 或 !=`, pos);
      if (op === "<<<" || op === ">>>") throw new HdlError(`不支持算术移位 ${op}`, pos);
      toks.push({ k: "op", v: op, pos });
      adv(op.length);
      continue;
    }
    throw new HdlError(`无法识别的字符 "${ch}"`, pos);
  }
  toks.push({ k: "eof", v: "", pos: { line, col } });
  return toks;
}

class P {
  i = 0;
  constructor(private t: Tok[]) {}
  peek(o = 0) {
    return this.t[Math.min(this.i + o, this.t.length - 1)];
  }
  next() {
    return this.t[this.i++];
  }
  is(v: string) {
    const t = this.peek();
    return (t.k === "op" || t.k === "kw") && t.v === v;
  }
  eat(v: string) {
    if (this.is(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  expect(v: string, what?: string) {
    const t = this.peek();
    if (!this.eat(v)) throw new HdlError(`这里应为 "${v}"${what ? `（${what}）` : ""}，实际是 "${t.v || "文件结束"}"`, t.pos);
  }
  ident(what = "标识符") {
    const t = this.next();
    if (t.k === "kw" && UNSUPPORTED[t.v]) throw new HdlError(UNSUPPORTED[t.v], t.pos);
    if (t.k !== "id") throw new HdlError(`这里应为${what}，实际是 "${t.v || "文件结束"}"`, t.pos);
    return t.v;
  }

  file(): Module[] {
    const mods: Module[] = [];
    while (this.peek().k !== "eof") mods.push(this.module());
    if (!mods.length) throw new HdlError("没有找到 module");
    return mods;
  }

  module(): Module {
    const pos = this.peek().pos;
    this.expect("module");
    const name = this.ident("模块名");
    const ports: string[] = [];
    const items: Item[] = [];
    if (this.eat("#")) throw new HdlError("不支持 #(parameter) 形式，请在模块内用 parameter 声明", pos);
    if (this.eat("(")) {
      if (!this.is(")")) {
        // ANSI：input wire [3:0] a, b, output reg q
        let dir: "input" | "output" | null = null;
        let kind: "wire" | "reg" = "wire";
        let msb: Expr | null = null;
        let lsb: Expr | null = null;
        for (;;) {
          const t = this.peek();
          if (t.k === "kw" && (t.v === "input" || t.v === "output")) {
            this.next();
            dir = t.v;
            kind = "wire";
            msb = lsb = null;
            if (this.eat("wire") || this.eat("logic")) kind = "wire";
            else if (this.eat("reg")) kind = "reg";
            if (this.is("[")) [msb, lsb] = this.range();
          } else if (t.k === "kw" && UNSUPPORTED[t.v]) throw new HdlError(UNSUPPORTED[t.v], t.pos);
          const ppos = this.peek().pos;
          const pname = this.ident("端口名");
          ports.push(pname);
          let init: Expr | undefined;
          if (this.eat("=")) {
            if (kind !== "reg") throw new HdlError("只有 output reg 端口可以写初值", ppos);
            init = this.expr();
          }
          if (dir) items.push({ k: "decl", decls: [{ name: pname, kind, dir, msb, lsb, init, pos: ppos }] });
          if (!this.eat(",")) break;
        }
      }
      this.expect(")", "端口列表结束");
    }
    this.expect(";");
    while (!this.is("endmodule")) {
      if (this.peek().k === "eof") throw new HdlError(`模块 ${name} 缺少 endmodule`, this.peek().pos);
      items.push(...this.item());
    }
    this.expect("endmodule");
    return { name, ports, items, pos };
  }

  range(): [Expr, Expr] {
    this.expect("[");
    const msb = this.expr();
    this.expect(":", "位宽写法为 [msb:lsb]");
    const lsb = this.expr();
    this.expect("]");
    return [msb, lsb];
  }

  item(): Item[] {
    const t = this.peek();
    if (this.is("#")) throw new HdlError("不支持延迟 #（本解释器按时钟周期推进，不模拟门延迟）", t.pos);
    if (["and", "nand", "or", "nor", "xor", "xnor", "not", "buf"].includes(t.v) && (this.peek(1).k === "id" || (this.peek(1).k === "op" && this.peek(1).v === "(")))
      throw new HdlError(`不支持门级原语（如 ${t.v} g1(y, a, b);），请改用连续赋值，例如 assign y = a & b;`, t.pos);
    if (t.k === "kw" && UNSUPPORTED[t.v]) throw new HdlError(UNSUPPORTED[t.v], t.pos);
    if (this.is("input") || this.is("output") || this.is("wire") || this.is("reg") || this.is("logic")) {
      let dir: "input" | "output" | undefined;
      let kind: "wire" | "reg" = "wire";
      if (this.eat("input")) dir = "input";
      else if (this.eat("output")) dir = "output";
      if (this.eat("reg")) kind = "reg";
      else if (this.eat("logic")) kind = dir === "input" ? "wire" : "reg";
      else this.eat("wire");
      let msb: Expr | null = null;
      let lsb: Expr | null = null;
      if (this.is("[")) [msb, lsb] = this.range();
      const decls: Decl[] = [];
      const extra: Item[] = [];
      do {
        const pos = this.peek().pos;
        const name = this.ident("信号名");
        if (this.is("[")) throw new HdlError("不支持存储器数组（如 reg [7:0] mem [0:15]）", this.peek().pos);
        const d: Decl = { name, kind, dir, msb, lsb, pos };
        if (this.eat("=")) {
          const e = this.expr();
          if (kind === "reg") d.init = e;
          else extra.push({ k: "assign", lhs: { k: "id", name, pos }, rhs: e, pos });
        }
        decls.push(d);
      } while (this.eat(","));
      this.expect(";", "声明语句结尾");
      return [{ k: "decl", decls }, ...extra];
    }
    if (this.is("parameter") || this.is("localparam")) {
      const local = this.next().v === "localparam";
      if (this.is("[")) this.range();
      const out: Item[] = [];
      do {
        const pos = this.peek().pos;
        const name = this.ident("参数名");
        this.expect("=");
        out.push({ k: "param", name, value: this.expr(), local, pos });
      } while (this.eat(","));
      this.expect(";");
      return out;
    }
    if (this.is("assign")) {
      this.next();
      if (this.is("#")) throw new HdlError("不支持延迟 #（本解释器按时钟周期推进，不模拟门延迟）", this.peek().pos);
      const out: Item[] = [];
      do {
        const pos = this.peek().pos;
        const lhs = this.lvalue();
        this.expect("=", "assign 使用 =");
        out.push({ k: "assign", lhs, rhs: this.expr(), pos });
      } while (this.eat(","));
      this.expect(";");
      return out;
    }
    if (this.is("always") || this.is("always_ff") || this.is("always_comb")) {
      const kw = this.next();
      let sens: Sens;
      if (kw.v === "always_comb") sens = { kind: "comb" };
      else {
        this.expect("@", "always 后应写敏感列表 @(...)");
        if (this.eat("*")) sens = { kind: "comb" };
        else {
          this.expect("(");
          if (this.eat("*")) sens = { kind: "comb" };
          else {
            const edges: { edge: "posedge" | "negedge"; name: string }[] = [];
            const names: string[] = [];
            do {
              if (this.is("posedge") || this.is("negedge")) {
                const e = this.next().v as "posedge" | "negedge";
                edges.push({ edge: e, name: this.ident("时钟/复位信号名") });
              } else names.push(this.ident("敏感信号名"));
            } while (this.eat("or") || this.eat(","));
            if (edges.length && names.length) throw new HdlError("敏感列表不能混用边沿与电平信号", kw.pos);
            sens = edges.length ? { kind: "edge", edges } : { kind: "level", names };
          }
          this.expect(")");
        }
      }
      return [{ k: "always", sens, body: this.stmt(), pos: kw.pos }];
    }
    if (t.k === "id" && (this.peek(1).k === "id" || (this.peek(1).k === "op" && this.peek(1).v === "#"))) {
      // 模块例化：mod u1 (.a(x), .b(y));
      const modName = this.ident();
      const pos = this.peek().pos;
      const params: { name: string; value: Expr }[] = [];
      if (this.eat("#")) {
        this.expect("(");
        if (!this.is(")")) {
          do {
            const ppos = this.peek().pos;
            if (!this.eat(".")) throw new HdlError("参数覆盖请使用按名形式，例如 #(.INIT(1'b0))", ppos);
            const pn = this.ident("参数名");
            this.expect("(");
            params.push({ name: pn, value: this.expr() });
            this.expect(")");
          } while (this.eat(","));
        }
        this.expect(")");
      }
      const name = this.ident("实例名");
      this.expect("(");
      const conns: { port: string; expr: Expr | null; pos: Pos }[] = [];
      if (!this.is(")")) {
        do {
          const cpos = this.peek().pos;
          if (!this.eat(".")) throw new HdlError("模块例化请使用按名连接，例如 .clk(clk)", cpos);
          const port = this.ident("端口名");
          this.expect("(");
          const expr = this.is(")") ? null : this.expr();
          this.expect(")");
          conns.push({ port, expr, pos: cpos });
        } while (this.eat(","));
      }
      this.expect(")");
      this.expect(";");
      return [{ k: "inst", module: modName, name, params, conns, pos }];
    }
    throw new HdlError(`无法识别的语句开头 "${t.v}"`, t.pos);
  }

  stmt(): Stmt {
    const t = this.peek();
    const pos = t.pos;
    if (this.is("#")) throw new HdlError("不支持延迟 #（本解释器按时钟周期推进，不模拟门延迟）", pos);
    if (t.k === "kw" && UNSUPPORTED[t.v]) throw new HdlError(UNSUPPORTED[t.v], t.pos);
    if (this.eat(";")) return { k: "empty", pos };
    if (this.eat("begin")) {
      if (this.eat(":")) this.ident("块名");
      const body: Stmt[] = [];
      while (!this.is("end")) {
        if (this.peek().k === "eof") throw new HdlError("begin 缺少对应的 end", pos);
        body.push(this.stmt());
      }
      this.expect("end");
      return { k: "block", body, pos };
    }
    if (this.eat("if")) {
      this.expect("(");
      const cond = this.expr();
      this.expect(")");
      const then = this.stmt();
      const els = this.eat("else") ? this.stmt() : undefined;
      return { k: "if", cond, then, else: els, pos };
    }
    if (this.eat("case")) {
      this.expect("(");
      const expr = this.expr();
      this.expect(")");
      const items: { labels: Expr[] | "default"; body: Stmt }[] = [];
      while (!this.is("endcase")) {
        if (this.peek().k === "eof") throw new HdlError("case 缺少 endcase", pos);
        if (this.eat("default")) {
          this.eat(":");
          items.push({ labels: "default", body: this.stmt() });
          continue;
        }
        const labels = [this.expr()];
        while (this.eat(",")) labels.push(this.expr());
        this.expect(":", "case 分支标签后应为冒号");
        items.push({ labels, body: this.stmt() });
      }
      this.expect("endcase");
      return { k: "case", expr, items, pos };
    }
    const lhs = this.lvalue();
    let blocking: boolean;
    if (this.eat("<=")) blocking = false;
    else if (this.eat("=")) blocking = true;
    else throw new HdlError(`赋值语句应使用 = 或 <=，实际是 "${this.peek().v}"`, this.peek().pos);
    const rhs = this.expr();
    this.expect(";", "语句结尾缺少分号");
    return { k: "assign", blocking, lhs, rhs, pos };
  }

  lvalue(): LValue {
    const pos = this.peek().pos;
    if (this.eat("{")) {
      const parts = [this.lvalue()];
      while (this.eat(",")) parts.push(this.lvalue());
      this.expect("}");
      return { k: "concat", parts, pos };
    }
    const name = this.ident("被赋值的信号名");
    if (this.eat("[")) {
      const a = this.expr();
      if (this.eat(":")) {
        const b = this.expr();
        this.expect("]");
        return { k: "part", name, msb: a, lsb: b, pos };
      }
      this.expect("]");
      return { k: "bit", name, index: a, pos };
    }
    return { k: "id", name, pos };
  }

  // 表达式：优先级从低到高
  expr(): Expr {
    const c = this.binary(0);
    if (this.is("?")) {
      const pos = this.next().pos;
      const a = this.expr();
      this.expect(":", "条件运算符 ? : ");
      const b = this.expr();
      return { k: "cond", c, a, b, pos };
    }
    return c;
  }

  static LEVELS: string[][] = [["||"], ["&&"], ["|", "~|"], ["^", "~^", "^~"], ["&", "~&"], ["==", "!="], ["<", "<=", ">", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];

  binary(level: number): Expr {
    if (level >= P.LEVELS.length) return this.unary();
    let a = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.k === "op" && P.LEVELS[level].includes(t.v)) {
        this.next();
        const b = this.binary(level + 1);
        a = { k: "binary", op: t.v === "^~" ? "~^" : t.v, a, b, pos: t.pos };
      } else return a;
    }
  }

  unary(): Expr {
    const t = this.peek();
    if (t.k === "op" && ["!", "~", "-", "+", "&", "|", "^", "~&", "~|", "~^", "^~"].includes(t.v)) {
      this.next();
      return { k: "unary", op: t.v === "^~" ? "~^" : t.v, e: this.unary(), pos: t.pos };
    }
    return this.primary();
  }

  primary(): Expr {
    const t = this.next();
    const pos = t.pos;
    if (t.k === "num") return { k: "num", ...t.num!, pos };
    if (t.k === "op" && t.v === "(") {
      const e = this.expr();
      this.expect(")");
      return e;
    }
    if (t.k === "op" && t.v === "{") {
      const first = this.expr();
      if (this.eat("{")) {
        // 复制 {n{a,b}}
        const parts = [this.expr()];
        while (this.eat(",")) parts.push(this.expr());
        this.expect("}");
        this.expect("}");
        return { k: "repl", count: first, parts, pos };
      }
      const parts = [first];
      while (this.eat(",")) parts.push(this.expr());
      this.expect("}");
      return { k: "concat", parts, pos };
    }
    if (t.k === "id") {
      if (this.eat("[")) {
        const a = this.expr();
        if (this.eat(":")) {
          const b = this.expr();
          this.expect("]");
          return { k: "part", name: t.v, msb: a, lsb: b, pos };
        }
        this.expect("]");
        return { k: "bit", name: t.v, index: a, pos };
      }
      return { k: "id", name: t.v, pos };
    }
    if (t.k === "kw" && UNSUPPORTED[t.v]) throw new HdlError(UNSUPPORTED[t.v], pos);
    throw new HdlError(`表达式在 "${t.v || "文件结束"}" 处无法继续`, pos);
  }
}

export function parseVerilog(src: string): Module[] {
  return new P(tokenize(src)).file();
}
