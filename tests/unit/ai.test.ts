import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runTool, TOOLS } from "@/lib/ai/tools";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import { HDL_EXAMPLES } from "@/lib/hdl/examples";

const call = (name: string, input: unknown, ctx = {}) => {
  const r = runTool(name, input, ctx);
  return { ...r, json: r.isError ? null : JSON.parse(r.content) };
};

describe("AI 助教工具：确定性计算", () => {
  it("每个工具都有严格的 schema 与流式输入设置", () => {
    for (const t of TOOLS) {
      expect(t.def.input_schema.type).toBe("object");
      expect((t.def.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
      expect(t.def.eager_input_streaming).toBe(true);
      expect(t.def.description!.length).toBeGreaterThan(20);
    }
  });
  it("simplify_expression：包含律", () => {
    const r = call("simplify_expression", { expr: "AB+A'C+BC" });
    expect(r.json.minimal_sop).toEqual(["A'C + AB"]);
    expect(r.json.minterms).toEqual([1, 3, 6, 7]);
  });
  it("simplify_expression：最小项 + 无关项（8421BCD ≥5）", () => {
    const r = call("simplify_expression", { vars: ["A", "B", "C", "D"], minterms: [5, 6, 7, 8, 9], dont_cares: [10, 11, 12, 13, 14, 15] });
    expect(r.json.cost).toEqual({ terms: 3, literals: 5 });
  });
  it("check_equivalence 给出反例", () => {
    expect(call("check_equivalence", { a: "A+A'B", b: "A+B" }).json.equivalent).toBe(true);
    const r = call("check_equivalence", { a: "A+B", b: "AB" });
    expect(r.json.equivalent).toBe(false);
    expect(r.json.counterexample).toMatch(/当 A=/);
  });
  it("analyze_sync_circuit：实验 A 的方程得到模 8 计数且能自启动", () => {
    const r = call("analyze_sync_circuit", {
      flip_flops: [
        { name: "Q2", type: "JK", drives: { J: "Q1Q0", K: "Q1Q0" } },
        { name: "Q1", type: "JK", drives: { J: "Q0", K: "Q0" } },
        { name: "Q0", type: "JK", drives: { J: "1", K: "1" } },
      ],
    });
    expect(r.json.sequence_from_initial).toEqual(["000", "001", "010", "011", "100", "101", "110", "111", "000"]);
    expect(r.json.self_start.self_starting).toBe(true);
  });
  it("simulate_74ls161_counter：清零法 N=10 的瞬态为 10", () => {
    const r = call("simulate_74ls161_counter", { N: 10, method: "clear" });
    expect(r.json.measured_modulus).toBe(10);
    expect(r.json.transient_states).toEqual([10]);
  });
  it("design_sequence_detector：101 Mealy 通过逐状态验证", () => {
    const r = call("design_sequence_detector", { sequence: "101", kind: "mealy", overlap: true, ff_type: "JK" });
    expect(r.json.verified_against_state_table).toBe(true);
  });
  it("run_verilog：运行示例并返回每拍输出；编译错误如实返回", () => {
    const ex = HDL_EXAMPLES.find((e) => e.id === "counter3")!;
    const r = call("run_verilog", { code: ex.code, init: ex.init, clock: "clk", steps: [{ rst_n: 0 }, { rst_n: 1 }, {}, {}] });
    expect(r.json.trace.map((t: { outputs: { q: string } }) => t.outputs.q)).toEqual(["000", "001", "010", "011"]);
    expect(call("run_verilog", { code: "module m(input a, output y); assign y = b; endmodule" }).json.compiled).toBe(false);
  });
  it("timer555：多谐振荡器占空比", () => {
    const r = call("timer555", { mode: "astable", Vcc: 5, R1: 10e3, R2: 20e3, C: 10e-6 });
    expect(r.json.duty).toBeCloseTo(0.6, 10);
  });
  it("analyze_current_circuit：读取页面网表", () => {
    const r = call("analyze_current_circuit", { cycles: 3 }, { netlist: buildJKCounter(DEFAULT_JK_CONFIG) });
    expect(r.json.self_starting).toBe(true);
    expect(r.json.simulation.length).toBe(4);
    expect(call("analyze_current_circuit", {}).json.available).toBe(false);
  });
  it("非法输入：返回错误而不是抛出", () => {
    expect(runTool("simplify_expression", { expr: "A+" }, {}).isError).toBe(true);
    expect(runTool("simulate_74ls161_counter", { N: 99, method: "clear" }, {}).isError).toBe(true);
    expect(runTool("design_sequence_detector", { sequence: "12", kind: "mealy" }, {}).isError).toBe(true);
    expect(runTool("nope", {}, {}).isError).toBe(true);
    expect(runTool("truth_table", "not-an-object", {}).content).toContain("INVALID_JSON");
  });
});

// ───────────────────── 路由：模拟 SDK，验证工具调用循环 ─────────────────────

const scripted: { content: unknown[]; stop_reason: string; text?: string }[] = [];
const seenRequests: { messages: unknown[]; fallbacks?: unknown; betas?: unknown; model: string }[] = [];

vi.mock("next/server", () => ({ connection: async () => {} }));

vi.mock("@anthropic-ai/sdk", async (orig) => {
  const actual = (await orig()) as { default: Record<string, unknown> };
  class Fake {
    beta = {
      messages: {
        stream: (req: { messages: unknown[]; fallbacks?: unknown; betas?: unknown; model: string }) => {
          seenRequests.push(JSON.parse(JSON.stringify(req)));
          const next = scripted.shift()!;
          const handlers: ((d: string) => void)[] = [];
          return {
            on: (_: string, cb: (d: string) => void) => handlers.push(cb),
            finalMessage: async () => {
              if (next.text) handlers.forEach((h) => h(next.text!));
              return { content: next.content, stop_reason: next.stop_reason };
            },
          };
        },
      },
    };
  }
  Object.assign(Fake, { APIError: actual.default.APIError, AuthenticationError: actual.default.AuthenticationError, RateLimitError: actual.default.RateLimitError });
  return { default: Fake };
});

describe("AI 助教路由", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    seenRequests.length = 0;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  });
  it("未配置密钥：GET 报告未配置，POST 返回 503", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const { GET, POST } = await import("@/app/api/assistant/route");
    expect(await (await GET()).json()).toEqual({ configured: false, model: null });
    const r = await POST(new Request("http://x/api/assistant", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
    expect(r.status).toBe(503);
  });
  it("工具调用循环：模型请求化简 → 服务端执行求解器 → 把结果交回模型 → 流式输出答案", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    scripted.push(
      { content: [{ type: "tool_use", id: "t1", name: "simplify_expression", input: { expr: "AB+A'C+BC" } }], stop_reason: "tool_use", text: "我先用求解器算一下。" },
      { content: [{ type: "text", text: "最简式为 $Y = AB + \\overline{A}C$。" }], stop_reason: "end_turn", text: "最简式为 $Y = AB + \\overline{A}C$。" },
    );
    const { POST } = await import("@/app/api/assistant/route");
    const res = await POST(new Request("http://x/api/assistant", { method: "POST", headers: { "x-forwarded-for": "t1" }, body: JSON.stringify({ messages: [{ role: "user", content: "化简 AB+A'C+BC" }], context: { page: "/learn/theorems" } }) }));
    expect(res.headers.get("content-type")).toContain("ndjson");
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.find((e) => e.type === "tool")).toMatchObject({ name: "simplify_expression", ok: true });
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toContain("AB + \\overline{A}C");
    expect(events[events.length - 1].type).toBe("done");
    // 第二次请求带着工具结果
    expect(seenRequests.length).toBe(2);
    const last = seenRequests[1].messages[seenRequests[1].messages.length - 1] as { content: { type: string; content: string }[] };
    expect(last.content[0].type).toBe("tool_result");
    expect(JSON.parse(last.content[0].content).minimal_sop).toEqual(["A'C + AB"]);
    // 默认模型与服务端回退
    expect(seenRequests[0].model).toBe("claude-opus-5-5");
    expect(seenRequests[0].fallbacks).toBe("default");
    // 页面上下文放在最后一条用户消息里
    expect(JSON.stringify(seenRequests[0].messages)).toContain("/learn/theorems");
  });
  it("模型拒答时不执行工具并提示", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    scripted.push({ content: [], stop_reason: "refusal" });
    const { POST } = await import("@/app/api/assistant/route");
    const res = await POST(new Request("http://x/api/assistant", { method: "POST", headers: { "x-forwarded-for": "t2" }, body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }) }));
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.some((e) => e.type === "notice")).toBe(true);
    expect(events.some((e) => e.type === "tool")).toBe(false);
  });
  it("请求校验：空消息与过长消息被拒绝", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { POST } = await import("@/app/api/assistant/route");
    const bad = await POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "t3" }, body: JSON.stringify({ messages: [] }) }));
    expect(bad.status).toBe(400);
    const long = await POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "t3" }, body: JSON.stringify({ messages: [{ role: "user", content: "x".repeat(7000) }] }) }));
    expect(long.status).toBe(400);
  });
});
