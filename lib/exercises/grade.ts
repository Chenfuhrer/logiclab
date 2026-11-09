import { checkEquivalence, describeCounterexample, parseExpr, tryParse, truthTable, minimizeSOP, minimizePOS, minterms as mintermsOf, literalCount, type Expr, sortedVariables, toText, tableFromMinterms } from "../logic";
import { checkCover, type CellValue } from "../logic/kmap";
import { analyzeSync, type SyncCircuit, stateBits } from "../fsm/analyze";
import { Simulator } from "../sim/engine";
import type { Netlist } from "../sim/types";
import type { Exercise, GradeResult, ExpressionExercise, StateTableExercise, WaveformExercise, KMapExercise } from "./types";

export type Answer =
  | { kind: "choice"; value: number | number[] }
  | { kind: "numeric"; value: number }
  | { kind: "text"; value: string }
  | { kind: "expression"; value: string }
  | { kind: "kmap"; groups: number[][] }
  | { kind: "statetable"; next: (number | null)[]; outputs?: (number | null)[][] }
  | { kind: "waveform"; q: (0 | 1 | null)[] };

export function grade(ex: Exercise, ans: Answer): GradeResult {
  switch (ex.kind) {
    case "choice": {
      if (ans.kind !== "choice") break;
      const want = Array.isArray(ex.answer) ? [...ex.answer].sort() : [ex.answer];
      const got = Array.isArray(ans.value) ? [...ans.value].sort() : [ans.value];
      const ok = want.length === got.length && want.every((x, i) => x === got[i]);
      return { correct: ok, feedback: ok ? "正确。" : "不正确，请再想一想。", category: "concept" };
    }
    case "numeric": {
      if (ans.kind !== "numeric" || Number.isNaN(ans.value)) return { correct: false, feedback: "请输入数值。", category: "syntax" };
      const tol = ex.tolerance ?? 0;
      const ok = Math.abs(ans.value - ex.answer) <= tol + 1e-12;
      return { correct: ok, feedback: ok ? "正确。" : `数值不正确${tol ? `（允许误差 ±${tol}${ex.unit ?? ""}）` : ""}，请检查计算过程${ex.unit ? `与单位（${ex.unit}）` : ""}。`, category: "calculation" };
    }
    case "text": {
      if (ans.kind !== "text") break;
      const norm = (s: string) => {
        let t = s.trim();
        if (ex.normalize === "upper" || ex.normalize === "binary") t = t.toUpperCase();
        if (ex.normalize !== "none") t = t.replace(/\s+/g, "");
        if (ex.normalize === "binary") {
          // 只去掉明确的二进制后缀 (2)、_2、₂，或纯 0/1 串后的 B；再去掉整数部分的前导 0
          t = t.replace(/\(2\)$|_2$|₂$/, "");
          if (/^[01.]+B$/.test(t)) t = t.slice(0, -1);
          t = t.replace(/^0+(?=[01])/, "");
        }
        return t;
      };
      const ok = ex.accept.some((a) => norm(a) === norm(ans.value));
      return { correct: ok, feedback: ok ? "正确。" : "结果不正确，请逐位检查。", category: "calculation" };
    }
    case "expression":
      if (ans.kind === "expression") return gradeExpression(ex, ans.value);
      break;
    case "kmap":
      if (ans.kind === "kmap") return gradeKMap(ex, ans.groups);
      break;
    case "statetable":
      if (ans.kind === "statetable") return gradeStateTable(ex, ans.next, ans.outputs);
      break;
    case "waveform":
      if (ans.kind === "waveform") return gradeWaveform(ex, ans.q);
      break;
  }
  return { correct: false, feedback: "答案格式不匹配。", category: "syntax" };
}

export function targetExpr(ex: ExpressionExercise): { table: Uint8Array; dcs: Set<number> } {
  const n = ex.vars.length;
  if ("expr" in ex.target) return { table: truthTable(parseExpr(ex.target.expr), ex.vars), dcs: new Set() };
  return { table: tableFromMinterms(n, ex.target.minterms), dcs: new Set(ex.target.dontCares ?? []) };
}

