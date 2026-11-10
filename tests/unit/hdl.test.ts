import { describe, expect, it } from "vitest";
import { HdlSim, fmtVal } from "@/lib/hdl/interp";
import { parseVerilog } from "@/lib/hdl/parser";
import { netlistToVerilog, syncCircuitToVerilog, stateTableToVerilog, combToVerilog } from "@/lib/hdl/codegen";
import { Simulator, type L } from "@/lib/sim";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import { buildCounterNetlist, type CounterDesign } from "@/lib/counters/ls161";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { minimizeStates, runStateTable, sequenceDetector, synthesize } from "@/lib/fsm/design";
import { circuitToNetlist } from "@/lib/fsm/netlistgen";
import { parseExpr, truthTable } from "@/lib/logic";

const bit = (s: HdlSim, n: string): L => {
  const v = s.value(n);
  return (v.x & 1 ? 2 : v.v & 1) as L;
};

describe("Verilog 子集：解析与报错", () => {
  it.each([
    ["module m; initial a = 1; endmodule", "initial"],
    ["module m(input a, output y); assign #5 y = a; endmodule", "延迟"],
    ["module m(input a, output y); assign y = b; endmodule", "未声明"],
    ["module m(input a, output y) assign y = a; endmodule", ";"],
    ["module m(input a, output reg y); always @(*) y = a endmodule", "分号"],
    ["module m(input a); always @(*) begin $display(a); end endmodule", "系统任务"],
  ])("%s", (src, msg) => {
    expect(() => new HdlSim(src)).toThrow(msg);
  });
  it("错误信息带行列号", () => {
    try {
      parseVerilog("module m(input a,\n output y);\n assign y = a +;\nendmodule");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/第 3 行/);
    }
  });
  it("静态检查：多驱动、assign 驱动 reg、always 驱动 wire", () => {
    expect(new HdlSim("module m(input a, output y); assign y = a; assign y = ~a; endmodule").errors.length).toBeGreaterThan(0);
    expect(new HdlSim("module m(input a, output reg y); assign y = a; endmodule").errors.some((i) => i.message.includes("assign 只能驱动 wire"))).toBe(true);
    expect(new HdlSim("module m(input a, output y); always @(*) y = a; endmodule").errors.some((i) => i.message.includes("output reg"))).toBe(true);
  });
  it("锁存器推断与敏感列表不完整的警告", () => {
    const a = new HdlSim("module m(input s, input a, output reg y); always @(*) case (s) 1'b0: y = a; endcase endmodule");
    expect(a.issues.some((i) => i.message.includes("锁存器"))).toBe(true);
    const full = new HdlSim("module m(input s, input a, output reg y); always @(*) case (s) 1'b0: y = a; 1'b1: y = ~a; endcase endmodule");
    expect(full.issues.some((i) => i.message.includes("锁存器"))).toBe(false);
    const b = new HdlSim("module m(input a, input b, output reg y); always @(a) y = a & b; endmodule");
    expect(b.issues.some((i) => i.message.includes("敏感列表不完整"))).toBe(true);
  });
  it("组合环路不收敛时报错", () => {
    const s = new HdlSim("module m(input e, output y); assign y = e ? ~y : 1'b0; endmodule");
    s.set({ e: 0 });
    expect(() => s.set({ e: 1 })).toThrow("不收敛");
  });
});

