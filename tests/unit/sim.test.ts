import { describe, expect, it } from "vitest";
import { Simulator, type Netlist, type L, LX, LZ } from "@/lib/sim";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";

type Ep = [string, string];
function nl(components: Netlist["components"], nets: [string, Ep[]][]): Netlist {
  return { version: 1, name: "t", components, nets: nets.map(([id, eps]) => ({ id, name: id, endpoints: eps.map(([comp, pin]) => ({ comp, pin })) })) };
}
const C = (id: string, type: string, params?: Record<string, number | string | boolean>) => ({ id, type, params, x: 0, y: 0 });

/** 单个触发器测试台：开关驱动数据端，时钟单步 */
function ffBench(type: string, dataPins: string[], params: Record<string, number | string | boolean> = {}, async = false) {
  const comps = [C("CLK", "clock"), C("U", type, params), ...dataPins.map((p) => C(`S_${p}`, "switch"))];
  const nets: [string, Ep[]][] = [["CLK", [["CLK", "CLK"], ["U", "CLK"]]], ["Q", [["U", "Q"]]], ["QN", [["U", "QN"]]], ...dataPins.map((p) => [p, [[`S_${p}`, "Y"], ["U", p]]] as [string, Ep[]])];
  if (async) {
    comps.push(C("S_SD", "switch", { value: 1 }), C("S_RD", "switch", { value: 1 }));
    nets.push(["SD", [["S_SD", "Y"], ["U", "SD"]]], ["RD", [["S_RD", "Y"], ["U", "RD"]]]);
  }
  return new Simulator(nl(comps, nets));
}

describe("触发器模型", () => {
  it("D 触发器：上升沿采样", () => {
    const s = ffBench("dff", ["D"], { init: 0 });
    s.setInput("S_D", 1);
    expect(s.netValue("Q")).toBe(0); // 没有时钟沿，不变
    s.stepClock();
    expect(s.netValue("Q")).toBe(1);
    expect(s.netValue("QN")).toBe(0);
    s.setInput("S_D", 0);
    s.stepClock();
    expect(s.netValue("Q")).toBe(0);
  });
  it("下降沿触发：上升沿时不变，下降沿才变", () => {
    const s = ffBench("dff", ["D"], { init: 0, edge: "falling" });
    s.setInput("S_D", 1);
    s.setInput("CLK", 1);
    expect(s.netValue("Q")).toBe(0);
    s.setInput("CLK", 0);
    expect(s.netValue("Q")).toBe(1);
  });
  it("JK 触发器全部四种输入", () => {
    const s = ffBench("jkff", ["J", "K"], { init: 0 });
    const step = (j: L, k: L) => {
      s.setInput("S_J", j);
      s.setInput("S_K", k);
      s.stepClock();
      return s.netValue("Q");
    };
    expect(step(0, 0)).toBe(0); // 保持
    expect(step(1, 0)).toBe(1); // 置 1
    expect(step(0, 0)).toBe(1);
    expect(step(0, 1)).toBe(0); // 置 0
    expect(step(1, 1)).toBe(1); // 翻转
    expect(step(1, 1)).toBe(0);
  });
  it("T 触发器", () => {
    const s = ffBench("tff", ["T"], { init: 1 });
    s.setInput("S_T", 1);
    s.stepClock();
    expect(s.netValue("Q")).toBe(0);
    s.setInput("S_T", 0);
    s.stepClock();
    expect(s.netValue("Q")).toBe(0);
  });
  it("钟控 SR：S=R=1 次态不确定并给出警告", () => {
    const s = ffBench("srff", ["S", "R"], { init: 0 });
    s.setInput("S_S", 1);
    s.setInput("S_R", 1);
    s.stepClock();
    expect(s.netValue("Q")).toBe(LX);
    expect(s.issues.some((i) => i.code === "forbidden-input")).toBe(true);
  });
  it("初始未知状态 X：JK 翻转后仍为 X，D 采样后确定", () => {
    const jk = ffBench("jkff", ["J", "K"]);
    expect(jk.netValue("Q")).toBe(LX);
    jk.setInput("S_J", 1);
    jk.setInput("S_K", 1);
    jk.stepClock();
    expect(jk.netValue("Q")).toBe(LX);
    jk.setInput("S_K", 0);
    jk.stepClock();
    expect(jk.netValue("Q")).toBe(1); // J=1,K=0 无论现态都置 1
    const d = ffBench("dff", ["D"]);
    d.setInput("S_D", 0);
    d.stepClock();
    expect(d.netValue("Q")).toBe(0);
  });
  it("异步置 0 / 置 1 不需要时钟，且优先于时钟", () => {
    const s = ffBench("dff", ["D"], { init: 1 }, true);
    s.setInput("S_RD", 0);
    expect(s.netValue("Q")).toBe(0);
    s.setInput("S_D", 1);
    s.stepClock();
    expect(s.netValue("Q")).toBe(0); // 复位期间时钟无效
    s.setInput("S_RD", 1);
    s.setInput("S_SD", 0);
    expect(s.netValue("Q")).toBe(1);
  });
  it("D 锁存器是电平触发（透明）", () => {
    const sim = new Simulator(
      nl([C("D", "switch"), C("E", "switch"), C("U", "d_latch", { init: 0 })], [
        ["Dn", [["D", "Y"], ["U", "D"]]],
        ["En", [["E", "Y"], ["U", "EN"]]],
        ["Q", [["U", "Q"]]],
      ]),
    );
    sim.setInput("E", 1);
    sim.setInput("D", 1);
    expect(sim.netValue("Q")).toBe(1); // 不需要沿
    sim.setInput("D", 0);
    expect(sim.netValue("Q")).toBe(0);
    sim.setInput("E", 0);
    sim.setInput("D", 1);
    expect(sim.netValue("Q")).toBe(0); // 保持
  });
  it("主从 JK 的一次翻转：CLK=1 期间 J 的短暂正脉冲被主触发器捕获", () => {
    const sim = new Simulator(
      nl([C("CLK", "clock"), C("J", "switch"), C("K", "switch"), C("U", "jkff_ms", { init: 0 })], [
        ["CLKn", [["CLK", "CLK"], ["U", "CLK"]]],
        ["Jn", [["J", "Y"], ["U", "J"]]],
        ["Kn", [["K", "Y"], ["U", "K"]]],
        ["Q", [["U", "Q"]]],
      ]),
    );
    sim.setInput("CLK", 1);
    sim.setInput("J", 1); // 高电平期间出现正脉冲
    sim.setInput("J", 0);
    expect(sim.netValue("Q")).toBe(0); // 从触发器尚未更新
    sim.setInput("CLK", 0);
    // 下降沿时 J=K=0，边沿 JK 应保持 0；主从 JK 因一次翻转输出 1
    expect(sim.netValue("Q")).toBe(1);
  });
});

