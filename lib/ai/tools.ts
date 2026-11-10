import type Anthropic from "@anthropic-ai/sdk";
import { tryParse, truthTable, sortedVariables, minterms, minimizeSOP, minimizePOS, solutionToSOP, toText, checkEquivalence, describeCounterexample, implicantPattern, implicantToExpr } from "../logic";
import { analyzeSync, stateBits, type SyncCircuit } from "../fsm/analyze";
import { extractSyncCircuit } from "../fsm/extract";
import { minimizeStates, sequenceDetector, synthesize } from "../fsm/design";
import { verifyCounter, designError, decodeState, loadValue, type CounterMethod } from "../counters/ls161";
import { Simulator } from "../sim/engine";
import type { Netlist } from "../sim/types";
import { HdlSim, fmtVal } from "../hdl/interp";
import { astable, monostable } from "../analog-models/timer555";
import type { FFType } from "../sim/models";

/**
 * AI 助教可调用的确定性工具。所有涉及具体电路状态、化简结果、仿真结果的结论都必须来自这些工具，
 * 而不是语言模型的自然语言推断。每个工具：明确的 JSON Schema、运行前的输入校验、中文错误信息、有界的计算量。
 */

export class ToolInputError extends Error {}

type Json = Record<string, unknown>;
const str = (o: Json, k: string, max = 400): string => {
  const v = o[k];
  if (typeof v !== "string" || !v.trim()) throw new ToolInputError(`参数 ${k} 应为非空字符串`);
  if (v.length > max) throw new ToolInputError(`参数 ${k} 过长（上限 ${max} 字符）`);
  return v;
};
const optStr = (o: Json, k: string, max = 400) => (o[k] === undefined || o[k] === null ? undefined : str(o, k, max));
const int = (o: Json, k: string, lo: number, hi: number, dflt?: number): number => {
  const v = o[k] ?? dflt;
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) throw new ToolInputError(`参数 ${k} 应为 ${lo}～${hi} 的整数`);
  return v;
};
const num = (o: Json, k: string): number => {
  const v = o[k];
  if (typeof v !== "number" || !isFinite(v) || v <= 0) throw new ToolInputError(`参数 ${k} 应为正数`);
  return v;
};
const oneOf = <T extends string>(o: Json, k: string, allowed: readonly T[], dflt?: T): T => {
  const v = o[k] ?? dflt;
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new ToolInputError(`参数 ${k} 应为 ${allowed.join(" / ")} 之一`);
  return v as T;
};
const intArr = (o: Json, k: string, hi: number): number[] => {
  const v = o[k] ?? [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "number" || !Number.isInteger(x) || x < 0 || x > hi)) throw new ToolInputError(`参数 ${k} 应为 0～${hi} 的整数数组`);
  return v as number[];
};

export interface ToolContext {
  /** 当前页面的电路网表（实验页 / 自由实验台注册） */
  netlist?: Netlist;
}

export interface ToolDef {
  def: Anthropic.Beta.BetaTool;
  run: (input: Json, ctx: ToolContext) => unknown;
  /** 界面上显示的中文名 */
  label: string;
}

const schema = (properties: Record<string, unknown>, required: string[]): Anthropic.Beta.BetaTool["input_schema"] => ({ type: "object", properties, required, additionalProperties: false } as Anthropic.Beta.BetaTool["input_schema"]);

const tool = (name: string, label: string, description: string, input_schema: Anthropic.Beta.BetaTool["input_schema"], run: ToolDef["run"]): ToolDef => ({
  label,
  run,
  def: { name, description, input_schema, eager_input_streaming: true },
});

const EXPR_HELP = "表达式语法：A' 或 !A 表示非，AB 或 A·B 为与，+ 为或，⊕ 或 ^ 为异或，⊙ 为同或，(…)' 为长非号；变量名为一个字母加可选数字（如 Q0）。";

