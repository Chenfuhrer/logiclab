import { type Expr, sortedVariables } from "./ast";

/**
 * 真值表约定（与国内教材一致）：
 *   变量列表 vars[0] 为最高位。行号 i 即最小项编号 m_i。
 *   第 i 行中变量 vars[j] 的取值 = (i >> (n-1-j)) & 1。
 */
export const MAX_TABLE_VARS = 20;

export function bitOf(row: number, j: number, n: number): 0 | 1 {
  return ((row >> (n - 1 - j)) & 1) as 0 | 1;
}

/** 单点求值 */
export function evaluate(e: Expr, env: Record<string, 0 | 1>): 0 | 1 {
  switch (e.k) {
    case "const":
      return e.v;
    case "var": {
      const x = env[e.name];
      if (x === undefined) throw new Error(`变量 ${e.name} 没有赋值`);
      return x;
    }
    case "not":
      return evaluate(e.e, env) ? 0 : 1;
    case "and":
      for (const x of e.es) if (!evaluate(x, env)) return 0;
      return 1;
    case "or":
      for (const x of e.es) if (evaluate(x, env)) return 1;
      return 0;
    case "xor":
      return (evaluate(e.a, env) ^ evaluate(e.b, env)) as 0 | 1;
    case "xnor":
      return (1 ^ evaluate(e.a, env) ^ evaluate(e.b, env)) as 0 | 1;
  }
}

/**
 * 向量化求整张真值表：每个子表达式求出一列（长度 2^n 的 Uint8Array）。
 * vars 可以包含表达式中不出现的变量（作为无关变量）。
 */
export function truthTable(e: Expr, vars?: string[]): Uint8Array {
  const vs = vars ?? sortedVariables(e);
  const n = vs.length;
  if (n > MAX_TABLE_VARS) throw new Error(`变量数 ${n} 超过真值表上限 ${MAX_TABLE_VARS}`);
  const size = 1 << n;
  const index = new Map(vs.map((name, j) => [name, j]));
  const colCache = new Map<string, Uint8Array>();
  const varCol = (name: string): Uint8Array => {
    const j = index.get(name);
    if (j === undefined) throw new Error(`变量 ${name} 不在变量表 [${vs.join(", ")}] 中`);
    let c = colCache.get(name);
    if (!c) {
      c = new Uint8Array(size);
      const shift = n - 1 - j;
      for (let i = 0; i < size; i++) c[i] = (i >> shift) & 1;
      colCache.set(name, c);
    }
    return c;
  };
  const go = (x: Expr): Uint8Array => {
    switch (x.k) {
      case "const":
        return new Uint8Array(size).fill(x.v);
      case "var":
        return varCol(x.name);
      case "not": {
        const a = go(x.e);
        const r = new Uint8Array(size);
        for (let i = 0; i < size; i++) r[i] = a[i] ^ 1;
        return r;
      }
      case "and": {
        const r = new Uint8Array(size).fill(1);
        for (const s of x.es) {
          const a = go(s);
          for (let i = 0; i < size; i++) r[i] &= a[i];
        }
        return r;
      }
      case "or": {
        const r = new Uint8Array(size);
        for (const s of x.es) {
          const a = go(s);
          for (let i = 0; i < size; i++) r[i] |= a[i];
        }
        return r;
      }
      case "xor":
      case "xnor": {
        const a = go(x.a);
        const b = go(x.b);
        const r = new Uint8Array(size);
        const inv = x.k === "xnor" ? 1 : 0;
        for (let i = 0; i < size; i++) r[i] = a[i] ^ b[i] ^ inv;
        return r;
      }
    }
  };
  const out = go(e);
  // 返回独立副本，避免缓存列被外部修改
  return out === colCache.get((e as { name?: string }).name ?? "") ? out.slice() : out;
}

export function minterms(table: Uint8Array): number[] {
  const r: number[] = [];
  table.forEach((x, i) => x && r.push(i));
  return r;
}

export function maxterms(table: Uint8Array): number[] {
  const r: number[] = [];
  table.forEach((x, i) => !x && r.push(i));
  return r;
}

export function tableFromMinterms(n: number, ones: number[]): Uint8Array {
  const t = new Uint8Array(1 << n);
  for (const m of ones) {
    if (m < 0 || m >= t.length) throw new Error(`最小项 m${m} 超出 ${n} 变量范围`);
    t[m] = 1;
  }
  return t;
}
