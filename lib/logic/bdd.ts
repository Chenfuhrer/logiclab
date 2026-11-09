import type { Expr } from "./ast";

/**
 * 精简的 ROBDD（有序化简二元判决图），用于变量较多时的等价验证。
 * 0/1 为终端节点；变量序为构造时给定的 vars 顺序。
 * 两个函数等价 ⇔ 在同一变量序下根节点相同（ROBDD 的规范性）。
 */
export class BDD {
  private lo: number[] = [0, 1];
  private hi: number[] = [0, 1];
  private lvl: number[] = [Infinity, Infinity];
  private unique = new Map<string, number>();
  private memo = new Map<string, number>();
  private varIndex: Map<string, number>;

  constructor(
    public readonly vars: string[],
    private maxNodes = 2_000_000,
  ) {
    this.varIndex = new Map(vars.map((v, i) => [v, i]));
  }

  get size() {
    return this.lo.length;
  }

  private mk(level: number, l: number, h: number): number {
    if (l === h) return l;
    const key = `${level},${l},${h}`;
    const found = this.unique.get(key);
    if (found !== undefined) return found;
    if (this.lo.length >= this.maxNodes) throw new Error("BDD 节点数超过上限，表达式过于复杂");
    const id = this.lo.length;
    this.lo.push(l);
    this.hi.push(h);
    this.lvl.push(level);
    this.unique.set(key, id);
    return id;
  }

  variable(name: string): number {
    const i = this.varIndex.get(name);
    if (i === undefined) throw new Error(`BDD 变量序中没有 ${name}`);
    return this.mk(i, 0, 1);
  }

  /** op: 0=and 1=or 2=xor */
  apply(op: 0 | 1 | 2, a: number, b: number): number {
    if (op === 0) {
      if (a === 0 || b === 0) return 0;
      if (a === 1) return b;
      if (b === 1) return a;
      if (a === b) return a;
    } else if (op === 1) {
      if (a === 1 || b === 1) return 1;
      if (a === 0) return b;
      if (b === 0) return a;
      if (a === b) return a;
    } else {
      if (a === 0) return b;
      if (b === 0) return a;
      if (a === b) return 0;
    }
    if (a > b) [a, b] = [b, a];
    const key = `${op},${a},${b}`;
    const m = this.memo.get(key);
    if (m !== undefined) return m;
    const la = this.lvl[a];
    const lb = this.lvl[b];
    const level = Math.min(la, lb);
    const a0 = la === level ? this.lo[a] : a;
    const a1 = la === level ? this.hi[a] : a;
    const b0 = lb === level ? this.lo[b] : b;
    const b1 = lb === level ? this.hi[b] : b;
    const r = this.mk(level, this.apply(op, a0, b0), this.apply(op, a1, b1));
    this.memo.set(key, r);
    return r;
  }

  not(a: number): number {
    return this.apply(2, a, 1);
  }

  build(e: Expr): number {
    switch (e.k) {
      case "const":
        return e.v;
      case "var":
        return this.variable(e.name);
      case "not":
        return this.not(this.build(e.e));
      case "and":
        return e.es.reduce((acc, x) => this.apply(0, acc, this.build(x)), 1);
      case "or":
        return e.es.reduce((acc, x) => this.apply(1, acc, this.build(x)), 0);
      case "xor":
        return this.apply(2, this.build(e.a), this.build(e.b));
      case "xnor":
        return this.not(this.apply(2, this.build(e.a), this.build(e.b)));
    }
  }

  /** 找一个使节点为 1 的赋值（用于给出反例） */
  satisfy(node: number): Record<string, 0 | 1> | null {
    if (node === 0) return null;
    const env: Record<string, 0 | 1> = {};
    for (const v of this.vars) env[v] = 0;
    let cur = node;
    while (cur > 1) {
      const name = this.vars[this.lvl[cur]];
      if (this.lo[cur] !== 0) {
        env[name] = 0;
        cur = this.lo[cur];
      } else {
        env[name] = 1;
        cur = this.hi[cur];
      }
    }
    return env;
  }
}
