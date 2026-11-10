import { HdlError, type Expr, type LValue, type Module, type Pos, type Stmt } from "./ast";
import { parseVerilog } from "./parser";

/**
 * 教学用 Verilog 子集解释器（不是完整的 HDL 仿真器）。
 *
 * 语义（零延迟、按“步”推进，面向可综合 RTL）：
 *  - 值：每个信号最多 32 位，逐位 0/1/X（未初始化的 reg 为 X）；不建模 Z 与强度。
 *  - 连续赋值与 always @(*) 构成组合过程，反复求值直到稳定（不动点）；超过上限判为组合环路不收敛。
 *  - 每次外部输入变化后：组合稳定 → 检查边沿 → 按源代码顺序执行被触发的边沿过程
 *    （阻塞赋值立即生效，非阻塞赋值先求右值、排队）→ 统一提交非阻塞赋值 → 组合再稳定 → 若又产生边沿（如异步复位）则继续，
 *    同一时刻内的这些轮次用 delta 序号区分。这与本平台电路仿真的“先统一采样、再统一更新”一致。
 *  - 多个边沿过程在同一轮被触发且一个用阻塞赋值写、另一个读同一变量时，结果依赖执行顺序（竞争），给出警告。
 *  - 静态检查：多驱动、always @(*) 中未在所有分支赋值（会推断锁存器）、敏感列表不完整、时序块中的阻塞赋值。
 *
 * 与标准 Verilog 仿真器不同之处（教学取舍，界面与课时中均有说明）：
 *  - 不同 always 块用阻塞赋值时固定按源代码顺序执行（标准未规定顺序），并给出竞争警告；
 *  - 敏感列表不完整时按组合逻辑（综合结果）执行；组合块中的 <= 按 = 执行；
 *  - 组合过程在 0 时刻即求值一次（标准的 always @(*) 要等第一个事件）；
 *  - 超出位宽的常数直接截断，不给警告。
 */

export interface Val {
  w: number;
  v: number;
  x: number;
}
const MASK = (w: number) => (w >= 32 ? 0xffffffff : (2 ** w - 1) >>> 0);
const V = (w: number, v: number, x = 0): Val => ({ w, v: (v & MASK(w) & ~x) >>> 0, x: (x & MASK(w)) >>> 0 });
const allX = (w: number): Val => V(w, 0, MASK(w));
const ext = (a: Val, w: number): Val => ({ w, v: a.v, x: a.x });
const known = (a: Val) => a.x === 0;

interface Sig {
  name: string;
  w: number;
  lsb: number;
  kind: "wire" | "reg";
  top?: "input" | "output";
  val: Val;
  pos: Pos;
}

type Proc =
  | { kind: "comb"; body: Stmt; reads: Set<string>; writes: Set<string>; pos: Pos; cont: boolean; label: string; conn?: boolean }
  | { kind: "edge"; edges: { edge: "posedge" | "negedge"; sig: string }[]; body: Stmt; reads: Set<string>; writes: Set<string>; blockingWrites: Set<string>; pos: Pos; label: string };

export interface HdlIssue {
  level: "error" | "warning" | "info";
  message: string;
  pos?: Pos;
}

export interface HdlTracePoint {
  t: number;
  d: number;
  v: number;
  x: number;
}

// ───────────────────────── 展开（扁平化层次） ─────────────────────────

interface Scope {
  prefix: string;
  params: Map<string, Val>;
  sigs: Map<string, Sig>;
}

function constEval(e: Expr, sc: Scope, what: string): number {
  const r = evalExpr(e, (n, pos) => {
    const p = sc.params.get(n);
    if (p) return p;
    throw new HdlError(`${what}必须是常量，${n} 不是参数`, pos);
  }, () => {
    throw new HdlError(`${what}必须是常量`, e.pos);
  }, 32);
  if (!known(r)) throw new HdlError(`${what}不能含 x`, e.pos);
  return r.v;
}

