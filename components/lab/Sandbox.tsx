"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentInstance, Netlist } from "@/lib/sim/types";
import { MODELS, type Category } from "@/lib/sim/models";
import { Schematic } from "@/components/circuit/Schematic";
import { geometry } from "@/components/circuit/geometry";
import { useSimulation } from "@/hooks/useSimulation";
import { Waveform, type Channel } from "@/components/waveform/Waveform";
import { IssueList } from "./IssueList";
import { extractSyncCircuit } from "@/lib/fsm/extract";
import { analyzeSync } from "@/lib/fsm/analyze";
import { EquationsPanel, StateTablePanel } from "@/components/fsm/AnalysisPanels";
import { buildJKCounter, DEFAULT_JK_CONFIG } from "@/content/experiments/jk-counter";
import { buildCounterNetlist } from "@/lib/counters/ls161";

const PALETTE: { cat: Category; label: string; types: string[] }[] = [
  { cat: "io", label: "输入/输出", types: ["switch", "button", "clock", "const0", "const1", "led", "probe", "hexdisplay", "pullup"] },
  { cat: "gate", label: "逻辑门", types: ["and", "or", "not", "nand", "nor", "xor", "xnor", "buf", "tribuf"] },
  { cat: "latch", label: "锁存器", types: ["sr_latch", "d_latch"] },
  { cat: "ff", label: "触发器", types: ["dff", "jkff", "tff", "srff", "jkff_ms"] },
  { cat: "msi", label: "中规模", types: ["ls138", "ls151", "ls161", "ls163", "ls194"] },
];
const STORE_KEY = "logiclab-sandbox";
const EMPTY: Netlist = { version: 1, name: "我的电路", components: [], nets: [] };

const snap = (v: number) => Math.round(v / 10) * 10;

