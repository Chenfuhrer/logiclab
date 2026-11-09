import { describe, expect, it } from "vitest";
import { Simulator, type Netlist, LX } from "@/lib/sim";
import { analyzeSync } from "@/lib/fsm/analyze";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { simulateDesign, exprToNetlist } from "@/lib/fsm/netlistgen";
import { grade } from "@/lib/exercises/grade";
import { parseExpr, toText, checkEquivalence, and, v } from "@/lib/logic";
import type { StateTableSpec } from "@/lib/fsm/design";
import type { Exercise } from "@/lib/exercises/types";

/** 独立代码评审确认的问题的回归测试 */
type Ep = [string, string];
const C = (id: string, type: string, params?: Record<string, number | string | boolean>) => ({ id, type, params, x: 0, y: 0 });
const nl = (components: Netlist["components"], nets: [string, Ep[]][]): Netlist => ({ version: 1, name: "t", components, nets: nets.map(([id, eps]) => ({ id, name: id, endpoints: eps.map(([comp, pin]) => ({ comp, pin })) })) });

describe("评审 #1：中规模器件的未知输入超过 6 个时仍能精确推出确定结果", () => {
  it("74LS163 初态 X、D 端悬空，同步清零后为 0000", () => {
    const s = new Simulator(
      nl([C("CLK", "clock"), C("U", "ls163"), C("Z", "const0"), C("O", "const1")], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["RD", [["Z", "Y"], ["U", "RD"]]],
        ["ONE", [["O", "Y"], ["U", "LD"], ["U", "EP"], ["U", "ET"]]],
        ["Q0", [["U", "Q0"]]], ["Q1", [["U", "Q1"]]], ["Q2", [["U", "Q2"]]], ["Q3", [["U", "Q3"]]],
      ]),
    );
    s.stepClock();
    expect(["Q0", "Q1", "Q2", "Q3"].map((n) => s.netValue(n))).toEqual([0, 0, 0, 0]);
  });
  it("74LS194 初态 X、右移 4 次串行输入 1 后为 1111", () => {
    const s = new Simulator(
      nl([C("CLK", "clock"), C("U", "ls194"), C("O", "const1"), C("Z", "const0")], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["ONE", [["O", "Y"], ["U", "RD"], ["U", "S0"], ["U", "DSR"]]],
        ["ZERO", [["Z", "Y"], ["U", "S1"]]],
        ["Q0", [["U", "Q0"]]], ["Q1", [["U", "Q1"]]], ["Q2", [["U", "Q2"]]], ["Q3", [["U", "Q3"]]],
      ]),
    );
    for (let i = 0; i < 4; i++) s.stepClock();
    expect(["Q0", "Q1", "Q2", "Q3"].map((n) => s.netValue(n))).toEqual([1, 1, 1, 1]);
  });
});

describe("评审 #2/#3：触发器异步端", () => {
  it("R̄D 为 X 时，时钟沿后的结果不确定（不臆造确定值）", () => {
    const s = new Simulator(
      nl([C("CLK", "clock"), C("U", "dff", { init: 0 }), C("O", "const1")], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["ONE", [["O", "Y"], ["U", "SD"], ["U", "D"]]],
        ["RDX", [["U", "RD"]]],
        ["Q", [["U", "Q"]]],
      ]),
    );
    s.stepClock();
    expect(s.netValue("Q")).toBe(LX);
  });
  it("S̄D、R̄D 同时有效后同时撤销：状态为 X", () => {
    const s = new Simulator(
      nl([C("SW", "switch"), C("CLK", "clock"), C("U", "dff", { init: 0 }), C("Z", "const0")], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["A", [["SW", "Y"], ["U", "SD"], ["U", "RD"]]],
        ["D", [["Z", "Y"], ["U", "D"]]],
        ["Q", [["U", "Q"]]],
      ]),
    );
    expect(s.netValue("Q")).toBe(1);
    s.setInput("SW", 1);
    expect(s.netValue("Q")).toBe(LX);
    s.stepClock(); // D=0 采样后重新确定
    expect(s.netValue("Q")).toBe(0);
  });
});

describe("评审 #4：74LS161 只在置数时检查 D 端建立时间", () => {
  it("LD=1 计数时，D 端在沿前变化不报违例", () => {
    const s = new Simulator(
      nl([C("CLK", "clock"), C("U", "ls161", { init: 0 }), C("O", "const1"), C("D", "switch")], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["ONE", [["O", "Y"], ["U", "RD"], ["U", "LD"], ["U", "EP"], ["U", "ET"]]],
        ["DD", [["D", "Y"], ["U", "D0"], ["U", "D1"], ["U", "D2"], ["U", "D3"]]],
        ["Q0", [["U", "Q0"]]],
      ]),
      { model: "delay" },
    );
    s.run(95);
    s.setInput("D", 1);
    s.run(100);
    s.setInput("CLK", 1);
    s.run(200);
    expect(s.issues.some((i) => i.code === "setup-violation")).toBe(false);
    expect(s.netValue("Q0")).toBe(1);
  });
});