function renameExpr(e: Expr, sc: Scope): Expr {
  const ref = (name: string, pos: Pos) => {
    if (sc.params.has(name)) return null;
    if (!sc.sigs.has(sc.prefix + name)) throw new HdlError(`信号 ${name} 未声明`, pos);
    return sc.prefix + name;
  };
  switch (e.k) {
    case "num":
      return e;
    case "id": {
      const p = sc.params.get(e.name);
      if (p) return { k: "num", width: p.w === 32 ? null : p.w, val: p.v, xm: p.x, pos: e.pos };
      return { ...e, name: ref(e.name, e.pos)! };
    }
    case "bit":
      return { ...e, name: ref(e.name, e.pos)!, index: renameExpr(e.index, sc) };
    case "part":
      return { ...e, name: ref(e.name, e.pos)!, msb: renameExpr(e.msb, sc), lsb: renameExpr(e.lsb, sc) };
    case "concat":
      return { ...e, parts: e.parts.map((p) => renameExpr(p, sc)) };
    case "repl":
      return { ...e, count: renameExpr(e.count, sc), parts: e.parts.map((p) => renameExpr(p, sc)) };
    case "unary":
      return { ...e, e: renameExpr(e.e, sc) };
    case "binary":
      return { ...e, a: renameExpr(e.a, sc), b: renameExpr(e.b, sc) };
    case "cond":
      return { ...e, c: renameExpr(e.c, sc), a: renameExpr(e.a, sc), b: renameExpr(e.b, sc) };
  }
}
function renameL(l: LValue, sc: Scope): LValue {
  const ref = (n: string, pos: Pos) => {
    if (!sc.sigs.has(sc.prefix + n)) throw new HdlError(`被赋值的信号 ${n} 未声明`, pos);
    return sc.prefix + n;
  };
  switch (l.k) {
    case "id":
      return { ...l, name: ref(l.name, l.pos) };
    case "bit":
      return { ...l, name: ref(l.name, l.pos), index: renameExpr(l.index, sc) };
    case "part":
      return { ...l, name: ref(l.name, l.pos), msb: renameExpr(l.msb, sc), lsb: renameExpr(l.lsb, sc) };
    case "concat":
      return { ...l, parts: l.parts.map((p) => renameL(p, sc)) };
  }
}
function renameS(s: Stmt, sc: Scope): Stmt {
  switch (s.k) {
    case "block":
      return { ...s, body: s.body.map((b) => renameS(b, sc)) };
    case "if":
      return { ...s, cond: renameExpr(s.cond, sc), then: renameS(s.then, sc), else: s.else ? renameS(s.else, sc) : undefined };
    case "case":
      return { ...s, expr: renameExpr(s.expr, sc), items: s.items.map((it) => ({ labels: it.labels === "default" ? "default" : it.labels.map((l) => renameExpr(l, sc)), body: renameS(it.body, sc) })) };
    case "assign":
      return { ...s, lhs: renameL(s.lhs, sc), rhs: renameExpr(s.rhs, sc) };
    case "empty":
      return s;
  }
}

function exprReads(e: Expr, out: Set<string>) {
  switch (e.k) {
    case "num":
      return;
    case "id":
      out.add(e.name);
      return;
    case "bit":
      out.add(e.name);
      exprReads(e.index, out);
      return;
    case "part":
      out.add(e.name);
      return;
    case "concat":
      e.parts.forEach((p) => exprReads(p, out));
      return;
    case "repl":
      e.parts.forEach((p) => exprReads(p, out));
      return;
    case "unary":
      exprReads(e.e, out);
      return;
    case "binary":
      exprReads(e.a, out);
      exprReads(e.b, out);
      return;
    case "cond":
      exprReads(e.c, out);
      exprReads(e.a, out);
      exprReads(e.b, out);
  }
}
function lvNames(l: LValue, out: Set<string>, reads: Set<string>) {
  if (l.k === "concat") l.parts.forEach((p) => lvNames(p, out, reads));
  else {
    out.add(l.name);
    if (l.k === "bit") exprReads(l.index, reads);
  }
}
function stmtRW(s: Stmt, reads: Set<string>, writes: Set<string>, blocking: Set<string>) {
  switch (s.k) {
    case "block":
      s.body.forEach((b) => stmtRW(b, reads, writes, blocking));
      return;
    case "if":
      exprReads(s.cond, reads);
      stmtRW(s.then, reads, writes, blocking);
      if (s.else) stmtRW(s.else, reads, writes, blocking);
      return;
    case "case":
      exprReads(s.expr, reads);
      s.items.forEach((it) => {
        if (it.labels !== "default") it.labels.forEach((l) => exprReads(l, reads));
        stmtRW(it.body, reads, writes, blocking);
      });
      return;
    case "assign": {
      exprReads(s.rhs, reads);
      const w = new Set<string>();
      lvNames(s.lhs, w, reads);
      w.forEach((n) => {
        writes.add(n);
        if (s.blocking) blocking.add(n);
      });
      return;
    }
  }
}

/** 在所有执行路径上都一定被赋值的变量（用于锁存器推断检查） */
function definitelyAssigned(s: Stmt, widthOf: (e: Expr) => number): Set<string> {
  switch (s.k) {
    case "empty":
      return new Set();
    case "assign": {
      const w = new Set<string>();
      lvNames(s.lhs, w, new Set());
      return w;
    }
    case "block": {
      const r = new Set<string>();
      s.body.forEach((b) => definitelyAssigned(b, widthOf).forEach((n) => r.add(n)));
      return r;
    }
    case "if": {
      if (!s.else) return new Set();
      const a = definitelyAssigned(s.then, widthOf);
      const b = definitelyAssigned(s.else, widthOf);
      return new Set([...a].filter((n) => b.has(n)));
    }
    case "case": {
      const hasDefault = s.items.some((it) => it.labels === "default");
      const labels = s.items.flatMap((it) => (it.labels === "default" ? [] : it.labels));
      const full = hasDefault || (labels.every((l) => l.k === "num" && l.xm === 0) && new Set(labels.map((l) => (l as { val: number }).val)).size >= 2 ** widthOf(s.expr));
      if (!full) return new Set();
      const sets = s.items.map((it) => definitelyAssigned(it.body, widthOf));
      return new Set([...sets[0]].filter((n) => sets.every((x) => x.has(n))));
    }
  }
}

