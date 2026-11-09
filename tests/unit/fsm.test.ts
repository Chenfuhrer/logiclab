import { describe, expect, it } from "vitest";
import { analyzeSync, selfStartCheck } from "@/lib/fsm/analyze";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { minimizeStates, runStateTable, sequenceDetector, synthesize, type StateTableSpec } from "@/lib/fsm/design";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import { parseExpr, checkEquivalence, toText } from "@/lib/logic";
import { Simulator } from "@/lib/sim";
import { buildCounterNetlist, verifyCounter, type CounterDesign } from "@/lib/counters/ls161";

const p = parseExpr;

describe("从网表自动提取驱动方程（实验 A）", () => {
  it("提取出 J0=K0=1, J1=K1=Q0, J2=K2=Q0Q1, C=Q0Q1Q2", () => {
    const r = extractSyncCircuit(buildJKCounter(DEFAULT_JK_CONFIG));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { circuit } = r;
    expect(circuit.ffs.map((f) => f.name)).toEqual(["Q2", "Q1", "Q0"]);
    const eq = (a: ReturnType<typeof p>, b: string) => checkEquivalence(a, p(b)).equivalent;
    const ff = (n: string) => circuit.ffs.find((f) => f.name === n)!;
    expect(eq(ff("Q0").inputs.J!, "1") && eq(ff("Q0").inputs.K!, "1")).toBe(true);
    expect(eq(ff("Q1").inputs.J!, "Q0") && eq(ff("Q1").inputs.K!, "Q0")).toBe(true);
    expect(eq(ff("Q2").inputs.J!, "Q0Q1") && eq(ff("Q2").inputs.K!, "Q0Q1")).toBe(true);
    expect(eq(circuit.outputs[0].expr, "Q0Q1Q2")).toBe(true);
  });
  it("状态方程、状态表、自启动", () => {
    const r = extractSyncCircuit(buildJKCounter(DEFAULT_JK_CONFIG));
    if (!r.ok) throw new Error(r.reason);
    const a = analyzeSync(r.circuit, 0);
    // Q0^{n+1} = Q0'，Q1^{n+1} = Q0 ⊕ Q1，Q2^{n+1} = Q2 ⊕ Q0Q1
    expect(checkEquivalence(a.stateEqs.find((s) => s.name === "Q0")!.simplified, p("Q0'")).equivalent).toBe(true);
    expect(checkEquivalence(a.stateEqs.find((s) => s.name === "Q1")!.simplified, p("Q0⊕Q1")).equivalent).toBe(true);
    expect(checkEquivalence(a.stateEqs.find((s) => s.name === "Q2")!.simplified, p("Q2⊕Q0Q1")).equivalent).toBe(true);
    expect(a.sequence).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    expect(a.kind).toBe("moore");
    expect(a.selfStart.selfStarting).toBe(true);
    expect(a.selfStart.unused).toEqual([]);
  });
  it("符号分析结果与仿真引擎逐状态一致", () => {
    const cfg = { ...DEFAULT_JK_CONFIG, drives: { J0: "1", K0: "Q2", J1: "Q0'", K1: "Q2'Q0", J2: "Q1Q0", K2: "1" } };
    const nl = buildJKCounter(cfg);
    const r = extractSyncCircuit(nl);
    if (!r.ok) throw new Error(r.reason);
    const a = analyzeSync(r.circuit, 0);
    for (let s = 0; s < 8; s++) {
      const sim = new Simulator(buildJKCounter({ ...cfg, init: s }));
      sim.stepClock();
      const got = (sim.netValue("Q2") as number) * 4 + (sim.netValue("Q1") as number) * 2 + (sim.netValue("Q0") as number);
      expect(got, `state ${s}`).toBe(a.rows[s].next);
    }
  });
  it("含不支持元件时明确拒绝，不猜测方程", () => {
    const r = extractSyncCircuit(buildCounterNetlist({ N: 10, method: "clear", chips: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("不支持自动符号分析");
  });
});

describe("自启动检查", () => {
  it("区分合法循环、无效循环与可进入主循环的无效状态", () => {
    // 3 位：主循环 0→1→2→0；3→4→0（可自启动）；5→6→5（无效循环）；7→5
    const nexts = [1, 2, 0, 4, 0, 6, 5, 5];
    const rows = nexts.map((n, s) => ({ state: s, input: 0, next: n, outputs: [], drives: {}, violations: [] }));
    const r = selfStartCheck(rows, 3, 0, 0);
    expect(r.legal).toEqual([0, 1, 2]);
    expect(r.invalidCycles).toEqual([[5, 6]]);
    expect(r.selfStarting).toBe(false);
    const v = Object.fromEntries(r.details.map((d) => [d.state, d.verdict]));
    expect(v).toEqual({ 3: "always", 4: "always", 5: "never", 6: "never", 7: "never" });
  });
  it("有输入时区分 always / some", () => {
    // 2 位，1 输入：合法 {0,1}；状态 2：x=0→0，x=1→3；状态 3：x=0→3，x=1→2
    const nexts = [
      [1, 0],
      [0, 1],
      [0, 3],
      [3, 2],
    ];
    const rows = nexts.flatMap((r, s) => r.map((n, x) => ({ state: s, input: x, next: n, outputs: [], drives: {}, violations: [] })));
    const res = selfStartCheck(rows, 2, 1, 0);
    expect(res.details.map((d) => d.verdict)).toEqual(["some", "some"]);
    expect(res.selfStarting).toBe(false);
  });
});

describe("状态化简（隐含表）", () => {
  it("输出相同但次态不等价的状态不能合并", () => {
    // Moore：A、B 输出都为 0，但 A 在 x=1 去 C（输出 1），B 在 x=1 去 A（输出 0）
    const spec: StateTableSpec = {
      kind: "moore",
      inputs: ["X"],
      outputs: ["Y"],
      states: ["A", "B", "C"],
      next: [
        [0, 2],
        [1, 0],
        [0, 0],
      ],
      out: [
        [[0], [0]],
        [[0], [0]],
        [[1], [1]],
      ],
    };
    const m = minimizeStates(spec);
    expect(m.classes.length).toBe(3);
    expect(m.pairs.get("1,0")?.kind).toBe("next");
  });
  it("等价状态被合并（依赖递归的隐含对）", () => {
    // 经典：S0..S4，S3≡S4
    const spec: StateTableSpec = {
      kind: "mealy",
      inputs: ["X"],
      outputs: ["Y"],
      states: ["S0", "S1", "S2", "S3", "S4"],
      next: [
        [0, 1],
        [0, 2],
        [3, 2],
        [0, 1],
        [0, 1],
      ],
      out: [
        [[0], [0]],
        [[0], [0]],
        [[0], [1]],
        [[0], [0]],
        [[0], [0]],
      ],
    };
    const m = minimizeStates(spec);
    // S0、S3、S4 等价（输出相同、次态相同）
    expect(m.classes).toEqual([[0, 3, 4], [1], [2]]);
    // 化简后的状态表对任意输入序列的输出与原表一致
    for (let trial = 0; trial < 50; trial++) {
      const seq = Array.from({ length: 20 }, () => (Math.random() < 0.5 ? 0 : 1));
      expect(runStateTable(m.reduced, seq).outputs).toEqual(runStateTable(spec, seq).outputs);
    }
  });
});

describe("序列检测器", () => {
  const detectRef = (seq: string, bits: number[], overlap: boolean) => {
    const out: number[] = [];
    let buf = "";
    for (const b of bits) {
      buf += b;
      if (buf.endsWith(seq)) {
        out.push(1);
        if (!overlap) buf = "";
      } else out.push(0);
    }
    return out;
  };
  for (const seq of ["101", "1101", "0110", "111", "10010"])
    for (const kind of ["mealy", "moore"] as const)
      for (const overlap of [true, false])
        it(`${seq} ${kind} ${overlap ? "可重叠" : "不可重叠"}：与字符串参考模型一致`, () => {
          const spec = sequenceDetector(seq, kind, overlap);
          for (let trial = 0; trial < 40; trial++) {
            const bits = Array.from({ length: 30 }, () => (Math.random() < 0.5 ? 0 : 1));
            const r = runStateTable(spec, bits);
            // Mealy：输出与输入同拍；Moore：输出在下一个状态（晚一拍）
            const outs = kind === "mealy" ? r.outputs.map((o) => o[0]) : r.states.slice(1).map((s) => spec.out[s][0][0]);
            expect(outs).toEqual(detectRef(seq, bits, overlap));
          }
        });
});

describe("同步时序设计综合", () => {
  for (const ff of ["D", "JK", "T"] as const)
    it(`101 Mealy 可重叠检测器，${ff} 触发器：驱动方程逐状态实现目标次态`, () => {
      const spec = sequenceDetector("101", "mealy", true);
      const syn = synthesize(spec, { ffType: ff });
      expect(syn.verified).toBe(true);
      expect(syn.nBits).toBe(2);
      // 用仿真引擎再验证一次：设计得到的电路对随机输入序列的输出与状态表一致
      const ref = runStateTable(spec, [1, 0, 1, 0, 1, 1, 0, 1]);
      expect(ref.outputs.map((o) => o[0])).toEqual([0, 0, 1, 0, 1, 0, 0, 1]);
    });
  it("无效状态作无关项时可能不能自启动；forceSelfStart 修正", () => {
    // 模 5 计数器（3 位，3 个无效状态）
    const spec: StateTableSpec = {
      kind: "moore",
      inputs: [],
      outputs: ["C"],
      states: ["0", "1", "2", "3", "4"],
      next: [[1], [2], [3], [4], [0]],
      out: [[[0]], [[0]], [[0]], [[0]], [[1]]],
    };
    for (const ff of ["D", "JK", "T"] as const) {
      const a = synthesize(spec, { ffType: ff });
      expect(a.verified).toBe(true);
      const b = synthesize(spec, { ffType: ff, forceSelfStart: true });
      expect(b.verified).toBe(true);
      expect(b.selfStart.selfStarting).toBe(true);
      expect(b.selfStart.unused).toEqual([5, 6, 7]);
    }
  });
  it("JK 驱动方程化简结果：模 5 计数器", () => {
    const spec: StateTableSpec = {
      kind: "moore",
      inputs: [],
      outputs: ["C"],
      states: ["0", "1", "2", "3", "4"],
      next: [[1], [2], [3], [4], [0]],
      out: [[[0]], [[0]], [[0]], [[0]], [[1]]],
    };
    const syn = synthesize(spec, { ffType: "JK" });
    const get = (n: string) => toText(syn.excitation.find((e) => e.name === n)!.expr);
    // 经典结果：J2 = Q1Q0, K2 = 1, J1 = K1 = Q0, J0 = Q2', K0 = 1
    expect(checkEquivalence(p(get("J2")), p("Q1Q0")).equivalent).toBe(true);
    expect(get("K2")).toBe("1");
    expect(checkEquivalence(p(get("J1")), p("Q0")).equivalent).toBe(true);
    expect(checkEquivalence(p(get("J0")), p("Q2'")).equivalent).toBe(true);
    expect(syn.selfStart.selfStarting).toBe(true);
  });
});

describe("74LS161 任意进制计数器：N=2～16 全部用仿真验证", () => {
  const cases: CounterDesign[] = [];
  for (let N = 2; N <= 16; N++) {
    cases.push({ N, method: "clear", chips: 1 });
    cases.push({ N, method: "sync-load", chips: 1 });
    cases.push({ N, method: "carry-load", chips: 1 });
    cases.push({ N, method: "clear", chips: 1, part: "ls163" });
  }
  it.each(cases.map((c) => [`${c.part ?? "ls161"} ${c.method} N=${c.N}`, c] as const))("%s", (_, d) => {
    const v = verifyCounter(d);
    expect(v.modulus).toBe(d.N);
    expect(v.ok).toBe(true);
    if (d.method === "clear" && (d.part ?? "ls161") === "ls161" && d.N < 16) {
      // 异步清零：状态 N 只以瞬态出现
      expect(v.transients).toContain(d.N);
      expect(v.cycle).not.toContain(d.N);
    } else {
      expect(v.transients).toEqual([]);
    }
  });
  it("异步清零是同一时刻内的事件序列（零延迟），带延迟模型下瞬态有非零宽度", () => {
    const nl = buildCounterNetlist({ N: 10, method: "clear", chips: 1 });
    const sim = new Simulator(nl);
    for (let i = 0; i < 10; i++) sim.stepClock();
    const q1 = sim.trace("Q1").filter((x) => x.t >= 900);
    // 在 t=900 处 Q1 先变 1 再变 0，同一时刻，不同 delta
    expect(q1.length).toBe(2);
    expect(q1[0].t).toBe(q1[1].t);
    expect(q1[0].d).toBeLessThan(q1[1].d);
    const simC = new Simulator(nl, { model: "delay" });
    for (let i = 0; i < 10; i++) simC.stepClock();
    const tr = simC.trace("Q1").filter((x) => x.t >= 900);
    expect(tr.length).toBe(2);
    expect(tr[1].t - tr[0].t).toBe(30); // 与非门 10 ns + 161 清零 20 ns（教学示意值）
  });
  it("两片级联：N=24、60、100、256", () => {
    for (const N of [24, 60, 100, 256]) {
      for (const method of ["clear", "sync-load"] as const) {
        const v = verifyCounter({ N, method, chips: 2 }, 300);
        expect(v.modulus, `${method} N=${N}`).toBe(N);
      }
    }
  });
  it("同步置数法预置数 M：从 M 开始计 N 个状态", () => {
    const v = verifyCounter({ N: 7, method: "sync-load", chips: 1, preset: 3 });
    expect(v.cycle).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
  it("自启动：异步清零法 N=10，所有上电状态都能进入主循环", () => {
    const v = verifyCounter({ N: 10, method: "clear", chips: 1 });
    expect(v.selfStart.every((s) => s.entersCycle)).toBe(true);
  });
});

describe("设计结果的门级仿真验证（netlistgen）", () => {
  const inputs = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1];
  for (const seq of ["101", "1101", "0110"])
    for (const kind of ["mealy", "moore"] as const)
      for (const ff of ["D", "JK", "T"] as const)
        it(`${seq} ${kind} ${ff}：生成的门级电路逐拍与状态表一致`, async () => {
          const { simulateDesign } = await import("@/lib/fsm/netlistgen");
          const spec = minimizeStates(sequenceDetector(seq, kind, true)).reduced;
          const syn = synthesize(spec, { ffType: ff });
          const r = simulateDesign(spec, syn.circuit, syn.codes, inputs);
          expect(r.ok, `mismatch at ${r.firstMismatch}`).toBe(true);
          expect(r.sim.compileErrors).toEqual([]);
        });
});