export const TOOLS: ToolDef[] = [
  tool(
    "simplify_expression",
    "逻辑化简",
    `对逻辑函数做 Quine–McCluskey + Petrick 化简，返回全部最简与或式、最简或与式、质蕴含项与最小项。可给表达式，或给变量与最小项（可含无关项）。${EXPR_HELP}`,
    schema(
      {
        expr: { type: "string", description: "逻辑表达式（与 minterms 二选一）" },
        vars: { type: "array", items: { type: "string" }, description: "变量名，高位在前（使用 minterms 时必填）" },
        minterms: { type: "array", items: { type: "integer" } },
        dont_cares: { type: "array", items: { type: "integer" } },
      },
      [],
    ),
    (i) => {
      let vars: string[];
      let ones: number[];
      let dcs: number[] = [];
      if (typeof i.expr === "string") {
        const r = tryParse(str(i, "expr"));
        if (!r.ok) throw new ToolInputError(`表达式无法解析：${r.error}`);
        vars = Array.isArray(i.vars) && i.vars.length ? (i.vars as string[]) : sortedVariables(r.expr);
        if (vars.length > 8) throw new ToolInputError("变量超过 8 个");
        ones = minterms(truthTable(r.expr, vars));
        dcs = intArr(i, "dont_cares", (1 << vars.length) - 1);
      } else {
        if (!Array.isArray(i.vars) || i.vars.length < 1 || i.vars.length > 8 || i.vars.some((v) => typeof v !== "string")) throw new ToolInputError("需要 vars（1～8 个变量名）");
        vars = i.vars as string[];
        ones = intArr(i, "minterms", (1 << vars.length) - 1);
        dcs = intArr(i, "dont_cares", (1 << vars.length) - 1);
      }
      const sop = minimizeSOP(vars.length, ones, dcs, vars);
      const pos = minimizePOS(vars.length, ones, dcs, vars);
      return {
        vars,
        minterms: ones,
        dont_cares: dcs,
        minimal_sop: ones.length ? sop.solutions.map((_, k) => toText(solutionToSOP(sop, k))) : ["0"],
        minimal_pos: pos.solutionsExpr.map((e) => toText(e)),
        cost: sop.cost,
        prime_implicants: sop.primes.map((p, k) => ({ pattern: implicantPattern(p, vars.length), term: toText(implicantToExpr(p, vars)), essential: sop.essential.includes(k) })),
        exact: sop.exact,
      };
    },
  ),
  tool(
    "check_equivalence",
    "等价验证",
    `判断两个逻辑表达式是否逻辑等价（≤16 变量穷举真值表，更多变量用 ROBDD），不等价时给出反例。${EXPR_HELP}`,
    schema({ a: { type: "string" }, b: { type: "string" } }, ["a", "b"]),
    (i) => {
      const a = tryParse(str(i, "a"));
      const b = tryParse(str(i, "b"));
      if (!a.ok) throw new ToolInputError(`a 无法解析：${a.error}`);
      if (!b.ok) throw new ToolInputError(`b 无法解析：${b.error}`);
      const r = checkEquivalence(a.expr, b.expr);
      return { equivalent: r.equivalent, method: r.method, vars: r.vars, counterexample: r.equivalent ? null : describeCounterexample(r, "a", "b") };
    },
  ),
  tool(
    "truth_table",
    "真值表",
    `列出表达式的真值表（≤6 个变量）。${EXPR_HELP}`,
    schema({ expr: { type: "string" }, vars: { type: "array", items: { type: "string" } } }, ["expr"]),
    (i) => {
      const r = tryParse(str(i, "expr"));
      if (!r.ok) throw new ToolInputError(`表达式无法解析：${r.error}`);
      const vars = Array.isArray(i.vars) && i.vars.length ? (i.vars as string[]) : sortedVariables(r.expr);
      if (vars.length > 6) throw new ToolInputError("真值表最多 6 个变量");
      const t = truthTable(r.expr, vars);
      return { vars, rows: Array.from(t, (y, m) => ({ m, inputs: stateBits(m, vars.length), y })) };
    },
  ),
  tool(
    "analyze_sync_circuit",
    "同步时序分析",
    `分析同步时序电路：给出每个触发器的类型与驱动方程（以及外部输入、输出方程），返回状态方程、完整状态转换表、Moore/Mealy 判断、自启动检查与（无输入时）计数序列。触发器按状态编码从高位到低位排列。${EXPR_HELP}`,
    schema(
      {
        inputs: { type: "array", items: { type: "string" }, description: "外部输入变量名，可为空" },
        flip_flops: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, type: { type: "string", enum: ["D", "JK", "T", "SR"] }, drives: { type: "object", description: "如 {\"J\":\"Q0\",\"K\":\"Q0\"}" } },
            required: ["name", "type", "drives"],
          },
        },
        outputs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, expr: { type: "string" } }, required: ["name", "expr"] } },
        initial: { type: "integer", description: "初始状态编码，默认 0" },
      },
      ["flip_flops"],
    ),
    (i) => {
      if (!Array.isArray(i.flip_flops) || i.flip_flops.length < 1 || i.flip_flops.length > 6) throw new ToolInputError("flip_flops 应有 1～6 个触发器");
      const inputs = Array.isArray(i.inputs) ? (i.inputs as string[]) : [];
      if (inputs.length > 3) throw new ToolInputError("外部输入最多 3 个");
      const parse = (s: unknown, where: string) => {
        if (typeof s !== "string") throw new ToolInputError(`${where} 应为表达式字符串`);
        const r = tryParse(s);
        if (!r.ok) throw new ToolInputError(`${where} 无法解析：${r.error}`);
        return r.expr;
      };
      const PINS: Record<string, string[]> = { D: ["D"], JK: ["J", "K"], T: ["T"], SR: ["S", "R"] };
      const c: SyncCircuit = {
        inputs,
        ffs: (i.flip_flops as Json[]).map((f) => {
          const type = oneOf(f, "type", ["D", "JK", "T", "SR"] as const);
          const drives = (f.drives ?? {}) as Json;
          return { name: str(f, "name", 8), type, edge: "rising", inputs: Object.fromEntries(PINS[type].map((p) => [p, parse(drives[p], `${f.name} 的 ${p}`)])) };
        }),
        outputs: (Array.isArray(i.outputs) ? (i.outputs as Json[]) : []).map((o) => ({ name: str(o, "name", 8), expr: parse(o.expr, `输出 ${o.name}`) })),
      };
      const a = analyzeSync(c, i.initial === undefined ? 0 : int(i, "initial", 0, (1 << c.ffs.length) - 1));
      const n = a.stateVars.length;
      return {
        state_vars: a.stateVars,
        state_equations: a.stateEqs.map((s) => `${s.name}^{n+1} = ${toText(s.simplified)}`),
        output_equations: a.outputEqs.map((o) => `${o.name} = ${toText(o.simplified)}`),
        kind: a.kind,
        table: a.rows.map((r) => ({ state: stateBits(r.state, n), input: a.nInputs ? stateBits(r.input, a.nInputs) : undefined, next: stateBits(r.next, n), outputs: r.outputs, sr_forbidden: r.violations.length ? r.violations : undefined })),
        sequence_from_initial: a.nInputs === 0 ? a.sequence.map((s) => stateBits(s, n)) : undefined,
        self_start: {
          self_starting: a.selfStart.selfStarting,
          legal: a.selfStart.legal.map((s) => stateBits(s, n)),
          unused: a.selfStart.unused.map((s) => stateBits(s, n)),
          invalid_cycles: a.selfStart.invalidCycles.map((cy) => cy.map((s) => stateBits(s, n))),
          details: a.selfStart.details.map((d) => ({ state: stateBits(d.state, n), verdict: d.verdict })),
        },
      };
    },
  ),
  tool(
    "simulate_74ls161_counter",
    "74LS161 仿真",
    "用仿真引擎验证 74LS161/74LS163 任意进制计数器设计：给出模数 N、方法（clear 清零法 / sync-load 同步置数法 / carry-load 进位置数法）、片数，返回实测模数、稳定循环、瞬态状态、自启动结果与反馈译码状态。",
    schema(
      {
        N: { type: "integer" },
        method: { type: "string", enum: ["clear", "sync-load", "carry-load"] },
        chips: { type: "integer", enum: [1, 2] },
        part: { type: "string", enum: ["ls161", "ls163"] },
        preset: { type: "integer" },
      },
      ["N", "method"],
    ),
    (i) => {
      const d = {
        N: int(i, "N", 2, 256),
        method: oneOf(i, "method", ["clear", "sync-load", "carry-load"] as const) as CounterMethod,
        chips: int(i, "chips", 1, 2, 1) as 1 | 2,
        part: oneOf(i, "part", ["ls161", "ls163"] as const, "ls161"),
        preset: i.preset === undefined ? 0 : int(i, "preset", 0, 255),
      };
      const err = designError(d);
      if (err) throw new ToolInputError(err);
      const v = verifyCounter(d, d.chips === 2 ? 300 : 120);
      return {
        measured_modulus: v.modulus,
        matches_target: v.ok,
        cycle: v.cycle,
        transient_states: v.transients,
        decode_state: decodeState(d),
        load_value: d.method === "clear" ? null : loadValue(d),
        all_power_on_states_enter_cycle: v.selfStart.every((s) => s.entersCycle),
        issues: v.issues.slice(0, 5),
      };
    },
  ),
  tool(
    "design_sequence_detector",
    "序列检测器设计",
    "自动设计同步序列检测器：给出目标序列、Mealy/Moore、是否可重叠、触发器类型，返回原始状态表、化简后的状态、编码、次态/驱动/输出方程、自启动检查与逐状态验证结果。",
    schema(
      {
        sequence: { type: "string", description: "2～8 位 0/1 串" },
        kind: { type: "string", enum: ["mealy", "moore"] },
        overlap: { type: "boolean" },
        ff_type: { type: "string", enum: ["D", "JK", "T"] },
      },
      ["sequence", "kind"],
    ),
    (i) => {
      const seq = str(i, "sequence", 8);
      if (!/^[01]{2,8}$/.test(seq)) throw new ToolInputError("sequence 应为 2～8 位 0/1 串");
      const kind = oneOf(i, "kind", ["mealy", "moore"] as const);
      const overlap = i.overlap === undefined ? true : Boolean(i.overlap);
      const ff = oneOf(i, "ff_type", ["D", "JK", "T"] as const, "D") as FFType;
      const raw = sequenceDetector(seq, kind, overlap);
      const min = minimizeStates(raw);
      const syn = synthesize(min.reduced, { ffType: ff });
      return {
        raw_states: raw.states.length,
        raw_table: raw.states.map((s, k) => ({ state: s, next: raw.next[k].map((t) => raw.states[t]), out: raw.out[k].map((o) => o[0]) })),
        equivalence_classes: min.classes.map((c) => c.map((s) => raw.states[s])),
        codes: min.reduced.states.map((s, k) => `${s} = ${stateBits(syn.codes[k], syn.nBits)}`),
        next_state_equations: syn.nextColumns.map((c) => `${c.name}^{n+1} = ${toText(c.expr)}`),
        drive_equations: syn.excitation.map((c) => `${c.name} = ${toText(c.expr)}`),
        output_equations: syn.outputColumns.map((c) => `${c.name} = ${toText(c.expr)}`),
        self_starting: syn.selfStart.selfStarting,
        verified_against_state_table: syn.verified,
      };
    },
  ),
  tool(
    "run_verilog",
    "Verilog 解释器",
    "用平台的教学用 Verilog 子集解释器运行一段 Verilog（不是完整 HDL 仿真器：不支持 initial、# 延迟、$ 系统任务等）。给出代码、0 时刻输入初值、时钟名（可选）与逐拍激励，返回每拍结束时的顶层输出、编译错误与静态检查警告（多驱动、锁存器推断、竞争等）。",
    schema(
      {
        code: { type: "string" },
        init: { type: "object", description: "顶层输入初值，如 {\"clk\":0,\"rst_n\":1}" },
        clock: { type: "string" },
        steps: { type: "array", items: { type: "object" }, description: "每拍时钟沿前施加的输入，如 [{\"x\":1},{\"x\":0}]" },
        cycles: { type: "integer", description: "没有 steps 时空跑的拍数，默认 8" },
      },
      ["code"],
    ),
    (i) => {
      const code = str(i, "code", 8000);
      const init = (i.init ?? {}) as Record<string, number>;
      let sim: HdlSim;
      try {
        sim = new HdlSim(code, { init });
      } catch (e) {
        return { compiled: false, error: (e as Error).message };
      }
      const outs = () => Object.fromEntries(sim.signals().filter((s) => s.top === "output").map((s) => [s.name, fmtVal(sim.value(s.name))]));
      const steps = Array.isArray(i.steps) ? (i.steps as Record<string, number>[]).slice(0, 64) : Array.from({ length: i.cycles === undefined ? 8 : int(i, "cycles", 1, 64) }, () => ({}));
      const clock = optStr(i, "clock", 32);
      const trace: { cycle: number; inputs: Record<string, number>; outputs: Record<string, string> }[] = [];
      try {
        steps.forEach((s, k) => {
          if (Object.keys(s).length) sim.set(s);
          if (clock) sim.clock(clock);
          trace.push({ cycle: k + 1, inputs: s, outputs: outs() });
        });
      } catch (e) {
        return { compiled: true, runtime_error: (e as Error).message, trace, issues: sim.issues };
      }
      return { compiled: true, top: sim.top, initial_outputs: undefined, trace, issues: sim.issues.map((x) => ({ level: x.level, line: x.pos?.line, message: x.message })) };
    },
  ),
  tool(
    "timer555",
    "555 计算",
    "按教学近似模型（理想比较器与放电管）计算 555 多谐振荡器（R1、R2、C）或单稳态（R、C）的时间参数。电阻单位 Ω，电容单位 F，电压单位 V。",
    schema(
      {
        mode: { type: "string", enum: ["astable", "monostable"] },
        Vcc: { type: "number" },
        R1: { type: "number" },
        R2: { type: "number" },
        R: { type: "number" },
        C: { type: "number" },
        Vco: { type: "number" },
      },
      ["mode", "C"],
    ),
    (i) => {
      const mode = oneOf(i, "mode", ["astable", "monostable"] as const);
      const Vcc = i.Vcc === undefined ? 5 : num(i, "Vcc");
      const Vco = i.Vco === undefined ? undefined : num(i, "Vco");
      if (mode === "astable") {
        const r = astable({ Vcc, R1: num(i, "R1"), R2: num(i, "R2"), C: num(i, "C"), Vco });
        return { model: "教学近似模型", thresholds: r.th, tH_s: r.tH, tL_s: r.tL, period_s: r.T, freq_Hz: r.f, duty: r.duty, first_high_s: r.tFirst };
      }
      const m = monostable({ Vcc, R: num(i, "R"), C: num(i, "C"), Vco });
      return { model: "教学近似模型", thresholds: m.th, tW_s: m.tW };
    },
  ),
  tool(
    "analyze_current_circuit",
    "当前电路",
    "读取学生当前页面上的电路（实验 A/B、自由实验台等注册的网表）：若是可分析的同步电路，返回驱动方程、状态方程与状态表；同时用仿真引擎从当前初态运行指定拍数，返回每拍各探针/LED 的值与仿真诊断信息。",
    schema({ cycles: { type: "integer", description: "仿真拍数，默认 8" } }, []),
    (i, ctx) => {
      if (!ctx.netlist) return { available: false, reason: "当前页面没有可读取的电路。" };
      const nl = ctx.netlist;
      if (nl.components.length > 200) throw new ToolInputError("电路过大（元件超过 200 个）");
      const out: Json = { available: true, name: nl.name, components: nl.components.length };
      const ex = extractSyncCircuit(nl);
      if (ex.ok) {
        const a = analyzeSync(ex.circuit, ex.initial);
        const n = a.stateVars.length;
        out.drive_equations = ex.circuit.ffs.flatMap((f) => Object.entries(f.inputs).map(([p, e]) => `${p}(${f.name}) = ${toText(e!)}`));
        out.state_equations = a.stateEqs.map((s) => `${s.name}^{n+1} = ${toText(s.simplified)}`);
        out.state_table = a.rows.map((r) => `${stateBits(r.state, n)}${a.nInputs ? "/" + stateBits(r.input, a.nInputs) : ""} → ${stateBits(r.next, n)}`);
        out.self_starting = a.selfStart.selfStarting;
      } else out.symbolic_analysis = ex.reason;
      const sim = new Simulator(nl);
      const probes = nl.components.filter((c) => c.type === "probe" || c.type === "led");
      const hasClock = nl.components.some((c) => c.type === "clock");
      const read = () => Object.fromEntries(probes.map((p) => [p.label ?? p.id, ["0", "1", "X", "Z"][sim.pinValue(p.id, "A")]]));
      const rows: Json[] = [{ cycle: 0, ...read() }];
      if (hasClock) for (let k = 1; k <= (i.cycles === undefined ? 8 : int(i, "cycles", 1, 32)); k++) {
        sim.stepClock();
        rows.push({ cycle: k, ...read() });
      }
      out.simulation = rows;
      out.diagnostics = sim.issues.slice(0, 6).map((x) => x.message);
      return out;
    },
  ),
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.def.name, t]));

/** 执行一个工具：返回 JSON 字符串与是否出错。输入先校验再执行，计算异常转为中文错误信息。 */
export function runTool(name: string, input: unknown, ctx: ToolContext): { content: string; isError: boolean } {
  const t = TOOL_BY_NAME.get(name);
  if (!t) return { content: `未知工具 ${name}`, isError: true };
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { content: "INVALID_JSON：工具参数应为 JSON 对象", isError: true };
  try {
    return { content: JSON.stringify(t.run(input as Json, ctx)), isError: false };
  } catch (e) {
    return { content: e instanceof ToolInputError ? `参数错误：${e.message}` : `计算失败：${(e as Error).message}`, isError: true };
  }
}
