import { describe, expect, it } from "vitest";
import { HdlSim, fmtVal } from "@/lib/hdl/interp";
import { HDL_EXAMPLES, findHdlExample } from "@/lib/hdl/examples";

function run(id: string) {
  const ex = findHdlExample(id)!;
  const s = new HdlSim(ex.code, { init: ex.init });
  const outs: Record<string, string>[] = [];
  const snap = () => Object.fromEntries(s.signals().filter((x) => x.top === "output").map((x) => [x.name, fmtVal(s.value(x.name))]));
  for (const step of ex.script ?? []) {
    if (Object.keys(step).length) s.set(step);
    if (ex.clock) s.clock(ex.clock);
    outs.push(snap());
  }
  return { s, outs, snap };
}

describe("Verilog 示例库：每个示例都能运行，并得到预期结果", () => {
  it.each(HDL_EXAMPLES.map((e) => [e.id, e] as const))("%s 无错误", (_, ex) => {
    const s = new HdlSim(ex.code, { init: ex.init });
    expect(s.errors).toEqual([]);
  });
  it("adder4：9 + 8 = 1_0001", () => {
    const { snap } = run("adder4");
    expect(snap()).toEqual({ s: "0001", c: "1" });
  });
  it("decoder138：A=5 时 Y5 为 0", () => {
    expect(run("decoder138").snap().y_n).toBe("11011111");
  });
  it("dff：异步复位立即生效", () => {
    expect(run("dff").outs.map((o) => o.q)).toEqual(["1", "0", "1", "0", "1", "0"]); // 第 4 拍复位清零；第 5 拍 d 仍为 1
  });
  it("counter3：复位后 000→…", () => {
    expect(run("counter3").outs.map((o) => o.q)).toEqual(["000", "001", "010", "011", "100", "101", "110", "111", "000", "001"]);
  });
  it("counter10：模 10", () => {
    expect(run("counter10").outs.map((o) => parseInt(o.q, 2))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2]);
  });
  it("移位：非阻塞逐级移动，阻塞一拍穿透并给出提示", () => {
    expect(run("shift-nb").outs.map((o) => o.q0 + o.q1 + o.q2)).toEqual(["100", "010", "001", "100", "110", "011", "001"]);
    const b = run("shift-b");
    expect(b.outs.map((o) => o.q0 + o.q1 + o.q2)).toEqual(["111", "000", "000", "111", "111", "000", "000"]);
    expect(b.s.issues.some((i) => i.message.includes("阻塞赋值"))).toBe(true);
  });
  it("latch-bug：推断锁存器警告", () => {
    expect(run("latch-bug").s.issues.some((i) => i.message.includes("锁存器"))).toBe(true);
  });
  it("fsm101：第 3、5、8 拍检测到 101", () => {
    const ex = findHdlExample("fsm101")!;
    const s = new HdlSim(ex.code, { init: ex.init });
    const ys: string[] = [];
    for (const step of ex.script!) {
      s.set(step);
      ys.push(fmtVal(s.value("y"))); // Mealy：时钟沿之前读输出
      s.clock("clk");
    }
    // 第一拍是复位；之后输入 1 0 1 0 1 1 0 1 0
    expect(ys.slice(1)).toEqual(["0", "0", "1", "0", "1", "0", "0", "1", "0"]);
  });
  it("jk-structural：与实验 A 相同的计数序列", () => {
    expect(run("jk-structural").outs.map((o) => o.q2 + o.q1 + o.q0)).toEqual(["001", "010", "011", "100", "101", "110", "111", "000", "001"]);
  });
});