export function Sandbox() {
  const [nl, setNl] = useState<Netlist>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [pending, setPending] = useState<{ comp: string; pin: string } | null>(null);
  const [vb, setVb] = useState<[number, number, number, number]>([-40, -40, 900, 520]);
  const [model, setModel] = useState<"ideal" | "delay">("ideal");
  const [resetN, setResetN] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "comp" | "pan"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    // 挂载后从 localStorage 读取存档（外部存储同步，服务端渲染时不可用）
    let saved: Netlist | null = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) saved = JSON.parse(raw) as Netlist;
    } catch {
      /* 忽略损坏的存档 */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setNl(saved);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORE_KEY, JSON.stringify(nl));
  }, [nl, loaded]);
  // 拖动结束后才重建仿真（拖动时只改位置）
  const topoKey = JSON.stringify({ c: nl.components.map((c) => [c.id, c.type, c.params]), n: nl.nets });
  const simNl = useMemo(() => nl, [topoKey, resetN]); // eslint-disable-line react-hooks/exhaustive-deps
  const sim = useSimulation(simNl.components.length ? simNl : null, { model });
  void sim.version;

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const add = (type: string) => {
    const n = nl.components.filter((c) => c.type === type).length;
    const prefix = { switch: "SW", clock: "CP", led: "LED", probe: "P", const0: "GND", const1: "VCC" }[type] ?? (MODELS[type].category === "ff" ? "FF" : MODELS[type].category === "msi" ? "U" : "G");
    let id = `${prefix}${n}`;
    let k = n;
    while (nl.components.some((c) => c.id === id)) id = `${prefix}${++k}`;
    const c: ComponentInstance = { id, type, label: id, x: snap(vb[0] + vb[2] / 2 - 40 + (n % 5) * 20), y: snap(vb[1] + vb[3] / 2 - 30 + (n % 5) * 20), params: { ...(MODELS[type].defaultParams ?? {}) } };
    if (type === "dff" || type === "jkff" || type === "tff" || type === "srff" || type === "jkff_ms") c.params!.init = 0;
    setNl({ ...nl, components: [...nl.components, c] });
    setSel(id);
  };

  const connect = (a: { comp: string; pin: string }, b: { comp: string; pin: string }) => {
    if (a.comp === b.comp && a.pin === b.pin) return;
    const has = (n: Netlist["nets"][number], p: { comp: string; pin: string }) => n.endpoints.some((e) => e.comp === p.comp && e.pin === p.pin);
    const na = nl.nets.find((n) => has(n, a));
    const nb = nl.nets.find((n) => has(n, b));
    let nets = nl.nets;
    if (na && nb) {
      if (na === nb) return;
      const merged = { ...na, name: na.name ?? nb.name, endpoints: [...na.endpoints, ...nb.endpoints] };
      nets = nets.filter((n) => n !== na && n !== nb).concat(merged);
    } else if (na) nets = nets.map((n) => (n === na ? { ...n, endpoints: [...n.endpoints, b] } : n));
    else if (nb) nets = nets.map((n) => (n === nb ? { ...n, endpoints: [...n.endpoints, a] } : n));
    else {
      let i = nets.length;
      while (nets.some((n) => n.id === `N${i}`)) i++;
      nets = [...nets, { id: `N${i}`, endpoints: [a, b] }];
    }
    setNl({ ...nl, nets });
  };

  const remove = (id: string) => {
    setNl({
      ...nl,
      components: nl.components.filter((c) => c.id !== id),
      nets: nl.nets.map((n) => ({ ...n, endpoints: n.endpoints.filter((e) => e.comp !== id) })).filter((n) => n.endpoints.length > 1),
    });
    setSel(null);
  };
  const disconnectPin = (comp: string, pin: string) =>
    setNl({ ...nl, nets: nl.nets.map((n) => ({ ...n, endpoints: n.endpoints.filter((e) => !(e.comp === comp && e.pin === pin)) })).filter((n) => n.endpoints.length > 1) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && sel && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) remove(sel);
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selComp = nl.components.find((c) => c.id === sel);
  const probes = nl.components.filter((c) => c.type === "probe" || c.type === "led" || c.type === "clock" || c.type === "switch");
  const pinNet = (comp: string, pin: string) => nl.nets.find((n) => n.endpoints.some((e) => e.comp === comp && e.pin === pin));
  const channels: Channel[] = sim.sim
    ? probes
        .map((p) => {
          const pin = p.type === "clock" ? "CLK" : p.type === "switch" ? "Y" : "A";
          const n = pinNet(p.id, pin);
          return n ? ({ kind: "bit", name: p.label ?? p.id, points: sim.sim!.trace(n.id), clock: p.type === "clock" } as Channel) : null;
        })
        .filter((x): x is Channel => x !== null)
    : [];
  const analysis = useMemo(() => {
    if (!simNl.components.length) return null;
    const r = extractSyncCircuit(simNl);
    if (!r.ok) return { reason: r.reason };
    try {
      return { a: analyzeSync(r.circuit, r.initial), unknownInit: r.initialUnknown };
    } catch (e) {
      return { reason: (e as Error).message };
    }
  }, [simNl]);
  const hasClock = nl.components.some((c) => c.type === "clock");

  return (
    <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_340px]">
      <aside className="card p-3 space-y-3 self-start xl:sticky xl:top-20">
        {PALETTE.map((g) => (
          <div key={g.cat}>
            <div className="eyebrow mb-1.5">{g.label}</div>
            <div className="flex flex-wrap gap-1">
              {g.types.map((t) => (
                <button key={t} className="btn btn-sm" onClick={() => add(t)} title={MODELS[t].description}>
                  {MODELS[t].title.replace(/（.*）/, "")}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="border-t border-line pt-3 space-y-1.5">
          <div className="eyebrow">示例与文件</div>
          <div className="flex flex-wrap gap-1">
            <button className="btn btn-sm" onClick={() => setNl(buildJKCounter(DEFAULT_JK_CONFIG))}>
              实验 A 电路
            </button>
            <button className="btn btn-sm" onClick={() => setNl(buildCounterNetlist({ N: 10, method: "clear", chips: 1 }))}>
              161 十进制
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(nl, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "logiclab-circuit.json";
                a.click();
              }}
            >
              导出 JSON
            </button>
            <label className="btn btn-sm">
              导入
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const v = JSON.parse(await f.text()) as Netlist;
                    if (v.version !== 1 || !Array.isArray(v.components) || !Array.isArray(v.nets)) throw new Error();
                    setNl(v);
                  } catch {
                    alert("不是有效的 LogicLab 网表文件");
                  }
                }}
              />
            </label>
            <button className="btn btn-sm text-danger" onClick={() => confirm("清空画布？") && setNl(EMPTY)}>
              清空
            </button>
          </div>
        </div>
      </aside>

      <section className="space-y-3 min-w-0">
        <div className="card p-2 flex flex-wrap gap-2 items-center">
          <button className="btn btn-sm btn-primary" disabled={!hasClock || sim.running} onClick={() => sim.step(1)}>
            单步 CP
          </button>
          {sim.running ? (
            <button className="btn btn-sm" onClick={sim.stop}>
              暂停
            </button>
          ) : (
            <button className="btn btn-sm" disabled={!hasClock} onClick={() => sim.run(500)}>
              运行
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setResetN((n) => n + 1)}>
            重置仿真
          </button>
          <select className="select !h-7 text-xs" value={model} onChange={(e) => setModel(e.target.value as "ideal" | "delay")} aria-label="仿真模型">
            <option value="ideal">模型 A/B 理想</option>
            <option value="delay">模型 C 传输延迟</option>
          </select>
          <span className="text-xs text-muted ml-auto">{pending ? `已选引脚 ${pending.comp}.${pending.pin}，点另一个引脚连线（Esc 取消）` : "拖动元件 · 点引脚连线 · 拖空白平移 · 滚轮缩放 · Delete 删除"}</span>
        </div>
        <div className="card-inset overflow-hidden h-[520px] touch-none">
          <Schematic
            netlist={nl}
            values={sim.sim?.valuesById()}
            svgRef={svgRef}
            viewBox={vb}
            selected={sel ? new Set([sel]) : undefined}
            pendingPin={pending}
            className="h-full"
            onToggle={(id) => sim.toggle(id)}
            onPinClick={(comp, pin) => {
              if (!pending) setPending({ comp, pin });
              else {
                connect(pending, { comp, pin });
                setPending(null);
              }
            }}
            onCompPointerDown={(e, id) => {
              e.stopPropagation();
              const p = toSvg(e);
              const c = nl.components.find((x) => x.id === id)!;
              drag.current = { kind: "comp", id, sx: p.x, sy: p.y, ox: c.x, oy: c.y, moved: false };
              setSel(id);
              (e.target as Element).setPointerCapture?.(e.pointerId);
            }}
            onSvgPointerDown={(e) => {
              const p = toSvg(e);
              drag.current = { kind: "pan", sx: p.x, sy: p.y, ox: vb[0], oy: vb[1], moved: false };
              setSel(null);
            }}
            onSvgPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const p = toSvg(e);
              if (d.kind === "comp") {
                const nx = snap(d.ox + p.x - d.sx);
                const ny = snap(d.oy + p.y - d.sy);
                d.moved = true;
                setNl((cur) => ({ ...cur, components: cur.components.map((c) => (c.id === d.id ? { ...c, x: nx, y: ny } : c)) }));
              } else {
                setVb(([x, y, w, h]) => [x - (p.x - d.sx), y - (p.y - d.sy), w, h]);
              }
            }}
            onSvgPointerUp={() => (drag.current = null)}
            onWheel={(e) => {
              const p = toSvg(e);
              const f = e.deltaY > 0 ? 1.1 : 0.9;
              setVb(([x, y, w, h]) => {
                const nw = Math.min(3000, Math.max(200, w * f));
                const nh = (h * nw) / w;
                return [p.x - ((p.x - x) * nw) / w, p.y - ((p.y - y) * nh) / h, nw, nh];
              });
            }}
          >
            {nl.components.length === 0 && (
              <text x={vb[0] + vb[2] / 2} y={vb[1] + vb[3] / 2} textAnchor="middle" fill="var(--muted)" fontSize={14}>
                从左侧元件库添加元件，或载入一个示例电路
              </text>
            )}
          </Schematic>
        </div>
        {sim.sim && <IssueList issues={sim.sim.issues} max={8} />}
        {channels.length > 0 && <Waveform channels={channels} t1={Math.max(sim.sim?.time ?? 0, 300)} title="波形（开关、时钟、探针、LED 所在网络）" />}
      </section>

      <aside className="space-y-3 min-w-0">
        <div className="card p-4 text-sm space-y-3">
          <div className="eyebrow">属性</div>
          {!selComp ? (
            <p className="text-muted text-xs">选中一个元件以编辑参数。</p>
          ) : (
            <ComponentProps
              comp={selComp}
              onChange={(c) => setNl({ ...nl, components: nl.components.map((x) => (x.id === c.id ? c : x)) })}
              onDelete={() => remove(selComp.id)}
              onDisconnect={(pin) => disconnectPin(selComp.id, pin)}
              connected={(pin) => Boolean(pinNet(selComp.id, pin))}
            />
          )}
        </div>
        <div className="card p-4 text-sm space-y-3">
          <div className="eyebrow">自动符号分析</div>
          {!analysis ? (
            <p className="text-xs text-muted">空电路。</p>
          ) : "reason" in analysis ? (
            <p className="text-xs text-amber leading-relaxed">{analysis.reason}</p>
          ) : (
            <>
              <p className="text-xs text-muted">主循环按触发器初态参数 {analysis.a!.initial.toString(2).padStart(analysis.a!.stateVars.length, "0")} 判定{analysis.unknownInit ? "（有触发器初态为 X，按 0 计）" : ""}；修改初态可改变用于判定的主循环。</p>
              <EquationsPanel a={analysis.a!} />
              <StateTablePanel a={analysis.a!} showDrives={false} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ComponentProps({ comp, onChange, onDelete, onDisconnect, connected }: { comp: ComponentInstance; onChange: (c: ComponentInstance) => void; onDelete: () => void; onDisconnect: (pin: string) => void; connected: (pin: string) => boolean }) {
  const m = MODELS[comp.type];
  const p = comp.params ?? {};
  const setP = (k: string, v: number | string | boolean) => onChange({ ...comp, params: { ...p, [k]: v } });
  const g = geometry(comp);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{m.title}</span>
        <button className="btn btn-sm ml-auto text-danger" onClick={onDelete}>
          删除
        </button>
      </div>
      <p className="text-xs text-muted leading-relaxed">{m.description.replace(/\\overline\{([^}]*)\}/g, "$1̄").replace(/[\\{}_]/g, "")}</p>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-12 text-muted">标签</span>
        <input className="input !h-7 flex-1 mono" value={comp.label ?? ""} onChange={(e) => onChange({ ...comp, label: e.target.value })} />
      </label>
      {"inputs" in (m.defaultParams ?? {}) && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted">输入端</span>
          <select className="select !h-7" value={Number(p.inputs ?? 2)} onChange={(e) => setP("inputs", Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {["and", "or", "nand", "nor"].includes(comp.type) && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={Boolean(p.oc)} onChange={(e) => setP("oc", e.target.checked)} className="accent-[var(--accent)]" />
          OC 输出（集电极开路，需上拉）
        </label>
      )}
      {"edge" in (m.defaultParams ?? {}) && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted">触发沿</span>
          <select className="select !h-7" value={String(p.edge ?? "rising")} onChange={(e) => setP("edge", e.target.value)}>
            <option value="rising">上升沿</option>
            <option value="falling">下降沿</option>
          </select>
        </label>
      )}
      {"init" in (m.defaultParams ?? {}) && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted">初态</span>
          <select className="select !h-7" value={String(p.init ?? "X")} onChange={(e) => setP("init", e.target.value === "X" ? "X" : Number(e.target.value))}>
            <option value="X">X（未知）</option>
            {(m.category === "msi" ? Array.from({ length: 16 }, (_, i) => i) : [0, 1]).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {comp.type === "clock" && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted">周期 ns</span>
          <input className="input !h-7 w-24 mono" type="number" min={20} value={Number(p.period ?? 100)} onChange={(e) => setP("period", Math.max(20, Number(e.target.value)))} />
        </label>
      )}
      {m.tpd !== undefined && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted">tpd ns</span>
          <input className="input !h-7 w-24 mono" type="number" min={0} value={Number(p.tpd ?? m.tpd)} onChange={(e) => setP("tpd", Math.max(0, Number(e.target.value)))} />
          <span className="text-muted">（模型 C）</span>
        </label>
      )}
      <div>
        <div className="text-xs text-muted mb-1">引脚（点击 × 断开）</div>
        <div className="flex flex-wrap gap-1">
          {g.pins.map((pin) => (
            <span key={pin.def.name} className={`chip ${connected(pin.def.name) ? "chip-accent" : ""}`}>
              {pin.def.name}
              {connected(pin.def.name) && (
                <button onClick={() => onDisconnect(pin.def.name)} aria-label={`断开 ${pin.def.name}`}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