describe("两阶段更新：同一时钟沿内不串扰", () => {
  it("D 触发器移位链：一个沿只移动一位", () => {
    const comps = [C("CLK", "clock"), C("IN", "switch", { value: 1 }), C("F0", "dff", { init: 0 }), C("F1", "dff", { init: 0 }), C("F2", "dff", { init: 0 })];
    const s = new Simulator(
      nl(comps, [
        ["CLK", [["CLK", "CLK"], ["F0", "CLK"], ["F1", "CLK"], ["F2", "CLK"]]],
        ["IN", [["IN", "Y"], ["F0", "D"]]],
        ["Q0", [["F0", "Q"], ["F1", "D"]]],
        ["Q1", [["F1", "Q"], ["F2", "D"]]],
        ["Q2", [["F2", "Q"]]],
      ]),
    );
    s.stepClock();
    expect([s.netValue("Q0"), s.netValue("Q1"), s.netValue("Q2")]).toEqual([1, 0, 0]);
    s.stepClock();
    expect([s.netValue("Q0"), s.netValue("Q1"), s.netValue("Q2")]).toEqual([1, 1, 0]);
  });
  it("交换电路：两个 D 触发器互相采样，在一个沿上交换数值", () => {
    const s = new Simulator(
      nl([C("CLK", "clock"), C("A", "dff", { init: 1 }), C("B", "dff", { init: 0 })], [
        ["CLK", [["CLK", "CLK"], ["A", "CLK"], ["B", "CLK"]]],
        ["QA", [["A", "Q"], ["B", "D"]]],
        ["QB", [["B", "Q"], ["A", "D"]]],
      ]),
    );
    s.stepClock();
    expect([s.netValue("QA"), s.netValue("QB")]).toEqual([0, 1]);
  });
});

