"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { HdlSim, fmtVal, type HdlTracePoint } from "@/lib/hdl/interp";
import { HdlError } from "@/lib/hdl/ast";
import { HDL_EXAMPLES, findHdlExample } from "@/lib/hdl/examples";
import { Waveform, type Channel } from "@/components/waveform/Waveform";
import { useAssistantContext } from "@/lib/ai/context";

export const SUBSET_NOTE =
  "教学用 Verilog 子集解释器，不是完整的 HDL 仿真器：支持 module/端口/wire/reg/parameter、assign、always @(*) 与 @(posedge/negedge …)、if/case、阻塞与非阻塞赋值、模块例化与 #(.P(v)) 参数覆盖、≤32 位、逐位 0/1/x；不支持 initial、# 延迟、$ 系统任务、function/task、generate、signed、z/三态。按时钟周期推进、零延迟；不同 always 块中的阻塞赋值按源代码顺序执行，组合过程在 0 时刻即求值一次。";

const KW_RE = /\b(module|endmodule|input|output|wire|reg|logic|assign|always|begin|end|if|else|case|endcase|default|posedge|negedge|or|parameter|localparam)\b/g;

function highlight(code: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return code
    .split("\n")
    .map((line) => {
      const ci = line.indexOf("//");
      const body = ci >= 0 ? line.slice(0, ci) : line;
      const comment = ci >= 0 ? line.slice(ci) : "";
      const h = esc(body)
        .replace(/(\d*'[bodh][0-9a-fA-FxXzZ_]+|\b\d+\b)/g, '<span class="hl-num">$1</span>')
        .replace(KW_RE, '<span class="hl-kw">$1</span>');
      return h + (comment ? `<span class="hl-cm">${esc(comment)}</span>` : "");
    })
    .join("\n");
}

function Editor({ value, onChange, errorLine, onRun }: { value: string; onChange: (v: string) => void; errorLine?: number; onRun: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  return (
    <div className="relative card-inset overflow-hidden font-mono text-[12.5px] leading-[1.55] [&_pre]:!text-[12.5px] [&_pre]:!leading-[1.55] [&_pre]:!font-mono" style={{ height: 380 }}>
      <div ref={gutter} className="absolute left-0 top-0 bottom-0 w-10 overflow-hidden text-right pr-2 pt-3 text-muted select-none border-r border-line bg-[var(--bg-2)]">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? "text-danger font-bold" : ""}>
            {i + 1}
          </div>
        ))}
      </div>
      <pre ref={pre} aria-hidden className="code-overlay absolute inset-0 left-10 m-0 p-3 overflow-hidden whitespace-pre text-ink pointer-events-none" dangerouslySetInnerHTML={{ __html: highlight(value) + "\n" }} />
      <textarea
        value={value}
        spellCheck={false}
        aria-label="Verilog 代码"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (pre.current) {
            pre.current.scrollTop = e.currentTarget.scrollTop;
            pre.current.scrollLeft = e.currentTarget.scrollLeft;
          }
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget;
            const s = t.selectionStart;
            onChange(value.slice(0, s) + "  " + value.slice(t.selectionEnd));
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
        className="absolute inset-0 left-10 w-[calc(100%-2.5rem)] h-full p-3 bg-transparent text-transparent caret-[var(--accent)] resize-none outline-none whitespace-pre overflow-auto thin-scroll"
        style={{ WebkitTextFillColor: "transparent" }}
      />
    </div>
  );
}

/** 编译源代码：先解析一次得到端口，再按端口给出 0 时刻初值（时钟为 0，低电平有效的复位类输入为 1） */
function compileSource(src: string, e?: ReturnType<typeof findHdlExample>): { sim: HdlSim | null; err: { msg: string; line?: number } | null; clockName?: string } {
  try {
    const probe = new HdlSim(src);
    const ins = probe.signals().filter((s) => s.top === "input");
    const clk = e?.clock ?? ins.find((s) => /^(clk|clock|cp)$/i.test(s.name))?.name;
    const init: Record<string, number> = {};
    for (const s of ins) init[s.name] = e?.init[s.name] ?? (/_n$|^rst_?n$/i.test(s.name) ? 1 : 0);
    return { sim: new HdlSim(src, { init }), err: null, clockName: clk };
  } catch (x) {
    return { sim: null, err: { msg: (x as Error).message, line: x instanceof HdlError ? x.pos?.line : undefined } };
  }
}

