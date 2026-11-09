/**
 * 布尔表达式统一 AST。
 *
 * 运算优先级（由高到低）：
 *   1. 非（前缀 ! ~ ¬，后缀 ′ '，或字母上的上划线 Ā / A̅）
 *   2. 与（· * & ∧ 或并列书写 AB）
 *   3. 异或 / 同或（⊕ ^  /  ⊙），左结合，二者同级
 *   4. 或（+ | ∨）
 * 括号可以改变优先级。
 */
export type Expr =
  | { k: "const"; v: 0 | 1 }
  | { k: "var"; name: string }
  | { k: "not"; e: Expr }
  | { k: "and"; es: Expr[] }
  | { k: "or"; es: Expr[] }
  | { k: "xor"; a: Expr; b: Expr }
  | { k: "xnor"; a: Expr; b: Expr };

export const C0: Expr = { k: "const", v: 0 };
export const C1: Expr = { k: "const", v: 1 };
export const v = (name: string): Expr => ({ k: "var", name });
export const not = (e: Expr): Expr => ({ k: "not", e });
export const and = (...es: Expr[]): Expr =>
  es.length === 0 ? C1 : es.length === 1 ? es[0] : { k: "and", es };
export const or = (...es: Expr[]): Expr =>
  es.length === 0 ? C0 : es.length === 1 ? es[0] : { k: "or", es };
export const xor = (a: Expr, b: Expr): Expr => ({ k: "xor", a, b });
export const xnor = (a: Expr, b: Expr): Expr => ({ k: "xnor", a, b });

/** 自然排序：A < B < … < Q0 < Q1 < Q10 */
export function compareVarNames(a: string, b: string): number {
  const ra = /^([A-Za-z]+)(\d*)$/.exec(a);
  const rb = /^([A-Za-z]+)(\d*)$/.exec(b);
  if (ra && rb) {
    if (ra[1] !== rb[1]) return ra[1] < rb[1] ? -1 : 1;
    const na = ra[2] === "" ? -1 : Number(ra[2]);
    const nb = rb[2] === "" ? -1 : Number(rb[2]);
    return na - nb;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function variablesOf(e: Expr, acc = new Set<string>()): Set<string> {
  switch (e.k) {
    case "const":
      break;
    case "var":
      acc.add(e.name);
      break;
    case "not":
      variablesOf(e.e, acc);
      break;
    case "and":
    case "or":
      e.es.forEach((x) => variablesOf(x, acc));
      break;
    case "xor":
    case "xnor":
      variablesOf(e.a, acc);
      variablesOf(e.b, acc);
      break;
  }
  return acc;
}

export function sortedVariables(e: Expr): string[] {
  return [...variablesOf(e)].sort(compareVarNames);
}

/** 结构相等（不判断逻辑等价） */
export function structEqual(a: Expr, b: Expr): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "const":
      return a.v === (b as typeof a).v;
    case "var":
      return a.name === (b as typeof a).name;
    case "not":
      return structEqual(a.e, (b as typeof a).e);
    case "and":
    case "or": {
      const bb = b as typeof a;
      return a.es.length === bb.es.length && a.es.every((x, i) => structEqual(x, bb.es[i]));
    }
    case "xor":
    case "xnor": {
      const bb = b as typeof a;
      return structEqual(a.a, bb.a) && structEqual(a.b, bb.b);
    }
  }
}

/** 统计字面量个数（变量出现次数），用于衡量表达式复杂度 */
export function literalCount(e: Expr): number {
  switch (e.k) {
    case "const":
      return 0;
    case "var":
      return 1;
    case "not":
      return literalCount(e.e);
    case "and":
    case "or":
      return e.es.reduce((s, x) => s + literalCount(x), 0);
    case "xor":
    case "xnor":
      return literalCount(e.a) + literalCount(e.b);
  }
}

/** 用表达式替换变量（代入定理） */
export function substitute(e: Expr, map: Record<string, Expr>): Expr {
  switch (e.k) {
    case "const":
      return e;
    case "var":
      return map[e.name] ?? e;
    case "not":
      return not(substitute(e.e, map));
    case "and":
      return { k: "and", es: e.es.map((x) => substitute(x, map)) };
    case "or":
      return { k: "or", es: e.es.map((x) => substitute(x, map)) };
    case "xor":
      return xor(substitute(e.a, map), substitute(e.b, map));
    case "xnor":
      return xnor(substitute(e.a, map), substitute(e.b, map));
  }
}

/** 对偶式：与↔或，0↔1，变量不变（对偶定理） */
export function dual(e: Expr): Expr {
  switch (e.k) {
    case "const":
      return { k: "const", v: e.v === 1 ? 0 : 1 };
    case "var":
      return e;
    case "not":
      return not(dual(e.e));
    case "and":
      return { k: "or", es: e.es.map(dual) };
    case "or":
      return { k: "and", es: e.es.map(dual) };
    case "xor":
      return xnor(dual(e.a), dual(e.b));
    case "xnor":
      return xor(dual(e.a), dual(e.b));
  }
}

/** 反演式：与↔或，0↔1，原变量↔反变量（反演定理）。 */
export function complementByDeMorgan(e: Expr): Expr {
  switch (e.k) {
    case "const":
      return { k: "const", v: e.v === 1 ? 0 : 1 };
    case "var":
      return not(e);
    case "not":
      // 反演规则：非号下的子式整体保持（不是单变量的长非号保留）
      return e.e;
    case "and":
      return { k: "or", es: e.es.map(complementByDeMorgan) };
    case "or":
      return { k: "and", es: e.es.map(complementByDeMorgan) };
    case "xor":
      return xnor(e.a, e.b);
    case "xnor":
      return xor(e.a, e.b);
  }
}