function gradeExpression(ex: ExpressionExercise, src: string): GradeResult {
  const r = tryParse(src);
  if (!r.ok) return { correct: false, feedback: `表达式无法解析：${r.error}`, category: "syntax" };
  const extra = sortedVariables(r.expr).filter((x) => !ex.vars.includes(x));
  if (extra.length) return { correct: false, feedback: `出现了题目中没有的变量 ${extra.join("、")}。可用变量：${ex.vars.join("、")}。`, category: "syntax" };
  const { table, dcs } = targetExpr(ex);
  const mine = truthTable(r.expr, ex.vars);
  const wrong: number[] = [];
  for (let i = 0; i < table.length; i++) if (!dcs.has(i) && mine[i] !== table[i]) wrong.push(i);
  if (wrong.length) {
    const i = wrong[0];
    const assign = ex.vars.map((x, j) => `${x}=${(i >> (ex.vars.length - 1 - j)) & 1}`).join(", ");
    return {
      correct: false,
      feedback: `逻辑功能不正确：共有 ${wrong.length} 个取值组合不符。例如当 ${assign}（m${i}）时，你的式子 = ${mine[i]}，应为 ${table[i]}。`,
      category: "calculation",
    };
  }
  if (ex.minimal) {
    const ones = mintermsOf(table).filter((m) => !dcs.has(m));
    const n = ex.vars.length;
    if (ex.minimal === "sop") {
      const ref = minimizeSOP(n, ones, [...dcs], ex.vars);
      const terms = sopTerms(r.expr);
      if (terms === null) return { correct: false, partial: true, feedback: "功能正确，但题目要求写成与或式（乘积项之和）。", category: "not-minimal" };
      const lits = literalCount(r.expr);
      if (terms > ref.cost.terms || (terms === ref.cost.terms && lits > ref.cost.literals))
        return {
          correct: false,
          partial: true,
          feedback: `功能正确，但还不是最简与或式：你的式子有 ${terms} 个乘积项、${lits} 个变量因子；最简式只需 ${ref.cost.terms} 项、${ref.cost.literals} 个因子。检查是否还有可以合并的项或可以利用的无关项。`,
          category: "not-minimal",
        };
    } else {
      const ref = minimizePOS(n, ones, [...dcs], ex.vars);
      const terms = posTerms(r.expr);
      if (terms === null) return { correct: false, partial: true, feedback: "功能正确，但题目要求写成或与式（若干个或项相乘），例如 (A+B')(B+C)。", category: "not-minimal" };
      const lits = literalCount(r.expr);
      const refLits = literalCount(ref.expr);
      const refTerms = ref.expr.k === "and" ? ref.expr.es.length : 1;
      if (terms > refTerms || (terms === refTerms && lits > refLits))
        return { correct: false, partial: true, feedback: `功能正确，但还不是最简或与式（最简式有 ${refTerms} 个或项、${refLits} 个变量因子）。`, category: "not-minimal" };
    }
  }
  return { correct: true, feedback: "正确：与目标函数逻辑等价" + (ex.minimal ? "，并且已是最简形式。" : "。") };
}

/** 或与式的或项个数；不是或与式返回 null */
function posTerms(e: Expr): number | null {
  const isLit = (x: Expr) => x.k === "var" || (x.k === "not" && x.e.k === "var") || x.k === "const";
  const isSum = (x: Expr) => isLit(x) || (x.k === "or" && x.es.every(isLit));
  if (isSum(e)) return 1;
  if (e.k === "and" && e.es.every(isSum)) return e.es.length;
  return null;
}

/** 与或式的乘积项个数；不是与或式返回 null */
function sopTerms(e: Expr): number | null {
  const isLit = (x: Expr) => x.k === "var" || (x.k === "not" && x.e.k === "var") || x.k === "const";
  const isProd = (x: Expr) => isLit(x) || (x.k === "and" && x.es.every(isLit));
  if (isProd(e)) return 1;
  if (e.k === "or" && e.es.every(isProd)) return e.es.length;
  return null;
}

function gradeKMap(ex: KMapExercise, groups: number[][]): GradeResult {
  const n = ex.vars.length;
  const values: CellValue[] = Array.from({ length: 1 << n }, (_, i) => (ex.minterms.includes(i) ? 1 : ex.dontCares?.includes(i) ? "x" : 0));
  const c = checkCover(groups, values, n, ex.vars);
  if (c.invalid.length) return { correct: false, feedback: `第 ${c.invalid[0].index + 1} 个圈不合法：${c.invalid[0].reason}`, category: "concept" };
  if (c.uncovered.length) return { correct: false, feedback: `还有取值为 1 的格子没有被圈住：m${c.uncovered.join("、m")}。每个 1 至少要被圈一次。`, category: "concept" };
  if (c.notPrime.length) return { correct: false, partial: true, feedback: `第 ${c.notPrime.map((i) => i + 1).join("、")} 个圈还可以再扩大（不是质蕴含项）。圈越大，乘积项的因子越少。`, category: "not-minimal" };
  if (c.redundant.length) return { correct: false, partial: true, feedback: `第 ${c.redundant.map((i) => i + 1).join("、")} 个圈是多余的：去掉它，所有 1 仍被覆盖。`, category: "not-minimal" };
  if (!c.isMinimal) return { correct: false, partial: true, feedback: `覆盖正确，但总代价（${c.studentCost.terms} 项、${c.studentCost.literals} 个因子）高于最简解（${c.minimalCost.terms} 项、${c.minimalCost.literals} 个因子）。`, category: "not-minimal" };
  return { correct: true, feedback: `正确：${c.studentCost.terms} 个圈，已是最简。` };
}

