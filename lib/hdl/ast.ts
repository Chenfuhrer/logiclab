/**
 * 教学用 Verilog 子集的 AST。
 *
 * 支持范围（可综合 RTL 的常用子集）：
 *   module（ANSI 与非 ANSI 端口）、input/output/wire/reg、[msb:lsb] 位宽、parameter/localparam、
 *   assign、always @(*) / @(a or b) / @(posedge x or negedge y)、begin…end、if/else、case/casez 以外的 case…endcase、
 *   阻塞 = 与非阻塞 <=、模块例化（按名端口连接 .p(expr)）、reg 声明初值。
 * 不支持：initial、#延迟、$display 等系统任务、function/task、generate、signed、casez/casex、多维数组、三态 z 驱动。
 */
export interface Pos {
  line: number;
  col: number;
}

export type Expr =
  | { k: "num"; width: number | null; val: number; xm: number; pos: Pos }
  | { k: "id"; name: string; pos: Pos }
  | { k: "bit"; name: string; index: Expr; pos: Pos }
  | { k: "part"; name: string; msb: Expr; lsb: Expr; pos: Pos }
  | { k: "concat"; parts: Expr[]; pos: Pos }
  | { k: "repl"; count: Expr; parts: Expr[]; pos: Pos }
  | { k: "unary"; op: string; e: Expr; pos: Pos }
  | { k: "binary"; op: string; a: Expr; b: Expr; pos: Pos }
  | { k: "cond"; c: Expr; a: Expr; b: Expr; pos: Pos };

export type LValue =
  | { k: "id"; name: string; pos: Pos }
  | { k: "bit"; name: string; index: Expr; pos: Pos }
  | { k: "part"; name: string; msb: Expr; lsb: Expr; pos: Pos }
  | { k: "concat"; parts: LValue[]; pos: Pos };

export type Stmt =
  | { k: "block"; body: Stmt[]; pos: Pos }
  | { k: "if"; cond: Expr; then: Stmt; else?: Stmt; pos: Pos }
  | { k: "case"; expr: Expr; items: { labels: Expr[] | "default"; body: Stmt }[]; pos: Pos }
  | { k: "assign"; blocking: boolean; lhs: LValue; rhs: Expr; pos: Pos }
  | { k: "empty"; pos: Pos };

export interface Decl {
  name: string;
  kind: "wire" | "reg";
  dir?: "input" | "output";
  msb: Expr | null;
  lsb: Expr | null;
  init?: Expr;
  pos: Pos;
}

export type Sens = { kind: "comb" } | { kind: "edge"; edges: { edge: "posedge" | "negedge"; name: string }[] } | { kind: "level"; names: string[] };

export type Item =
  | { k: "decl"; decls: Decl[] }
  | { k: "param"; name: string; value: Expr; local: boolean; pos: Pos }
  | { k: "assign"; lhs: LValue; rhs: Expr; pos: Pos }
  | { k: "always"; sens: Sens; body: Stmt; pos: Pos }
  | { k: "inst"; module: string; name: string; params: { name: string; value: Expr }[]; conns: { port: string; expr: Expr | null; pos: Pos }[]; pos: Pos };

export interface Module {
  name: string;
  ports: string[];
  items: Item[];
  pos: Pos;
}

export class HdlError extends Error {
  constructor(
    message: string,
    public pos?: Pos,
  ) {
    super(pos ? `第 ${pos.line} 行第 ${pos.col} 列：${message}` : message);
    this.name = "HdlError";
  }
}