describe("Verilog 子集：表达式语义（逐位 x）", () => {
  const ev = (expr: string, w = 4, inputs: Record<string, number | "x"> = {}) => {
    const s = new HdlSim(`module m(input [3:0] a, input [3:0] b, output [${w - 1}:0] y); assign y = ${expr}; endmodule`);
    s.set({ a: 0, b: 0, ...inputs });
    return fmtVal(s.value("y"));
  };
  it("位运算与 x 传播：0 & x = 0，1 | x = 1", () => {
    expect(ev("a & b", 4, { a: 0b1010, b: "x" })).toBe("x0x0");
    expect(ev("a | b", 4, { a: 0b1010, b: "x" })).toBe("1x1x");
    expect(ev("a ^ b", 4, { a: 0b1010, b: 0b0110 })).toBe("1100");
  });
  it("上下文位宽：{c, s} = a + b 保留进位", () => {
    const s = new HdlSim("module m(input [3:0] a, input [3:0] b, output [3:0] s, output c); assign {c, s} = a + b; endmodule");
    s.set({ a: 9, b: 8 });
    expect(fmtVal(s.value("c")) + fmtVal(s.value("s"))).toBe("10001");
  });
  it("归约、比较、条件、拼接与复制", () => {
    expect(ev("{3'b000, &a}", 4, { a: 15 })).toBe("0001");
    expect(ev("{3'b000, a == b}", 4, { a: 3, b: 3 })).toBe("0001");
    expect(ev("a > b ? a : b", 4, { a: 3, b: 9 })).toBe("1001");
    expect(ev("{2{a[1:0]}}", 4, { a: 0b10 })).toBe("1010");
    expect(ev("a << 1", 4, { a: 0b0101 })).toBe("1010");
  });
});

describe("边沿语义", () => {
  it("set() 中 x→0 与标准 Verilog 一样算下降沿；用 init 给出初值则不产生边沿", () => {
    const src = "module m(input clk, output reg [1:0] n = 2'd0); always @(negedge clk) n <= n + 2'd1; endmodule";
    const a = new HdlSim(src);
    a.set({ clk: 0 });
    expect(fmtVal(a.value("n"))).toBe("01");
    const b = new HdlSim(src, { init: { clk: 0 } });
    expect(fmtVal(b.value("n"))).toBe("00");
  });
});

describe("阻塞与非阻塞赋值", () => {
  it("同一块中：非阻塞实现移位寄存器，阻塞会“穿透”", () => {
    const nb = new HdlSim("module m(input clk, input d, output reg a = 1'b0, output reg b = 1'b0); always @(posedge clk) begin a <= d; b <= a; end endmodule", { init: { clk: 0, d: 1 } });
    nb.clock("clk");
    expect(fmtVal(nb.value("a")) + fmtVal(nb.value("b"))).toBe("10");
    const bl = new HdlSim("module m(input clk, input d, output reg a = 1'b0, output reg b = 1'b0); always @(posedge clk) begin a = d; b = a; end endmodule", { init: { clk: 0, d: 1 } });
    bl.clock("clk");
    expect(fmtVal(bl.value("a")) + fmtVal(bl.value("b"))).toBe("11");
  });
});

/** 用同样的时钟与输入，逐拍比较电路仿真引擎与 Verilog 解释器的输出 */
function crossCheck(nl: ReturnType<typeof buildJKCounter>, cycles: number, stim?: (k: number) => Record<string, 0 | 1>) {
  const gen = netlistToVerilog(nl);
  expect(gen.unsupported).toEqual([]);
  const sim = new Simulator(nl);
  const clk = gen.inputs.find((i) => i.clock);
  const init = Object.fromEntries(gen.inputs.map((i) => [i.port, i.clock ? 0 : Number((sim.compState(i.comp).value as number) ?? 0)]));
  const hdl = new HdlSim(gen.code, { top: gen.top, init });
  expect(hdl.errors).toEqual([]);
  const read = () => ({
    sim: gen.outputs.map((o) => sim.pinValue(o.comp, "A")),
    hdl: gen.outputs.map((o) => bit(hdl, o.port)),
  });
  const r0 = read();
  expect(r0.hdl, "初态").toEqual(r0.sim);
  for (let k = 0; k < cycles; k++) {
    const s = stim?.(k) ?? {};
    for (const [port, v] of Object.entries(s)) {
      const inp = gen.inputs.find((i) => i.port === port)!;
      sim.setInput(inp.comp, v);
    }
    if (Object.keys(s).length) hdl.set(s);
    if (clk) {
      sim.stepClock(clk.comp);
      hdl.clock(clk.port);
    }
    const r = read();
    expect(r.hdl, `第 ${k + 1} 拍`).toEqual(r.sim);
  }
  return gen;
}

