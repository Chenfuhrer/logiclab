"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import { buildCounterNetlist, type CounterMethod } from "@/lib/counters/ls161";
import { minimizeStates, sequenceDetector, synthesize } from "@/lib/fsm/design";
import { circuitToNetlist } from "@/lib/fsm/netlistgen";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { netlistToVerilog, selfCheckingTestbench, stateTableToVerilog, syncCircuitToVerilog } from "@/lib/hdl/codegen";
import { HdlSim } from "@/lib/hdl/interp";
import { Simulator } from "@/lib/sim/engine";
import type { L, Netlist } from "@/lib/sim/types";
import type { FFType } from "@/lib/sim/models";

export const DRAFT_KEY = "logiclab-verilog-draft";

type Source = "jk" | "ls161" | "fsm";

interface Row {
  cycle: number;
  inputs: Record<string, number>;
  circuit: (L | undefined)[];
  hdl: (L | undefined)[];
  ok: boolean;
}

/** 电路 → Verilog 对照：同一个电路分别交给电路仿真引擎和 Verilog 解释器运行，逐拍比较 */
export function HdlCompare() {
  const router = useRouter();
  const [src, setSrc] = useState<Source>("jk");
  const [N, setN] = useState(10);
  const [method, setMethod] = useState<CounterMethod>("clear");
  const [seq, setSeq] = useState("101");
  const [kind, setKind] = useState<"mealy" | "moore">("mealy");
  const [ff, setFf] = useState<FFType>("JK");
  const [xs, setXs] = useState("10110101100101");
  const [view, setView] = useState<"struct" | "eq" | "beh">("struct");

  const built = useMemo(() => {
    try {
      let nl: Netlist;
      let eq: string | null = null;
      let beh: string | null = null;
      let fsmInputs: number[] | null = null;
      if (src === "jk") {
        nl = buildJKCounter(DEFAULT_JK_CONFIG);
        const r = extractSyncCircuit(nl);
        if (r.ok) eq = syncCircuitToVerilog(r.circuit, { name: "counter_jk_eq", init: r.initial, comment: "实验 A：同步三位二进制加法计数器（方程级）" });
      } else if (src === "ls161") {
        nl = buildCounterNetlist({ N, method, chips: 1 });
      } else {
        const spec = minimizeStates(sequenceDetector(seq, kind, true)).reduced;
        const syn = synthesize(spec, { ffType: ff });
        nl = circuitToNetlist(syn.circuit, { init: syn.codes[spec.initial ?? 0], name: `detector_${seq}` });
        eq = syncCircuitToVerilog(syn.circuit, { name: `det${seq}_eq`, init: syn.codes[spec.initial ?? 0] });
        beh = stateTableToVerilog(spec, syn.codes, { name: `det${seq}_fsm` });
        fsmInputs = xs.replace(/[^01]/g, "").split("").map(Number).slice(0, 40);
      }
      const gen = netlistToVerilog(nl, { name: src === "jk" ? "counter_jk" : src === "ls161" ? `mod${N}_counter` : `det${seq}` });
      // 逐拍比较
      const sim = new Simulator(nl);
      const clk = gen.inputs.find((i) => i.clock)!;
      const init = Object.fromEntries(gen.inputs.map((i) => [i.port, i.clock ? 0 : Number((sim.compState(i.comp).value as number) ?? 0)]));
      const hdl = new HdlSim(gen.code, { top: gen.top, init });
      const read = (): Pick<Row, "circuit" | "hdl"> => ({
        circuit: gen.outputs.map((o) => sim.pinValue(o.comp, "A")),
        hdl: gen.outputs.map((o) => {
          const v = hdl.value(o.port);
          return (v.x & 1 ? 2 : v.v & 1) as L;
        }),
      });
      const rows: Row[] = [];
      const cycles = fsmInputs ? fsmInputs.length : src === "ls161" ? N + 4 : 10;
      const xin = gen.inputs.find((i) => !i.clock);
      for (let k = 0; k < cycles; k++) {
        const inputs: Record<string, number> = {};
        if (fsmInputs && xin) {
          inputs[xin.port] = fsmInputs[k];
          sim.setInput(xin.comp, fsmInputs[k] as L);
          hdl.set(inputs);
        }
        sim.stepClock(clk.comp);
        hdl.clock(clk.port);
        const r = read();
        rows.push({ cycle: k + 1, inputs, ...r, ok: r.circuit.every((v, i) => v === r.hdl[i]) });
      }
      const tb = selfCheckingTestbench({
        top: gen.top,
        inputs: gen.inputs.map((i) => ({ port: i.port })),
        outputs: gen.outputs.map((o) => ({ port: o.port })),
        clock: clk.port,
        init,
        rows: rows.map((r) => ({ inputs: r.inputs, expect: Object.fromEntries(gen.outputs.map((o, i) => [o.port, r.circuit[i] === 0 || r.circuit[i] === 1 ? (r.circuit[i] as number) : null])) })),
      });
      return { ok: true as const, gen, eq, beh, rows, tb, issues: hdl.issues };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [src, N, method, seq, kind, ff, xs]);

  if (!built.ok) return <p className="card p-4 text-danger text-sm">{built.error}</p>;
  const code = view === "eq" && built.eq ? built.eq : view === "beh" && built.beh ? built.beh : built.gen.code;
  const allOk = built.rows.every((r) => r.ok);
  const download = (text: string, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name;
    a.click();
  };
  const fmt = (v: L | undefined) => (v === 1 ? "1" : v === 0 ? "0" : v === 2 ? "X" : v === 3 ? "Z" : "–");

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <label className="text-xs text-muted space-y-1">
          <span className="block">电路来源</span>
          <select className="select" value={src} onChange={(e) => setSrc(e.target.value as Source)} aria-label="电路来源">
            <option value="jk">实验 A：JK 同步计数器</option>
            <option value="ls161">实验 B：74LS161 任意进制</option>
            <option value="fsm">实验 C：序列检测器设计结果</option>
          </select>
        </label>
        {src === "ls161" && (
          <>
            <label className="text-xs text-muted space-y-1">
              <span className="block">模数 N</span>
              <input className="input mono w-20" type="number" min={2} max={16} value={N} onChange={(e) => setN(Math.max(2, Math.min(16, Number(e.target.value) || 2)))} />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="block">方法</span>
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value as CounterMethod)}>
                <option value="clear">异步清零法</option>
                <option value="sync-load">同步置数法</option>
                <option value="carry-load">进位置数法</option>
              </select>
            </label>
          </>
        )}
        {src === "fsm" && (
          <>
            <label className="text-xs text-muted space-y-1">
              <span className="block">序列</span>
              <input className="input mono w-24" value={seq} onChange={(e) => setSeq(e.target.value.replace(/[^01]/g, "").slice(0, 6) || "101")} />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="block">类型</span>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as "mealy" | "moore")}>
                <option value="mealy">Mealy</option>
                <option value="moore">Moore</option>
              </select>
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="block">触发器</span>
              <select className="select" value={ff} onChange={(e) => setFf(e.target.value as FFType)}>
                <option value="D">D</option>
                <option value="JK">JK</option>
                <option value="T">T</option>
              </select>
            </label>
            <label className="text-xs text-muted space-y-1 flex-1 min-w-[160px]">
              <span className="block">输入序列 X</span>
              <input className="input mono w-full" value={xs} onChange={(e) => setXs(e.target.value)} />
            </label>
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="card p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap gap-1 items-center">
            <button className={`btn btn-sm ${view === "struct" ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setView("struct")}>
              结构化（由网表）
            </button>
            {built.eq && (
              <button className={`btn btn-sm ${view === "eq" ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setView("eq")}>
                方程级
              </button>
            )}
            {built.beh && (
              <button className={`btn btn-sm ${view === "beh" ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setView("beh")}>
                行为级三段式
              </button>
            )}
            <span className="ml-auto flex gap-1">
              <button className="btn btn-sm" onClick={() => download(code, `${built.gen.top}.v`)}>
                下载 .v
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, code);
                  router.push("/lab/verilog?draft=1");
                }}
              >
                在实验台中编辑
              </button>
            </span>
          </div>
          <pre className="card-inset p-3 text-[12px] leading-[1.55] overflow-auto thin-scroll max-h-[460px] mono">{code}</pre>
          {built.gen.unsupported.length > 0 && <p className="text-xs text-amber">未导出：{built.gen.unsupported.join("；")}</p>}
        </section>

        <section className="card p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">逐拍对照（结构化 Verilog）</div>
            <span className={`chip ${allOk ? "chip-accent" : "chip-danger"}`}>{allOk ? `全部 ${built.rows.length} 拍一致` : "存在不一致"}</span>
          </div>
          <div className="overflow-auto thin-scroll max-h-[420px]">
            <table className="ltable w-full">
              <thead>
                <tr>
                  <th>拍</th>
                  {Object.keys(built.rows[0]?.inputs ?? {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                  <th className="sep">电路仿真 {built.gen.outputs.map((o) => o.port).join(" ")}</th>
                  <th className="sep">Verilog 解释器</th>
                  <th className="sep" />
                </tr>
              </thead>
              <tbody>
                {built.rows.map((r) => (
                  <tr key={r.cycle}>
                    <td>{r.cycle}</td>
                    {Object.values(r.inputs).map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                    <td className="sep">{r.circuit.map(fmt).join(" ")}</td>
                    <td className="sep">{r.hdl.map(fmt).join(" ")}</td>
                    <td className={`sep ${r.ok ? "text-accent" : "text-danger"}`}>{r.ok ? "✓" : "✕"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            左列由本平台的事件驱动电路仿真引擎计算，右列由 Verilog 子集解释器运行生成的代码得到，两者是独立实现。每拍取时钟周期结束时的稳定值。
          </p>
          <div className="card-inset p-3 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">自检 Testbench</span>
              <button className="btn btn-sm ml-auto" onClick={() => download(built.tb, `tb_${built.gen.top}.v`)}>
                下载 tb_{built.gen.top}.v
              </button>
            </div>
            <p className="text-muted leading-relaxed">
              以电路仿真结果为期望值生成的 Testbench，可在 iverilog / ModelSim 等真实仿真器中运行（例如 <span className="mono">iverilog -o tb {built.gen.top}.v tb_{built.gen.top}.v && vvp tb</span>）。本平台的子集解释器不执行 initial、# 延迟与 $display，<strong className="text-amber">未运行过这个文件</strong>。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