describe("评审 #5：无输入电路按触发器初态确定主循环", () => {
  it("环形计数器初态 1000 时，主循环为 4 个单 1 状态", () => {
    const comps = [C("CLK", "clock"), ...[0, 1, 2, 3].map((i) => C(`F${i}`, "dff", { init: i === 3 ? 1 : 0 }))];
    const r = extractSyncCircuit(
      nl(comps, [
        ["CLK", [["CLK", "CLK"], ["F0", "CLK"], ["F1", "CLK"], ["F2", "CLK"], ["F3", "CLK"]]],
        ["Q0", [["F0", "Q"], ["F1", "D"]]],
        ["Q1", [["F1", "Q"], ["F2", "D"]]],
        ["Q2", [["F2", "Q"], ["F3", "D"]]],
        ["Q3", [["F3", "Q"], ["F0", "D"]]],
      ]),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.initial).toBe(0b1000);
    const a = analyzeSync(r.circuit, r.initial);
    expect(a.selfStart.legal).toEqual([1, 2, 4, 8]);
  });
});

const base = { lesson: "kmap", level: "analysis" as const, title: "", prompt: "", knowledge: [], hints: ["h"], explanation: "e" };

describe("评审 #6：钟控 SR 的不定行不判错", () => {
  it("S=R=1 的行填任何值都不扣分", () => {
    const ex: Exercise = { ...base, id: "sr", kind: "statetable", circuit: { inputs: ["X"], ffs: [{ name: "Q0", type: "SR", inputs: { S: "X", R: "X" } }] } };
    const a = analyzeSync({ inputs: ["X"], ffs: [{ name: "Q0", type: "SR", edge: "rising", inputs: { S: parseExpr("X"), R: parseExpr("X") } }], outputs: [] });
    const next = a.rows.map((r) => (r.violations.length ? 0 : r.next));
    expect(grade(ex, { kind: "statetable", next }).correct).toBe(true);
  });
});

describe("评审 #7：相同表达式的两个输出各有独立网络", () => {
  it("Y = Z = XQ0 时 simulateDesign 不抛错且逐拍一致", () => {
    const spec: StateTableSpec = { kind: "mealy", inputs: ["X"], outputs: ["Y", "Z"], states: ["A", "B"], next: [[0, 1], [0, 1]], out: [[[0, 0], [0, 0]], [[0, 0], [1, 1]]] };
    const circuit = {
      inputs: ["X"],
      ffs: [{ name: "Q0", type: "D" as const, edge: "rising" as const, inputs: { D: parseExpr("X") } }],
      outputs: [{ name: "Y", expr: parseExpr("XQ0") }, { name: "Z", expr: parseExpr("XQ0") }],
    };
    const r = simulateDesign(spec, circuit, [0, 1], [1, 1, 0, 1, 1]);
    expect(r.ok).toBe(true);
  });
  it("逻辑图：输出直接等于输入变量时也有独立的输出网络", () => {
    const n = exprToNetlist([{ name: "Y", expr: parseExpr("A") }], ["A"]);
    const s = new Simulator(n);
    s.setInput("SW_A", 1);
    expect(s.netValue("Y")).toBe(1);
    expect(s.netValue("A")).toBe(1);
  });
});

describe("评审 #8/#9：判分的形式检查", () => {
  const sop: Exercise = { ...base, id: "s", kind: "expression", vars: ["A", "B", "C"], target: { minterms: [7] }, minimal: "sop" };
  const zero: Exercise = { ...base, id: "z", kind: "expression", vars: ["A", "B"], target: { minterms: [] }, minimal: "sop" };
  const pos: Exercise = { ...base, id: "p", kind: "expression", vars: ["A", "B", "C"], target: { expr: "(A+B)(A+C)(B+C)" }, minimal: "pos" };
  it("F=0 时答 0 为最简", () => expect(grade(zero, { kind: "expression", value: "0" }).correct).toBe(true));
  it("A(BC) 是与或式", () => expect(grade(sop, { kind: "expression", value: "A(BC)" }).correct).toBe(true));
  it("嵌套的或与式被识别", () => expect(grade(pos, { kind: "expression", value: "((A+B)(A+C))(B+C)" }).correct).toBe(true));
});

describe("评审 #10：多字母变量名（解析器文本语法只支持单字母+数字，内部流程改用 AST 结构键）", () => {
  it("toText 在多字母变量之间显式写 ·（EN·X），不会并写成 ENX", () => {
    const e = and(v("EN"), v("X"));
    const t = toText(e);
    expect(t).toBe("EN·X");
    expect(checkEquivalence(parseExpr(t.replace("EN", "E1")), parseExpr("E1X")).equivalent).toBe(true);
  });
});