describe("实验 A：同步三位二进制加法计数器", () => {
  it("下降沿计数 000→001→…→111→000，C 在 111 时为 1", () => {
    const s = new Simulator(buildJKCounter(DEFAULT_JK_CONFIG));
    const read = () => (s.netValue("Q2") as number) * 4 + (s.netValue("Q1") as number) * 2 + (s.netValue("Q0") as number);
    const seq = [read()];
    const carry = [s.netValue("C")];
    for (let i = 0; i < 8; i++) {
      s.stepClock();
      seq.push(read());
      carry.push(s.netValue("C"));
    }
    expect(seq).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    expect(carry).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(s.issues.filter((i) => i.level === "error")).toEqual([]);
  });
  it("状态在时钟下降沿（周期中点）改变", () => {
    const s = new Simulator(buildJKCounter(DEFAULT_JK_CONFIG));
    s.stepClock();
    const tr = s.trace("Q0");
    expect(tr[tr.length - 1].t).toBe(50);
  });
});

describe("总线与输出结构", () => {
  it("两个推挽输出直接相连：编译期报错", () => {
    const s = new Simulator(nl([C("A", "const1"), C("B", "const0"), C("L", "led")], [["N", [["A", "Y"], ["B", "Y"], ["L", "A"]]]]));
    expect(s.compileErrors.some((i) => i.code === "pushpull-conflict")).toBe(true);
    expect(s.netValue("N")).toBe(LX);
  });
  it("三态总线：只有一个使能时正常，全部禁止为 Z，两个使能且相反为 X 并报冲突", () => {
    const s = new Simulator(
      nl(
        [C("A", "switch", { value: 1 }), C("B", "switch", { value: 0 }), C("EA", "switch"), C("EB", "switch"), C("T1", "tribuf"), C("T2", "tribuf"), C("L", "led")],
        [
          ["a", [["A", "Y"], ["T1", "A"]]],
          ["b", [["B", "Y"], ["T2", "A"]]],
          ["ea", [["EA", "Y"], ["T1", "EN"]]],
          ["eb", [["EB", "Y"], ["T2", "EN"]]],
          ["BUS", [["T1", "Y"], ["T2", "Y"], ["L", "A"]]],
        ],
      ),
    );
    expect(s.compileErrors).toEqual([]);
    expect(s.netValue("BUS")).toBe(LZ);
    s.setInput("EA", 1);
    expect(s.netValue("BUS")).toBe(1);
    s.setInput("EA", 0);
    s.setInput("EB", 1);
    expect(s.netValue("BUS")).toBe(0);
    s.setInput("EA", 1);
    expect(s.netValue("BUS")).toBe(LX);
    expect(s.issues.some((i) => i.code === "bus-conflict")).toBe(true);
  });
  it("OC 门线与：有上拉时实现线与；无上拉时警告并为 Z", () => {
    const mk = (pull: boolean) =>
      new Simulator(
        nl(
          [C("A", "switch"), C("B", "switch"), C("G1", "nand", { oc: true }), C("G2", "nand", { oc: true }), ...(pull ? [C("R", "pullup")] : []), C("L", "led")],
          [
            ["a", [["A", "Y"], ["G1", "I0"], ["G1", "I1"]]],
            ["b", [["B", "Y"], ["G2", "I0"], ["G2", "I1"]]],
            ["Y", [["G1", "Y"], ["G2", "Y"], ["L", "A"], ...(pull ? [["R", "Y"] as Ep] : [])]],
          ],
        ),
      );
    const s = mk(true);
    // Y = (A')(B') = (A+B)'
    const table: [L, L, L][] = [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0]];
    for (const [a, b, y] of table) {
      s.setInput("A", a);
      s.setInput("B", b);
      expect(s.netValue("Y")).toBe(y);
    }
    const n = mk(false);
    expect(n.issues.some((i) => i.code === "no-pullup")).toBe(true);
    expect(n.netValue("Y")).toBe(LZ);
  });
  it("输入悬空：逻辑模型为 X，TTL 模式视为 1", () => {
    const build = () => nl([C("A", "switch", { value: 1 }), C("G", "and"), C("L", "led")], [["a", [["A", "Y"], ["G", "I0"]]], ["Y", [["G", "Y"], ["L", "A"]]]]);
    const s = new Simulator(build());
    expect(s.netValue("Y")).toBe(LX);
    expect(s.issues.some((i) => i.code === "floating-input")).toBe(true);
    const t = new Simulator(build(), { floating: "TTL" });
    expect(t.netValue("Y")).toBe(1);
  });
});

