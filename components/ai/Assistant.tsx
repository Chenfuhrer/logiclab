"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAssistant } from "@/lib/ai/context";
import { RichText } from "@/components/ui/RichText";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools?: { label: string; ok: boolean }[];
  notice?: string;
  error?: boolean;
}

const SUGGEST: Record<string, string[]> = {
  "/lab/jk-counter": ["当前电路能自启动吗？为什么？", "把 K0 改接 Q2 后会变成几进制？"],
  "/lab/ls161": ["异步清零法为什么要译码状态 N 而不是 N−1？", "用两片 74LS161 做 24 进制怎么接？"],
  "/lab/fsm-designer": ["为什么这两个状态不能合并？", "用 D 触发器和 JK 触发器实现，哪种更省门？"],
  "/lab/verilog": ["这段代码里阻塞和非阻塞赋值有什么区别？", "帮我检查这段 Verilog 会不会推断出锁存器"],
  default: ["化简 Y = AB + A'C + BC，并解释每一步依据", "JK 触发器和 D 触发器怎么互相转换？", "Moore 型和 Mealy 型的输出时刻有什么不同？"],
};

/** 静态部署（GitHub Pages）没有服务端，不提供 AI 助教 */
const STATIC_BUILD = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

/** 右下角的 AI 助教抽屉。未配置 API 密钥时显示说明，网站其他功能不受影响。 */
export function Assistant() {
  const path = usePathname();
  const { ctx, open, setOpen, draft, setDraft } = useAssistant();
  const [status, setStatus] = useState<"unknown" | "on" | "off">(STATIC_BUILD ? "off" : "unknown");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || status !== "unknown") return;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((j: { configured: boolean }) => setStatus(j.configured ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, [open, status]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setDraft("");
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "", tools: [] }]);
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    const update = (f: (m: Msg) => Msg) => setMsgs((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: history.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content })).slice(-20),
          context: { ...ctx, page: ctx.page ?? path },
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: `请求失败（${res.status}）` }));
        update((m) => ({ ...m, content: j.error ?? "请求失败", error: true }));
        if (res.status === 503) setStatus("off");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; delta?: string; label?: string; ok?: boolean; text?: string; message?: string };
          if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.delta }));
          else if (ev.type === "tool") update((m) => ({ ...m, tools: [...(m.tools ?? []), { label: ev.label!, ok: Boolean(ev.ok) }], content: m.content && !m.content.endsWith("\n") ? m.content + "\n\n" : m.content }));
          else if (ev.type === "notice") update((m) => ({ ...m, notice: ev.text }));
          else if (ev.type === "error") update((m) => ({ ...m, content: m.content || ev.message!, error: !m.content, notice: m.content ? ev.message : undefined }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") update((m) => ({ ...m, content: m.content || "网络错误，请重试。", error: !m.content }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const suggestions = SUGGEST[path] ?? SUGGEST.default;
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-40 bottom-5 right-5 h-12 pl-4 pr-5 rounded-full card !border-accent flex items-center gap-2 text-sm font-semibold text-accent shadow-lg hover:!bg-[var(--accent-soft)] transition-colors"
        aria-expanded={open}
        aria-controls="ai-drawer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 17 H8 V7 H12 V17 H16 V7 H20" />
        </svg>
        AI 助教
      </button>
      {open && (
        <aside id="ai-drawer" className="fixed z-50 bottom-20 right-3 sm:right-5 w-[calc(100vw-1.5rem)] sm:w-[420px] h-[min(640px,calc(100vh-7rem))] card flex flex-col overflow-hidden" role="dialog" aria-label="AI 助教">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <span className="font-semibold">AI 助教</span>
            <span className={`chip ${status === "on" ? "chip-accent" : status === "off" ? "" : ""}`}>{status === "on" ? "已连接" : status === "off" ? "未配置" : "…"}</span>
            {msgs.length > 0 && (
              <button className="btn btn-sm btn-ghost ml-auto" onClick={() => setMsgs([])} disabled={busy}>
                清空
              </button>
            )}
            <button className={`btn btn-sm btn-ghost ${msgs.length ? "" : "ml-auto"}`} onClick={() => setOpen(false)} aria-label="关闭">
              ✕
            </button>
          </header>
          <div ref={scroller} className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4 text-sm">
            {status === "off" && (
              <div className="card-inset p-3 text-xs leading-relaxed text-ink-2 space-y-1.5">
                <p className="text-ink font-semibold">AI 助教尚未启用</p>
                {STATIC_BUILD ? (
                  <p>
                    这是部署在 GitHub Pages 上的静态版本，没有服务端，因此不提供 AI 助教。在本地运行（npm run dev）或部署到支持服务端的平台，并在服务端设置 ANTHROPIC_API_KEY 后即可使用。课程、实验、练习等其他功能都在浏览器中运行，不受影响。
                  </p>
                ) : (
                  <p>需要在部署网站的服务器上设置环境变量 ANTHROPIC_API_KEY（密钥只保存在服务端，不会发到浏览器）。课程、实验、练习等其他功能都不依赖它。</p>
                )}
              </div>
            )}
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-ink-2 leading-relaxed">
                  可以问概念、让我检查你的推导，或者分析当前页面上的电路。涉及化简、状态表、计数器模数、Verilog 运行结果时，我会调用平台的求解器和仿真引擎来算，而不是凭印象回答。
                </p>
                {(ctx.exercise || ctx.netlist || ctx.lesson) && (
                  <p className="text-xs text-muted">
                    已带上页面上下文：{[ctx.lesson && "当前课时", ctx.exercise && "当前题目", ctx.netlist && "当前电路"].filter(Boolean).join("、")}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} className="text-left text-xs px-3 py-2 rounded-lg border border-line hover:border-accent" onClick={() => send(s)} disabled={status === "off"}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 bg-[var(--accent-soft)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div className="space-y-2">
                    {m.tools && m.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.tools.map((t, k) => (
                          <span key={k} className={`chip ${t.ok ? "chip-accent" : "chip-danger"}`}>
                            {t.ok ? "⚙" : "✕"} {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={`leading-relaxed ${m.error ? "text-danger" : ""}`}>
                      {m.content ? <RichText text={m.content} /> : busy && i === msgs.length - 1 ? <span className="text-muted">思考中…</span> : null}
                    </div>
                    {m.notice && <p className="text-xs text-amber">{m.notice}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form
            className="border-t border-line p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={2}
              placeholder={status === "off" ? "AI 助教未配置" : "输入问题，Enter 发送，Shift+Enter 换行"}
              className="input !h-auto flex-1 py-2 resize-none"
              disabled={status === "off"}
              aria-label="向 AI 助教提问"
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                停止
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!draft.trim() || status === "off"}>
                发送
              </button>
            )}
          </form>
          <p className="px-3 pb-2 text-[10px] text-muted">回答由 Claude 生成，可能出错；具体计算以页面上的求解器与仿真为准。提问时会把当前页面的题目/电路发送到本站服务端。</p>
        </aside>
      )}
    </>
  );
}