export function exerciseCircuit(ex: StateTableExercise): SyncCircuit {
  return {
    inputs: ex.circuit.inputs,
    ffs: ex.circuit.ffs.map((f) => ({
      name: f.name,
      type: f.type,
      edge: "rising",
      inputs: Object.fromEntries(Object.entries(f.inputs).map(([k, v]) => [k, parseExpr(v)])),
    })),
    outputs: (ex.circuit.outputs ?? []).map((o) => ({ name: o.name, expr: parseExpr(o.expr) })),
  };
}

function gradeStateTable(ex: StateTableExercise, next: (number | null)[], outputs?: (number | null)[][]): GradeResult {
  const a = analyzeSync(exerciseCircuit(ex));
  const details = a.rows.map((r, i) => next[i] === r.next && (!outputs || r.outputs.every((o, k) => outputs[i]?.[k] === o)));
  const firstBad = details.indexOf(false);
  if (firstBad < 0) return { correct: true, feedback: "状态转换表全部正确。", details };
  const r = a.rows[firstBad];
  const n = a.stateVars.length;
  const sv = a.stateVars.join("");
  const xin = a.nInputs ? `，输入 ${a.circuit.inputs.join("")}=${stateBits(r.input, a.nInputs)}` : "";
  return {
    correct: false,
    feedback: `有 ${details.filter((d) => !d).length} 行不正确。先检查现态 ${sv}=${stateBits(r.state, n)}${xin} 这一行：把这些值代入驱动方程，算出每个触发器的输入，再代入特性方程。`,
    category: "state",
    details,
  };
}

/** 构造单触发器波形题的测试台，并用仿真引擎得到参考答案 */
export function waveformReference(ex: WaveformExercise): (0 | 1)[] {
  const pins = Object.keys(ex.inputs);
  const nl: Netlist = {
    version: 1,
    name: "wave",
    components: [
      { id: "CLK", type: "clock", x: 0, y: 0 },
      { id: "U", type: `${ex.ff.toLowerCase()}ff`, params: { edge: ex.edge, init: ex.init }, x: 0, y: 0 },
      ...pins.map((p) => ({ id: `S_${p}`, type: "switch", x: 0, y: 0 })),
    ],
    nets: [
      { id: "CLK", endpoints: [{ comp: "CLK", pin: "CLK" }, { comp: "U", pin: "CLK" }] },
      { id: "Q", endpoints: [{ comp: "U", pin: "Q" }] },
      ...pins.map((p) => ({ id: p, endpoints: [{ comp: `S_${p}`, pin: "Y" }, { comp: "U", pin: p }] })),
    ],
  };
  const sim = new Simulator(nl);
  const n = ex.inputs[pins[0]].length;
  const out: (0 | 1)[] = [];
  for (let i = 0; i < n; i++) {
    for (const p of pins) sim.setInput(`S_${p}`, ex.inputs[p][i]);
    sim.stepClock("CLK");
    const q = sim.netValue("Q");
    if (q !== 0 && q !== 1) throw new Error("波形题参考答案出现不确定值");
    out.push(q);
  }
  return out;
}

function gradeWaveform(ex: WaveformExercise, q: (0 | 1 | null)[]): GradeResult {
  const ref = waveformReference(ex);
  const details = ref.map((r, i) => q[i] === r);
  const bad = details.indexOf(false);
  if (bad < 0) return { correct: true, feedback: "波形完全正确。", details };
  const pins = Object.keys(ex.inputs);
  const before = pins.map((p) => `${p}=${ex.inputs[p][bad]}`).join("，");
  const prevQ = bad === 0 ? ex.init : ref[bad - 1];
  return {
    correct: false,
    feedback: `第 ${bad + 1} 个有效时钟沿之后，Q 的状态不正确。请检查该沿到来前的输入（${before}）以及当时的 Q=${prevQ}，再代入特性方程。`,
    category: "timing",
    details,
  };
}

export { describeCounterexample, checkEquivalence, toText };