function paramEval(e: Expr, sc: Scope): Val {
  return evalExpr(e, (n, pos) => {
    const p = sc.params.get(n);
    if (p) return p;
    throw new HdlError(`参数值必须是常量，${n} 不是参数`, pos);
  }, () => {
    throw new HdlError("参数值必须是常量", e.pos);
  }, 0);
}

// ───────────────────────── 求值 ─────────────────────────

type Lookup = (name: string, pos: Pos) => Val;
type SigInfo = (name: string) => { w: number; lsb: number };

function evalExpr(e: Expr, get: Lookup, info: SigInfo, ctx: number): Val {
  switch (e.k) {
    case "num": {
      const w = e.width ?? 32;
      return V(Math.max(w, e.width === null ? Math.min(32, ctx) : w), e.val, e.xm);
    }
    case "id":
      return get(e.name, e.pos);
    case "bit": {
      const s = get(e.name, e.pos);
      const idx = evalExpr(e.index, get, info, 32);
      const lsb = info(e.name).lsb;
      if (!known(idx)) return allX(1);
      const p = idx.v - lsb;
      if (p < 0 || p >= s.w) return allX(1);
      return V(1, s.v >>> p, s.x >>> p);
    }
    case "part": {
      const s = get(e.name, e.pos);
      const lsb = info(e.name).lsb;
      const m = evalExpr(e.msb, get, info, 32);
      const l = evalExpr(e.lsb, get, info, 32);
      if (!known(m) || !known(l) || m.v < l.v) throw new HdlError("部分选择 [msb:lsb] 必须是常量且 msb ≥ lsb", e.pos);
      const w = m.v - l.v + 1;
      return V(w, s.v >>> (l.v - lsb), s.x >>> (l.v - lsb));
    }
    case "concat":
    case "repl": {
      const parts = e.parts.map((p) => evalExpr(p, get, info, 0));
      let n = 1;
      if (e.k === "repl") {
        const c = evalExpr(e.count, get, info, 32);
        if (!known(c) || c.v < 1) throw new HdlError("复制次数必须是正的常量", e.pos);
        n = c.v;
      }
      let w = 0;
      let v = 0;
      let x = 0;
      for (let r = 0; r < n; r++)
        for (const p of parts) {
          if (w + p.w > 32) throw new HdlError("拼接结果超过 32 位", e.pos);
          v = ((v << p.w) | p.v) >>> 0;
          x = ((x << p.w) | p.x) >>> 0;
          w += p.w;
        }
      return V(w, v, x);
    }
    case "unary": {
      const logical = e.op === "!" || e.op === "&" || e.op === "|" || e.op === "^" || e.op === "~&" || e.op === "~|" || e.op === "~^";
      const a = evalExpr(e.e, get, info, logical ? 0 : ctx);
      const W = logical ? a.w : Math.max(a.w, ctx);
      const ea = ext(a, W);
      switch (e.op) {
        case "~":
          return V(W, ~ea.v, ea.x);
        case "+":
          return ea;
        case "-":
          return known(ea) ? V(W, -ea.v >>> 0) : allX(W);
        case "!":
          if (ea.v !== 0) return V(1, 0);
          return ea.x ? allX(1) : V(1, 1);
        case "&":
        case "~&": {
          const knownZero = MASK(a.w) & ~a.v & ~a.x;
          let r: Val = knownZero ? V(1, 0) : a.x ? allX(1) : V(1, 1);
          if (e.op === "~&") r = r.x ? r : V(1, r.v ^ 1);
          return r;
        }
        case "|":
        case "~|": {
          let r: Val = a.v ? V(1, 1) : a.x ? allX(1) : V(1, 0);
          if (e.op === "~|") r = r.x ? r : V(1, r.v ^ 1);
          return r;
        }
        default: {
          if (a.x) return allX(1);
          let p = 0;
          for (let i = 0; i < a.w; i++) p ^= (a.v >>> i) & 1;
          return V(1, e.op === "~^" ? p ^ 1 : p);
        }
      }
    }
    case "binary": {
      const op = e.op;
      const cmp = ["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(op);
      const shift = op === "<<" || op === ">>";
      const a0 = evalExpr(e.a, get, info, cmp ? 0 : ctx);
      const b0 = evalExpr(e.b, get, info, cmp || shift ? 0 : ctx);
      if (op === "&&" || op === "||") {
        const ta = a0.v ? 1 : a0.x ? 2 : 0;
        const tb = b0.v ? 1 : b0.x ? 2 : 0;
        if (op === "&&") return ta === 0 || tb === 0 ? V(1, 0) : ta === 1 && tb === 1 ? V(1, 1) : allX(1);
        return ta === 1 || tb === 1 ? V(1, 1) : ta === 0 && tb === 0 ? V(1, 0) : allX(1);
      }
      if (shift) {
        const W = Math.max(a0.w, ctx);
        if (!known(b0)) return allX(W);
        const a = ext(a0, W);
        if (b0.v >= 32) return V(W, 0);
        return op === "<<" ? V(W, a.v << b0.v, a.x << b0.v) : V(W, a.v >>> b0.v, a.x >>> b0.v);
      }
      const W = cmp ? Math.max(a0.w, b0.w) : Math.max(a0.w, b0.w, ctx);
      const a = ext(a0, W);
      const b = ext(b0, W);
      const M = MASK(W);
      switch (op) {
        case "&": {
          const zero = (~a.v & ~a.x) | (~b.v & ~b.x);
          return V(W, a.v & b.v, (a.x | b.x) & ~zero & M);
        }
        case "|": {
          const one = a.v | b.v;
          return V(W, one, (a.x | b.x) & ~one & M);
        }
        case "^":
          return V(W, a.v ^ b.v, a.x | b.x);
        case "~^":
          return V(W, ~(a.v ^ b.v), a.x | b.x);
        case "~&": {
          const zero = (~a.v & ~a.x) | (~b.v & ~b.x);
          return V(W, ~(a.v & b.v), (a.x | b.x) & ~zero & M);
        }
        case "~|": {
          const one = a.v | b.v;
          return V(W, ~one, (a.x | b.x) & ~one & M);
        }
        case "+":
          return known(a) && known(b) ? V(W, (a.v + b.v) % 2 ** 32) : allX(W);
        case "-":
          return known(a) && known(b) ? V(W, (a.v - b.v) >>> 0) : allX(W);
        case "*":
          return known(a) && known(b) ? V(W, Math.imul(a.v, b.v) >>> 0) : allX(W);
        case "/":
          return known(a) && known(b) && b.v !== 0 ? V(W, Math.floor(a.v / b.v)) : allX(W);
        case "%":
          return known(a) && known(b) && b.v !== 0 ? V(W, a.v % b.v) : allX(W);
        case "==":
        case "!=": {
          const diff = (a.v ^ b.v) & ~a.x & ~b.x;
          let r: Val = diff ? V(1, 0) : a.x | b.x ? allX(1) : V(1, 1);
          if (op === "!=") r = r.x ? r : V(1, r.v ^ 1);
          return r;
        }
        default: {
          if (!known(a) || !known(b)) return allX(1);
          const r = op === "<" ? a.v < b.v : op === "<=" ? a.v <= b.v : op === ">" ? a.v > b.v : a.v >= b.v;
          return V(1, r ? 1 : 0);
        }
      }
    }
    case "cond": {
      const c = evalExpr(e.c, get, info, 0);
      if (c.v) return evalExpr(e.a, get, info, ctx);
      if (!c.x) return evalExpr(e.b, get, info, ctx);
      const a = evalExpr(e.a, get, info, ctx);
      const b = evalExpr(e.b, get, info, ctx);
      const W = Math.max(a.w, b.w, ctx);
      return V(W, a.v & b.v, a.x | b.x | (a.v ^ b.v));
    }
  }
}

function exprWidth(e: Expr, info: SigInfo): number {
  switch (e.k) {
    case "num":
      return e.width ?? 32;
    case "id":
      return info(e.name).w;
    case "bit":
      return 1;
    case "part":
      return 1;
    default:
      return 1;
  }
}

// ───────────────────────── 仿真器 ─────────────────────────

export class HdlSim {
  readonly issues: HdlIssue[] = [];
  readonly top: string;
  private sigs = new Map<string, Sig>();
  private procs: Proc[] = [];
  private lastEdge = new Map<string, number>();
  private traces = new Map<string, HdlTracePoint[]>();
  time = 0;
  private delta = 0;
  cycles = 0;

  /**
   * opts.init：顶层输入在 0 时刻的初值（相当于 Testbench 中 reg clk = 0; 的声明初值），
   * 在建立初始状态之前生效，因此不产生边沿。之后用 set() 改变输入时，x→0 / x→1 与标准 Verilog 一样算作边沿。
   */
  constructor(src: string, opts: { top?: string; init?: Record<string, number> } = {}) {
    const mods = parseVerilog(src);
    const byName = new Map<string, Module>();
    for (const m of mods) {
      if (byName.has(m.name)) throw new HdlError(`模块 ${m.name} 重复定义`, m.pos);
      byName.set(m.name, m);
    }
    let top: Module | undefined;
    if (opts.top) {
      top = byName.get(opts.top);
      if (!top) throw new HdlError(`找不到顶层模块 ${opts.top}`);
    } else {
      const used = new Set(mods.flatMap((m) => m.items.flatMap((it) => (it.k === "inst" ? [it.module] : []))));
      const roots = mods.filter((m) => !used.has(m.name));
      top = roots[roots.length - 1] ?? mods[mods.length - 1];
    }
    this.top = top.name;
    this.elaborate(top, byName, "", [], true);
    this.checkStatic();
    for (const [n, v] of Object.entries(opts.init ?? {})) {
      const sg = this.sigs.get(n);
      if (!sg || sg.top !== "input") throw new HdlError(`初值中的 ${n} 不是顶层输入`);
      sg.val = V(sg.w, v);
    }
    // 初始：reg 初值已设置，其余为 X；组合稳定
    this.settle();
    for (const p of this.procs) if (p.kind === "edge") p.edges.forEach((e) => this.lastEdge.set(e.sig, this.bit0(e.sig)));
    for (const s of this.sigs.values()) this.traces.set(s.name, [{ t: 0, d: 0, v: s.val.v, x: s.val.x }]);
  }

  private elaborate(m: Module, lib: Map<string, Module>, prefix: string, stack: string[], isTop: boolean, overrides = new Map<string, Val>()) {
    if (stack.includes(m.name)) throw new HdlError(`模块 ${m.name} 递归例化`, m.pos);
    const sc: Scope = { prefix, params: new Map(), sigs: this.sigs };
    // 参数（允许含 x，用于触发器初值）；实例覆盖只作用于 parameter，不作用于 localparam
    for (const it of m.items)
      if (it.k === "param") {
        const ov = overrides.get(it.name);
        if (ov && !it.local) {
          sc.params.set(it.name, ov);
          continue;
        }
        sc.params.set(it.name, paramEval(it.value, sc));
      }
    for (const k of overrides.keys()) if (!m.items.some((it) => it.k === "param" && !it.local && it.name === k)) throw new HdlError(`模块 ${m.name} 没有可覆盖的参数 ${k}`, m.pos);
    // 声明
    const declared = new Set<string>();
    for (const it of m.items) {
      if (it.k !== "decl") continue;
      for (const d of it.decls) {
        let w = 1;
        let lsb = 0;
        if (d.msb && d.lsb) {
          const a = constEval(d.msb, sc, "位宽");
          const b = constEval(d.lsb, sc, "位宽");
          if (a < b) throw new HdlError("本解释器只支持 [msb:lsb] 且 msb ≥ lsb 的位序", d.pos);
          w = a - b + 1;
          lsb = b;
          if (w > 32) throw new HdlError("信号位宽不能超过 32 位", d.pos);
        }
        const name = prefix + d.name;
        const prev = this.sigs.get(name);
        if (prev && declared.has(d.name)) {
          // 非 ANSI：output q; reg q; 合并
          if (d.kind === "reg") prev.kind = "reg";
          if (d.msb) {
            prev.w = w;
            prev.lsb = lsb;
            prev.val = allX(w);
          }
          if (d.init) {
            const iv = paramEval(d.init, sc);
            prev.val = V(prev.w, iv.v, iv.x);
          }
          continue;
        }
        declared.add(d.name);
        const sig: Sig = { name, w, lsb, kind: d.kind, val: allX(w), pos: d.pos };
        if (isTop && d.dir) sig.top = d.dir;
        if (d.dir) (sig as Sig & { dir?: string }).dir = d.dir;
        if (d.init) {
          if (d.kind !== "reg") throw new HdlError("只有 reg 可以有初值", d.pos);
          const iv = paramEval(d.init, sc);
          sig.val = V(w, iv.v, iv.x);
        }
        this.sigs.set(name, sig);
      }
    }
    for (const p of m.ports) if (!declared.has(p)) throw new HdlError(`端口 ${p} 没有声明方向（input/output）`, m.pos);
    const label = isTop ? m.name : `${prefix.slice(0, -1)}（${m.name}）`;
    // 过程
    for (const it of m.items) {
      if (it.k === "assign") {
        const body: Stmt = { k: "assign", blocking: true, lhs: renameL(it.lhs, sc), rhs: renameExpr(it.rhs, sc), pos: it.pos };
        this.addComb(body, it.pos, true, label);
      } else if (it.k === "always") {
        const body = renameS(it.body, sc);
        if (it.sens.kind === "edge") {
          const reads = new Set<string>();
          const writes = new Set<string>();
          const blocking = new Set<string>();
          stmtRW(body, reads, writes, blocking);
          const edges = it.sens.edges.map((e) => {
            const n = prefix + e.name;
            if (!this.sigs.has(n)) throw new HdlError(`敏感列表中的 ${e.name} 未声明`, it.pos);
            return { edge: e.edge, sig: n };
          });
          this.procs.push({ kind: "edge", edges, body, reads, writes, blockingWrites: blocking, pos: it.pos, label });
        } else {
          const p = this.addComb(body, it.pos, false, label);
          if (it.sens.kind === "level") {
            const listed = new Set(it.sens.names.map((n) => prefix + n));
            const missing = [...p.reads].filter((r) => !listed.has(r) && !p.writes.has(r));
            if (missing.length)
              this.issues.push({ level: "warning", pos: it.pos, message: `敏感列表不完整：块内读取了 ${missing.map((x) => x.slice(prefix.length)).join("、")}，但它们不在 @(...) 中。真实仿真器只在列表中的信号变化时执行该块，综合结果却是完整的组合逻辑——仿真与综合会不一致。本解释器按组合逻辑（综合结果）执行，建议改用 @(*)。` });
          }
        }
      } else if (it.k === "inst") {
        const child = lib.get(it.module);
        if (!child) throw new HdlError(`找不到模块 ${it.module}`, it.pos);
        const cp = prefix + it.name + ".";
        const ov = new Map(it.params.map((p) => [p.name, paramEval(p.value, sc)] as [string, Val]));
        this.elaborate(child, lib, cp, [...stack, m.name], false, ov);
        const connected = new Set<string>();
        for (const c of it.conns) {
          if (!child.ports.includes(c.port)) throw new HdlError(`模块 ${it.module} 没有端口 ${c.port}`, c.pos);
          connected.add(c.port);
          if (!c.expr) continue;
          const ps = this.sigs.get(cp + c.port)! as Sig & { dir?: string };
          if (ps.dir === "input") {
            this.addComb({ k: "assign", blocking: true, lhs: { k: "id", name: cp + c.port, pos: c.pos }, rhs: renameExpr(c.expr, sc), pos: c.pos }, c.pos, true, label, true);
          } else {
            const lv = exprToL(c.expr);
            this.addComb({ k: "assign", blocking: true, lhs: renameL(lv, sc), rhs: { k: "id", name: cp + c.port, pos: c.pos }, pos: c.pos }, c.pos, true, label, true);
          }
        }
        for (const p of child.ports) {
          const ps = this.sigs.get(cp + p)! as Sig & { dir?: string };
          if (!connected.has(p) && ps.dir === "input") this.issues.push({ level: "warning", pos: it.pos, message: `实例 ${it.name} 的输入端口 ${p} 未连接，按 X 处理` });
        }
      }
    }
  }

  private addComb(body: Stmt, pos: Pos, cont: boolean, label: string, conn = false) {
    const reads = new Set<string>();
    const writes = new Set<string>();
    stmtRW(body, reads, writes, new Set());
    const p: Proc = { kind: "comb", body, reads, writes, pos, cont, label, conn };
    this.procs.push(p);
    return p;
  }

  private info: SigInfo = (n) => {
    const s = this.sigs.get(n)!;
    return { w: s.w, lsb: s.lsb };
  };

  private checkStatic() {
    const writers = new Map<string, Proc[]>();
    for (const p of this.procs) for (const w of p.writes) writers.set(w, [...(writers.get(w) ?? []), p]);
    for (const [n, ps] of writers) {
      const s = this.sigs.get(n)! as Sig & { dir?: string };
      if (s.top === "input") throw new HdlError(`不能给顶层输入端口 ${n} 赋值`, ps[0].pos);
      if (ps.length > 1) this.issues.push({ level: "error", pos: ps[1].pos, message: `${n} 被 ${ps.length} 处同时驱动（多驱动）。一个信号只能在一个 assign 或一个 always 块中被赋值。` });
      for (const p of ps) {
        if (p.kind === "comb" && p.cont && s.kind === "reg" && !p.conn) this.issues.push({ level: "error", pos: p.pos, message: `assign 只能驱动 wire，${n} 被声明为 reg` });
        if ((p.kind === "edge" || (p.kind === "comb" && !p.cont)) && s.kind === "wire" && !s.top && !(s as Sig & { dir?: string }).dir) this.issues.push({ level: "error", pos: p.pos, message: `always 块只能给 reg 赋值，${n} 是 wire` });
        if ((p.kind === "edge" || (p.kind === "comb" && !p.cont)) && s.kind === "wire" && (s as Sig & { dir?: string }).dir === "output") this.issues.push({ level: "error", pos: p.pos, message: `always 块只能给 reg 赋值，输出 ${n} 需要声明为 output reg` });
      }
    }
    for (const p of this.procs) {
      if (p.kind === "comb" && !p.cont) {
        const def = definitelyAssigned(p.body, (e) => exprWidth(e, this.info));
        const latch = [...p.writes].filter((w) => !def.has(w));
        if (latch.length)
          this.issues.push({ level: "warning", pos: p.pos, message: `组合 always 块中 ${latch.join("、")} 不是在所有分支都被赋值：综合时会推断出锁存器（输出保持旧值）。补全 else / default，或在块开头先给默认值。` });
        if (hasNonBlocking(p.body)) this.issues.push({ level: "warning", pos: p.pos, message: "组合 always 块中使用了非阻塞赋值 <=：组合逻辑应使用阻塞赋值 =（本解释器按 = 执行）" });
      }
      if (p.kind === "edge" && p.blockingWrites.size) {
        this.issues.push({ level: "info", pos: p.pos, message: `时序 always 块中对 ${[...p.blockingWrites].join("、")} 使用了阻塞赋值 =。时序逻辑建议一律使用 <=，否则同一时钟沿内的先后顺序会影响结果。` });
      }
    }
  }

  private bit0(n: string): number {
    const s = this.sigs.get(n)!;
    return s.val.x & 1 ? 2 : s.val.v & 1;
  }

  private get: Lookup = (n) => this.sigs.get(n)!.val;

  private write(l: LValue, val: Val, nba: { sig: Sig; v: Val; mask: number }[] | null) {
    if (l.k === "concat") {
      let off = 0;
      for (let i = l.parts.length - 1; i >= 0; i--) {
        const p = l.parts[i];
        const w = lvWidth(p, this.info);
        this.write(p, V(w, val.v >>> off, val.x >>> off), nba);
        off += w;
      }
      return;
    }
    const s = this.sigs.get(l.name)!;
    let mask = MASK(s.w);
    let shift = 0;
    if (l.k === "bit") {
      const idx = evalExpr(l.index, this.get, this.info, 32);
      if (!known(idx)) {
        // 下标未知：所有位都可能被写，统一置 X
        const v = { w: s.w, v: 0, x: MASK(s.w) };
        if (nba) nba.push({ sig: s, v, mask });
        else s.val = v;
        return;
      }
      shift = idx.v - s.lsb;
      if (shift < 0 || shift >= s.w) return;
      mask = (1 << shift) >>> 0;
    } else if (l.k === "part") {
      const m = evalExpr(l.msb, this.get, this.info, 32).v;
      const lo = evalExpr(l.lsb, this.get, this.info, 32).v;
      shift = lo - s.lsb;
      mask = (MASK(m - lo + 1) << shift) >>> 0;
    }
    const nv = { w: s.w, v: (val.v << shift) >>> 0, x: (val.x << shift) >>> 0 };
    if (nba) nba.push({ sig: s, v: nv, mask });
    else s.val = merge(s.val, nv, mask);
  }

  private exec(s: Stmt, nba: { sig: Sig; v: Val; mask: number }[] | null) {
    switch (s.k) {
      case "empty":
        return;
      case "block":
        s.body.forEach((b) => this.exec(b, nba));
        return;
      case "if": {
        const c = evalExpr(s.cond, this.get, this.info, 0);
        if (c.v) this.exec(s.then, nba);
        else if (s.else) this.exec(s.else, nba);
        return;
      }
      case "case": {
        const v = evalExpr(s.expr, this.get, this.info, 0);
        for (const it of s.items) {
          if (it.labels === "default") continue;
          for (const l of it.labels) {
            const lv = evalExpr(l, this.get, this.info, v.w);
            const W = Math.max(v.w, lv.w);
            if (ext(v, W).v === ext(lv, W).v && v.x === lv.x) {
              this.exec(it.body, nba);
              return;
            }
          }
        }
        const d = s.items.find((it) => it.labels === "default");
        if (d) this.exec(d.body, nba);
        return;
      }
      case "assign": {
        const w = lvWidth(s.lhs, this.info);
        const r = evalExpr(s.rhs, this.get, this.info, w);
        const val = V(w, r.v, r.x);
        if (!s.blocking && nba) this.write(s.lhs, val, nba);
        else this.write(s.lhs, val, null);
      }
    }
  }

  private settle() {
    for (let pass = 0; pass < 200; pass++) {
      let changed = false;
      for (const p of this.procs) {
        if (p.kind !== "comb") continue;
        const before = [...p.writes].map((n) => this.sigs.get(n)!.val);
        this.exec(p.body, null);
        [...p.writes].forEach((n, i) => {
          const a = this.sigs.get(n)!.val;
          if (a.v !== before[i].v || a.x !== before[i].x) changed = true;
        });
      }
      if (!changed) return;
    }
    throw new HdlError("组合逻辑存在环路且不收敛（例如 assign y = ~y;），仿真停止");
  }

  private record() {
    for (const s of this.sigs.values()) {
      const tr = this.traces.get(s.name)!;
      const last = tr[tr.length - 1];
      if (last.v !== s.val.v || last.x !== s.val.x) tr.push({ t: this.time, d: this.delta, v: s.val.v, x: s.val.x });
    }
  }

  /** 设置顶层输入（可同时设多个），并处理由此引起的全部事件 */
  set(inputs: Record<string, number | "x">) {
    for (const [n, val] of Object.entries(inputs)) {
      const s = this.sigs.get(n);
      if (!s || s.top !== "input") throw new HdlError(`${n} 不是顶层输入`);
      s.val = val === "x" ? allX(s.w) : V(s.w, val);
    }
    this.delta = 0;
    this.propagate();
  }

  private propagate() {
    for (let round = 0; round < 100; round++) {
      this.settle();
      this.record();
      const triggered: Extract<Proc, { kind: "edge" }>[] = [];
      const cur = new Map<string, number>();
      for (const p of this.procs) {
        if (p.kind !== "edge") continue;
        for (const e of p.edges) {
          const old = this.lastEdge.get(e.sig) ?? 2;
          const now = cur.get(e.sig) ?? this.bit0(e.sig);
          cur.set(e.sig, now);
          const pos = (old === 0 && now !== 0) || (old === 2 && now === 1);
          const neg = (old === 1 && now !== 1) || (old === 2 && now === 0);
          if ((e.edge === "posedge" && pos) || (e.edge === "negedge" && neg)) {
            if (!triggered.includes(p)) triggered.push(p);
          }
        }
      }
      for (const [k, v] of cur) this.lastEdge.set(k, v);
      if (!triggered.length) return;
      // 竞争检查
      for (const a of triggered)
        for (const b of triggered)
          if (a !== b)
            for (const n of a.blockingWrites)
              if (b.reads.has(n)) {
                const msg = `竞争：同一时钟沿触发的两个 always 块中，一个用阻塞赋值写 ${n}，另一个读 ${n}，结果取决于执行顺序（本解释器按源代码顺序执行）。改用非阻塞赋值 <= 可消除。`;
                if (!this.issues.some((i) => i.message === msg)) this.issues.push({ level: "warning", pos: a.pos, message: msg });
              }
      const nba: { sig: Sig; v: Val; mask: number }[] = [];
      for (const p of triggered) this.exec(p.body, nba);
      for (const u of nba) u.sig.val = merge(u.sig.val, u.v, u.mask);
      this.delta++;
    }
    throw new HdlError("同一时刻内事件不收敛（可能是时钟或复位由自身逻辑反复产生边沿）");
  }

  /** 推进到时刻 t（不改变输入） */
  advance(t: number) {
    if (t < this.time) throw new Error("时间不能倒退");
    this.time = t;
  }

  /** 一个完整时钟周期：t0 上升沿，t0+T/2 下降沿，结束于 t0+T */
  clock(name: string, T = 100) {
    const t0 = this.time;
    this.set({ [name]: 1 });
    this.advance(t0 + T / 2);
    this.set({ [name]: 0 });
    this.advance(t0 + T);
    this.cycles++;
  }

  value(name: string): Val {
    const s = this.sigs.get(name);
    if (!s) throw new Error(`没有信号 ${name}`);
    return s.val;
  }
  trace(name: string): HdlTracePoint[] {
    return this.traces.get(name) ?? [];
  }
  /** 顶层端口与内部信号 */
  signals(): { name: string; w: number; kind: string; top?: "input" | "output" }[] {
    return [...this.sigs.values()].map((s) => ({ name: s.name, w: s.w, kind: s.kind, top: s.top }));
  }
  get errors() {
    return this.issues.filter((i) => i.level === "error");
  }
}

function merge(old: Val, nv: Val, mask: number): Val {
  return { w: old.w, v: ((old.v & ~mask) | (nv.v & mask)) >>> 0, x: ((old.x & ~mask) | (nv.x & mask)) >>> 0 };
}

function lvWidth(l: LValue, info: SigInfo): number {
  switch (l.k) {
    case "id":
      return info(l.name).w;
    case "bit":
      return 1;
    case "part": {
      const m = l.msb.k === "num" ? l.msb.val : NaN;
      const lo = l.lsb.k === "num" ? l.lsb.val : NaN;
      if (Number.isNaN(m) || Number.isNaN(lo)) throw new HdlError("被赋值的部分选择必须使用常量下标", l.pos);
      return m - lo + 1;
    }
    case "concat":
      return l.parts.reduce((s, p) => s + lvWidth(p, info), 0);
  }
}

function hasNonBlocking(s: Stmt): boolean {
  switch (s.k) {
    case "assign":
      return !s.blocking;
    case "block":
      return s.body.some(hasNonBlocking);
    case "if":
      return hasNonBlocking(s.then) || (s.else ? hasNonBlocking(s.else) : false);
    case "case":
      return s.items.some((it) => hasNonBlocking(it.body));
    default:
      return false;
  }
}

function exprToL(e: Expr): LValue {
  switch (e.k) {
    case "id":
      return e;
    case "bit":
      return e;
    case "part":
      return e;
    case "concat":
      return { k: "concat", parts: e.parts.map(exprToL), pos: e.pos };
    default:
      throw new HdlError("输出端口只能连接到信号（或信号的位/部分/拼接）", e.pos);
  }
}

/** 格式化值：二进制（含 x）或十进制 */
export function fmtVal(v: Val, radix: 2 | 10 | 16 = 2): string {
  if (v.x === 0) return radix === 2 ? v.v.toString(2).padStart(v.w, "0") : radix === 16 ? v.v.toString(16).toUpperCase() : String(v.v);
  if (radix !== 2) return "X";
  let s = "";
  for (let i = v.w - 1; i >= 0; i--) s += (v.x >>> i) & 1 ? "x" : String((v.v >>> i) & 1);
  return s;
}
