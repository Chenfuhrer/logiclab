import { type Expr, compareVarNames, variablesOf } from "./ast";
import { BDD } from "./bdd";
import { bitOf, evaluate, truthTable } from "./truthtable";

export const EXHAUSTIVE_LIMIT = 16;

export interface EquivalenceResult {
  equivalent: boolean;
  method: "exhaustive" | "bdd";
  vars: string[];
  /** 不等价时的一个反例：变量取值、两边的结果 */
  counterexample?: { env: Record<string, 0 | 1>; left: 0 | 1; right: 0 | 1 };
}

/**
 * 等价验证。
 *  - 变量数 ≤ 16：穷举真值表（2^16 = 65536 行）。
 *  - 变量数 > 16：ROBDD 规范形比较。
 * 两个式子取变量并集；某一边不出现的变量视为无关变量。
 */
export function checkEquivalence(a: Expr, b: Expr, extraVars: string[] = []): EquivalenceResult {
  const set = variablesOf(a);
  variablesOf(b, set);
  extraVars.forEach((x) => set.add(x));
  const vars = [...set].sort(compareVarNames);
  if (vars.length <= EXHAUSTIVE_LIMIT) {
    const ta = truthTable(a, vars);
    const tb = truthTable(b, vars);
    for (let i = 0; i < ta.length; i++) {
      if (ta[i] !== tb[i]) {
        const env: Record<string, 0 | 1> = {};
        vars.forEach((name, j) => (env[name] = bitOf(i, j, vars.length)));
        return {
          equivalent: false,
          method: "exhaustive",
          vars,
          counterexample: { env, left: ta[i] as 0 | 1, right: tb[i] as 0 | 1 },
        };
      }
    }
    return { equivalent: true, method: "exhaustive", vars };
  }
  const bdd = new BDD(vars);
  const na = bdd.build(a);
  const nb = bdd.build(b);
  if (na === nb) return { equivalent: true, method: "bdd", vars };
  const diff = bdd.apply(2, na, nb);
  const env = bdd.satisfy(diff)!;
  return {
    equivalent: false,
    method: "bdd",
    vars,
    counterexample: { env, left: evaluate(a, env), right: evaluate(b, env) },
  };
}

/** 把反例格式化为中文提示，例如 "当 A=1, B=0, C=1 时，左式 = 1，右式 = 0" */
export function describeCounterexample(r: EquivalenceResult, leftName = "你的表达式", rightName = "目标函数"): string {
  if (!r.counterexample) return "";
  const { env, left, right } = r.counterexample;
  const assign = r.vars.map((x) => `${x}=${env[x]}`).join(", ");
  return `当 ${assign} 时，${leftName} = ${left}，而${rightName} = ${right}。`;
}