function toChannel(name: string, w: number, tr: HdlTracePoint[], clock: boolean): Channel {
  if (w === 1) return { kind: "bit", name, points: tr.map((p) => ({ t: p.t, d: p.d, v: (p.x & 1 ? 2 : p.v & 1) as 0 | 1 | 2 })), clock };
  return { kind: "bus", name, points: tr.map((p) => ({ t: p.t, d: p.d, v: p.x ? null : p.v })), radix: w > 4 ? 16 : 2, width: w };
}

export function VerilogLab({ example = "counter3", initialCode, height }: { example?: string; initialCode?: string; height?: number }) {
  const ex0 = findHdlExample(example) ?? HDL_EXAMPLES[0];
  const [exId, setExId] = useState(initialCode ? "" : ex0.id);
  const [code, setCode] = useState(initialCode ?? ex0.code);
  const [state, setState] = useState(() => compileSource(initialCode ?? ex0.code, initialCode ? undefined : ex0));
  const { sim, err: compileErr, clockName } = state;
  const [runErr, setRunErr] = useState<{ msg: string; line?: number } | null>(null);
  const err = compileErr ?? runErr;
  const [, setVersion] = useState(0);
  const [showInternal, setShowInternal] = useState(false);
  const [scriptPos, setScriptPos] = useState(0);
  const scriptRef = useRef(0);
  const bump = () => setVersion((v) => v + 1);
  const ex = exId ? findHdlExample(exId) : undefined;
  useAssistantContext({ notes: `Verilog 实验台中的代码：\n${code.slice(0, 1400)}${err ? `\n当前错误：${err.msg}` : ""}` }, [code, err?.msg]);
  const compile = useCallback((src: string, e?: ReturnType<typeof findHdlExample>) => {
    setState(compileSource(src, e));
    setRunErr(null);
    setScriptPos(0);
    scriptRef.current = 0;
  }, []);

  const guard = (f: () => void) => {
    try {
      f();
    } catch (x) {
      setRunErr({ msg: (x as Error).message, line: x instanceof HdlError ? x.pos?.line : undefined });
    }
    bump();
  };
  const inputs = sim?.signals().filter((s) => s.top === "input" && s.name !== clockName) ?? [];
  const advance = () => {
    if (sim && !clockName) sim.advance(sim.time + 50);
  };
  const runScript = () =>
    guard(() => {
      if (!sim || !ex?.script) return;
      const step = ex.script[scriptRef.current];
      if (!step) return;
      if (Object.keys(step).length) sim.set(step);
      if (clockName) sim.clock(clockName);
      scriptRef.current += 1;
      setScriptPos(scriptRef.current);
    });

  const channels: Channel[] = useMemo(() => {
    if (!sim) return [];
    const sigs = sim.signals().filter((s) => showInternal || Boolean(s.top));
    const order = (s: { top?: string; name: string }) => (s.name === clockName ? 0 : s.top === "input" ? 1 : s.top === "output" ? 2 : 3);
    return sigs
      .filter((s) => (ex?.watch ? ex.watch.includes(s.name) || s.name === clockName : true))
      .sort((a, b) => order(a) - order(b))
      .map((s) => toChannel(s.name, s.w, sim.trace(s.name), s.name === clockName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, sim?.time, sim?.cycles, showInternal, clockName, ex]);

  return (
    <div className="widget space-y-3" style={height ? { minHeight: height } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="select !h-8 text-sm"
          value={exId}
          onChange={(e) => {
            const n = findHdlExample(e.target.value);
            if (!n) return;
            setExId(n.id);
            setCode(n.code);
            compile(n.code, n);
          }}
          aria-label="选择示例"
        >
          {!exId && <option value="">（自定义代码）</option>}
          {(["组合逻辑", "时序逻辑", "状态机", "常见错误"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {HDL_EXAMPLES.filter((x) => x.group === g).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => compile(code, ex)} title="Ctrl/⌘ + Enter">
          编译并重置 ▶
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
            a.download = `${sim?.top ?? "design"}.v`;
            a.click();
          }}
        >
          下载 .v
        </button>
        <span className="chip chip-amber ml-auto" title={SUBSET_NOTE}>
          教学用 Verilog 子集解释器
        </span>
      </div>
      {ex && <p className="text-sm text-ink-2 leading-relaxed">{ex.desc}</p>}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Editor
          value={code}
          onChange={(v) => {
            setCode(v);
            if (exId && v !== findHdlExample(exId)?.code) setExId("");
          }}
          errorLine={err?.line}
          onRun={() => compile(code, ex)}
        />
        <div className="space-y-3 min-w-0">
          {err ? (
            <div className="card-inset p-3 text-sm text-danger" role="alert">
              <div className="eyebrow mb-1 !text-danger">编译 / 运行错误</div>
              {err.msg}
            </div>
          ) : sim ? (
            <div className="card-inset p-3 space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">顶层 {sim.top}</span>
                {clockName ? (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => guard(() => sim.clock(clockName))}>
                      单步 {clockName}
                    </button>
                    <button className="btn btn-sm" onClick={() => guard(() => Array.from({ length: 8 }, () => sim.clock(clockName)))}>
                      运行 8 拍
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted">组合逻辑：改变输入即可观察输出</span>
                )}
                {ex?.script && (
                  <button className="btn btn-sm" onClick={runScript} disabled={scriptPos >= ex.script.length}>
                    按示例激励走一拍（{scriptPos}/{ex.script.length}）
                  </button>
                )}
                <span className="mono text-xs text-muted ml-auto">{clockName ? `已走 ${sim.cycles} 拍` : ""}</span>
              </div>
              {inputs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inputs.map((s) => {
                    const v = sim.value(s.name);
                    return s.w === 1 ? (
                      <button
                        key={s.name}
                        className={`btn btn-sm mono ${v.v & 1 ? "!border-accent !text-accent" : ""}`}
                        onClick={() =>
                          guard(() => {
                            advance();
                            sim.set({ [s.name]: v.x ? 0 : (v.v ^ 1) & 1 });
                          })
                        }
                      >
                        {s.name} = {fmtVal(v)}
                      </button>
                    ) : (
                      <label key={s.name} className="flex items-center gap-1 text-xs mono">
                        {s.name}[{s.w - 1}:0]
                        <input
                          className="input !h-7 w-20 mono"
                          type="number"
                          min={0}
                          max={2 ** s.w - 1}
                          value={v.x ? "" : v.v}
                          onChange={(e) =>
                            guard(() => {
                              advance();
                              sim.set({ [s.name]: Math.max(0, Math.min(2 ** s.w - 1, Number(e.target.value) || 0)) });
                            })
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {sim
                  .signals()
                  .filter((s) => s.top === "output")
                  .map((s) => (
                    <span key={s.name} className="mono text-xs">
                      <span className="text-muted">{s.name}</span> = <span className="text-amber font-bold">{fmtVal(sim.value(s.name))}</span>
                      {s.w > 1 && !sim.value(s.name).x && <span className="text-muted">（{sim.value(s.name).v}）</span>}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}
          {sim && sim.issues.length > 0 && (
            <ul className="space-y-1.5 text-xs" aria-label="Verilog 检查结果">
              {sim.issues.slice(0, 6).map((i, k) => (
                <li key={k} className={`rounded-lg px-2.5 py-1.5 border ${i.level === "error" ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-danger" : i.level === "warning" ? "border-[color-mix(in_srgb,var(--amber)_40%,transparent)] text-amber" : "border-line text-ink-2"}`}>
                  <span className="mono mr-2">{i.level === "error" ? "ERR" : i.level === "warning" ? "WARN" : "NOTE"}</span>
                  {i.pos && <span className="mono text-muted mr-1">L{i.pos.line}</span>}
                  <span className="text-ink-2">{i.message}</span>
                </li>
              ))}
            </ul>
          )}
          {sim && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} className="accent-[var(--accent)]" />
              波形中显示内部信号（含子模块，形如 u1.q）
            </label>
          )}
        </div>
      </div>
      {sim && channels.length > 0 && <Waveform channels={channels} t1={Math.max(sim.time, clockName ? 400 : 200)} title="解释器运行波形（零延迟，按步推进）" />}
      <p className="text-[11px] text-muted leading-relaxed">{SUBSET_NOTE}</p>
    </div>
  );
}