describe("组合反馈", () => {
  it("或非门交叉耦合：可收敛反馈作为锁存器工作", () => {
    const s = new Simulator(
      nl([C("S", "switch"), C("R", "switch", { value: 1 }), C("G1", "nor"), C("G2", "nor")], [
        ["s", [["S", "Y"], ["G2", "I0"]]],
        ["r", [["R", "Y"], ["G1", "I0"]]],
        ["Q", [["G1", "Y"], ["G2", "I1"]]],
        ["QN", [["G2", "Y"], ["G1", "I1"]]],
      ]),
    );
    expect(s.issues.some((i) => i.code === "comb-loop")).toBe(true);
    expect(s.netValue("Q")).toBe(0);
    s.setInput("R", 0);
    expect(s.netValue("Q")).toBe(0); // 保持
    s.setInput("S", 1);
    expect(s.netValue("Q")).toBe(1);
    s.setInput("S", 0);
    expect(s.netValue("Q")).toBe(1);
    expect(s.halted).toBe(false);
  });
  it("单个非门自环：零延迟不收敛，停止并报错", () => {
    const s = new Simulator(nl([C("N", "not")], [["L", [["N", "Y"], ["N", "A"]]]]), { maxDelta: 50 });
    // 初始 X 不会振荡；强制给一个确定值后开始振荡
    const s2 = new Simulator(
      nl([C("E", "switch"), C("G", "nand")], [
        ["e", [["E", "Y"], ["G", "I0"]]],
        ["L", [["G", "Y"], ["G", "I1"]]],
      ]),
      { maxDelta: 50 },
    );
    s2.setInput("E", 0); // 输出确定为 1
    s2.setInput("E", 1); // 环路变成反相器自环
    expect(s2.halted).toBe(true);
    expect(s2.issues.some((i) => i.code === "no-converge")).toBe(true);
    void s;
  });
  it("带延迟模型：环形振荡器按 2·tpd 周期振荡，事件超限后停止", () => {
    const s = new Simulator(
      nl([C("E", "switch"), C("G", "nand", { tpd: 10 })], [
        ["e", [["E", "Y"], ["G", "I0"]]],
        ["L", [["G", "Y"], ["G", "I1"]]],
      ]),
      { model: "delay", maxEvents: 200 },
    );
    s.setInput("E", 0);
    s.run(50);
    s.setInput("E", 1);
    s.run(200);
    const tr = s.trace("L").filter((p) => p.t >= 50);
    const gaps = tr.slice(1).map((p, i) => p.t - tr[i].t);
    expect(gaps.every((g) => g === 10)).toBe(true);
  });
});

describe("模型 C：传播延迟与时序检查", () => {
  it("门延迟累加，竞争产生毛刺（Y = A·A' 在 A 上升时出现 1 的毛刺）", () => {
    const s = new Simulator(
      nl([C("A", "switch"), C("N", "not", { tpd: 10 }), C("G", "and", { tpd: 10 })], [
        ["a", [["A", "Y"], ["N", "A"], ["G", "I0"]]],
        ["an", [["N", "Y"], ["G", "I1"]]],
        ["Y", [["G", "Y"]]],
      ]),
      { model: "delay" },
    );
    s.run(100);
    s.setInput("A", 1);
    s.run(200);
    const ys = s.trace("Y").filter((p) => p.t >= 100);
    expect(ys.map((p) => [p.t, p.v])).toEqual([
      [110, 1],
      [120, 0],
    ]);
  });
  it("建立时间违例：数据在时钟沿前不足 tsu 内变化，输出变为 X", () => {
    const s = ffBench("dff", ["D"], { init: 0, tsu: 20 });
    void s;
    const sim = new Simulator(
      nl([C("CLK", "clock"), C("SD", "switch"), C("U", "dff", { init: 0, tsu: 20, tpd: 5 })], [
        ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
        ["D", [["SD", "Y"], ["U", "D"]]],
        ["Q", [["U", "Q"]]],
      ]),
      { model: "delay" },
    );
    sim.run(100);
    sim.setInput("SD", 1);
    sim.run(105);
    sim.setInput("CLK", 1); // D 在沿前 5 ns 才变化
    sim.run(200);
    expect(sim.issues.some((i) => i.code === "setup-violation")).toBe(true);
    expect(sim.netValue("Q")).toBe(LX);
  });
});