describe("电路 → Verilog：与电路仿真引擎逐拍一致", () => {
  it("实验 A：同步三位 JK 计数器（下降沿）", () => {
    crossCheck(buildJKCounter(DEFAULT_JK_CONFIG), 10);
  });
  it("实验 A 改接线：K0 = Q2、J1 = Q0'", () => {
    crossCheck(buildJKCounter({ ...DEFAULT_JK_CONFIG, drives: { ...DEFAULT_JK_CONFIG.drives, K0: "Q2", J1: "Q0'" }, init: 5 }), 12);
  });
  const designs: CounterDesign[] = [
    { N: 10, method: "clear", chips: 1 },
    { N: 7, method: "sync-load", chips: 1, preset: 3 },
    { N: 12, method: "carry-load", chips: 1 },
    { N: 9, method: "clear", chips: 1, part: "ls163" },
    { N: 60, method: "sync-load", chips: 2 },
  ];
  it.each(designs.map((d) => [`${d.part ?? "ls161"} ${d.method} N=${d.N}${d.chips === 2 ? " 两片" : ""}`, d] as const))("74LS161 任意进制：%s", (_, d) => {
    crossCheck(buildCounterNetlist(d), d.N + 5);
  });
  it("设计向导结果（101 Mealy，JK）带输入激励", () => {
    const spec = minimizeStates(sequenceDetector("101", "mealy", true)).reduced;
    const syn = synthesize(spec, { ffType: "JK" });
    const nl = circuitToNetlist(syn.circuit, { init: 0 });
    const xs = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1];
    crossCheck(nl, xs.length, (k) => ({ X: xs[k] as 0 | 1 }));
  });
});

describe("方程 / 状态表 → Verilog", () => {
  it("syncCircuitToVerilog：实验 A 的方程生成的 Verilog 计数 000→111", () => {
    const r = extractSyncCircuit(buildJKCounter(DEFAULT_JK_CONFIG));
    if (!r.ok) throw new Error(r.reason);
    const code = syncCircuitToVerilog(r.circuit, { name: "counter3", init: 0 });
    const s = new HdlSim(code, { init: { clk: 0 } });
    expect(s.errors).toEqual([]);
    const seq: string[] = [];
    for (let i = 0; i < 8; i++) {
      s.clock("clk");
      seq.push([s.value("Q2"), s.value("Q1"), s.value("Q0")].map((v) => fmtVal(v)).join(""));
    }
    expect(seq).toEqual(["001", "010", "011", "100", "101", "110", "111", "000"]);
  });
  for (const [seq, kind] of [["101", "mealy"], ["1101", "moore"], ["0110", "mealy"]] as const)
    it(`stateTableToVerilog：${seq} ${kind} 三段式与状态表逐拍一致`, () => {
      const spec = minimizeStates(sequenceDetector(seq, kind, true)).reduced;
      const syn = synthesize(spec, { ffType: "D" });
      const code = stateTableToVerilog(spec, syn.codes, { name: "det" });
      const s = new HdlSim(code, { init: { clk: 0, rst_n: 1, X: 0 } });
      expect(s.errors).toEqual([]);
      expect(s.issues.filter((i) => i.message.includes("锁存器"))).toEqual([]);
      s.set({ rst_n: 0 }); // 真正的下降沿：异步复位
      s.set({ rst_n: 1 });
      const xs = [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
      const ref = runStateTable(spec, xs);
      xs.forEach((x, i) => {
        s.set({ X: x });
        expect(bit(s, "Y"), `第 ${i + 1} 拍输出`).toBe(ref.outputs[i][0]);
        s.clock("clk");
      });
    });
  it("combToVerilog：与真值表一致", () => {
    const e = parseExpr("AB + A'C + (B⊕C)'");
    const s = new HdlSim(combToVerilog([{ name: "Y", expr: e }], ["A", "B", "C"]));
    const t = truthTable(e, ["A", "B", "C"]);
    for (let m = 0; m < 8; m++) {
      s.set({ A: (m >> 2) & 1, B: (m >> 1) & 1, C: m & 1 });
      expect(bit(s, "Y")).toBe(t[m]);
    }
  });
});

describe("门级原语给出明确提示", () => {
  it("and g1(y, a, b);", () => {
    expect(() => new HdlSim("module m(input a, input b, output y); and g1(y, a, b); endmodule")).toThrow("门级原语");
  });
});
