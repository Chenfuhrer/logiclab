import Anthropic from "@anthropic-ai/sdk";
import { connection } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { TOOLS, TOOL_BY_NAME, runTool, type ToolContext } from "@/lib/ai/tools";
import type { Netlist } from "@/lib/sim/types";

/**
 * AI 助教接口（服务端）。API 密钥只在服务端读取（ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN），不会发送到浏览器。
 * 未配置时返回 503，网站其余功能不受影响。
 * 输出：NDJSON 流，每行一个事件 {type: "text"|"tool"|"done"|"error"|"notice", ...}。
 */

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 6;
const MAX_MESSAGES = 30;
const MAX_CHARS = 6000;

// 简单的进程内限流：每个 IP 每 10 分钟最多 30 次请求（部署到多实例时应换成共享存储）
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 30;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function GET() {
  // 运行时读取环境变量（不要在构建时预渲染成固定结果）
  await connection();
  return Response.json({ configured: isConfigured(), model: isConfigured() ? MODEL : null });
}

interface Body {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: { page?: string; title?: string; lesson?: string; exercise?: string; answer?: string; notes?: string; netlist?: Netlist };
}

function validate(b: unknown): Body | string {
  if (typeof b !== "object" || b === null) return "请求格式错误";
  const m = (b as Body).messages;
  if (!Array.isArray(m) || m.length === 0 || m.length > MAX_MESSAGES) return `messages 应为 1～${MAX_MESSAGES} 条`;
  for (const x of m) {
    if ((x.role !== "user" && x.role !== "assistant") || typeof x.content !== "string" || x.content.length > MAX_CHARS) return "消息格式错误或过长";
  }
  if (m[0].role !== "user" || m[m.length - 1].role !== "user") return "对话应以学生的消息开始和结束";
  return b as Body;
}

function contextText(c: Body["context"]): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.page) parts.push(`学生当前所在页面：${c.page}${c.title ? `（${c.title}）` : ""}`);
  if (c.lesson) parts.push(`当前课时：${c.lesson}`);
  if (c.exercise) parts.push(`学生正在做的题目：\n${c.exercise.slice(0, 2000)}`);
  if (c.answer) parts.push(`学生的作答：${c.answer.slice(0, 1000)}`);
  if (c.notes) parts.push(`页面状态：${c.notes.slice(0, 1500)}`);
  if (c.netlist) parts.push(`页面上有一个电路（${c.netlist.name}，${c.netlist.components.length} 个元件），可用 analyze_current_circuit 工具读取。`);
  return parts.length ? `<页面上下文>\n${parts.join("\n")}\n</页面上下文>` : "";
}

export async function POST(req: Request) {
  if (!isConfigured()) {
    return Response.json({ error: "AI 助教未配置：服务端没有设置 ANTHROPIC_API_KEY。网站其他功能不受影响。" }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) return Response.json({ error: "请求太频繁，请稍后再试。" }, { status: 429 });
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const body = validate(parsed);
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });
  const ctx: ToolContext = { netlist: body.context?.netlist };

  const client = new Anthropic();
  const ctxText = contextText(body.context);
  const messages: Anthropic.Beta.BetaMessageParam[] = body.messages.map((m, i) =>
    i === body.messages.length - 1 && ctxText ? { role: "user", content: [{ type: "text", text: ctxText }, { type: "text", text: m.content }] } : { role: m.role, content: m.content },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      let jsonRetries = 0;
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            cache_control: { type: "ephemeral" },
            system: SYSTEM_PROMPT,
            tools: TOOLS.map((t) => t.def),
            messages,
          });
          s.on("text", (delta) => send({ type: "text", delta }));
          let message: Anthropic.Beta.BetaMessage;
          try {
            message = await s.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            // 只对工具参数 JSON 无法解析的情况重试，API 错误直接抛出
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
            send({ type: "notice", text: "工具参数解析失败，正在重试……" });
            continue;
          }
          if (message.stop_reason === "refusal") {
            send({ type: "notice", text: "这个请求被模型拒绝了，请换一种问法。" });
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }
          const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (message.stop_reason !== "tool_use" || uses.length === 0) break;
          if (message.stop_reason === "tool_use" && turn === MAX_TURNS - 1) {
            send({ type: "notice", text: "工具调用轮次已达上限。" });
            break;
          }
          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
            const r = runTool(u.name, u.input, ctx);
            send({ type: "tool", name: u.name, label: TOOL_BY_NAME.get(u.name)?.label ?? u.name, ok: !r.isError, input: u.input });
            return { type: "tool_result", tool_use_id: u.id, content: r.content, is_error: r.isError };
          });
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "服务端的 API 密钥无效。"
            : err instanceof Anthropic.RateLimitError
              ? "AI 服务繁忙（限流），请稍后再试。"
              : err instanceof Anthropic.APIError
                ? `AI 服务出错（${err.status ?? "网络"}）。`
                : "AI 助教出错了。";
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
