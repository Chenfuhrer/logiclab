"use client";

import { useMemo, useState } from "react";
import { astable, monostable, schmitt, simulate555, edgesOf, fmtSI, MODEL_E_NOTE, thresholds, type Sample } from "@/lib/analog-models/timer555";
import { Tex } from "@/components/ui/Tex";

type Mode = "astable" | "monostable" | "schmitt";
const MODE_TEXT: Record<Mode, string> = { astable: "多谐振荡器", monostable: "单稳态触发器", schmitt: "施密特触发器" };

const C_UNITS = [
  { k: "µF", v: 1e-6 },
  { k: "nF", v: 1e-9 },
];

function Num({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <label className="text-xs text-muted space-y-1 block">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="mono text-ink">
          {value} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label={label} />
    </label>
  );
}

/**
 * 555 定时器实验（模型 E：教学近似模型）。
 * 波形由 lib/analog-models/timer555 的时间步进仿真得到；参数表中的解析公式与仿真在单元测试中相互校核。
 */
export function Timer555Lab({ mode: initial = "astable" }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [Vcc, setVcc] = useState(5);
  const [useCo, setUseCo] = useState(false);
  const [Vco, setVco] = useState(3.5);
  // 多谐
  const [R1, setR1] = useState(10);
  const [R2, setR2] = useState(20);
  const [Ca, setCa] = useState(10);
  const [caUnit, setCaUnit] = useState(1);
  // 单稳
  const [R, setR] = useState(47);
  const [Cm, setCm] = useState(10);
  const [trigRatio, setTrigRatio] = useState(0.15);
  const [retrigger, setRetrigger] = useState(false);
  // 施密特
  const [wave, setWave] = useState<"triangle" | "noisy">("noisy");
  const [cursor, setCursor] = useState<number | null>(null);

  const co = useCo ? Math.min(Vco, Vcc - 0.1) : undefined;
  const sim = useMemo(() => {
    try {
      if (mode === "astable") {
        const C = Ca * C_UNITS[caUnit === 1 ? 0 : 1].v;
        const r = astable({ Vcc, R1: R1 * 1e3, R2: R2 * 1e3, C, Vco: co });
        const tEnd = r.tFirst + 3 * r.T;
        const samples = simulate555({ kind: "astable", Vcc, R1: R1 * 1e3, R2: R2 * 1e3, C, Vco: co }, tEnd, tEnd / 1600, 1, 0);
        return { ok: true as const, samples, tEnd, astable: r, trig: null as null | ((t: number) => number) };
      }
      if (mode === "monostable") {
        const C = Cm * 1e-6;
        const m = monostable({ Vcc, R: R * 1e3, C, Vco: co });
        const t0 = 0.3 * m.tW;
        const w = trigRatio * m.tW;
        const trig = (t: number) => ((t >= t0 && t < t0 + w) || (retrigger && t >= t0 + 0.5 * m.tW && t < t0 + 0.5 * m.tW + w) ? 0 : Vcc);
        const tEnd = t0 + Math.max(2.4 * m.tW, w + 1.2 * m.tW);
        const samples = simulate555({ kind: "monostable", Vcc, R: R * 1e3, C, Vco: co, trigger: trig }, tEnd, tEnd / 1600);
        return { ok: true as const, samples, tEnd, mono: m, trig, t0, w };
      }
      const th = thresholds(Vcc, co);
      const input = (t: number) => {
        const base = wave === "triangle" ? (t < 0.5 ? 2 * t : t < 1 ? 2 - 2 * t : t < 1.5 ? 2 * (t - 1) : 2 - 2 * (t - 1)) * Vcc : (0.5 - 0.42 * Math.cos(2 * Math.PI * t)) * Vcc;
        const noise = wave === "noisy" ? 0.06 * Vcc * Math.sin(2 * Math.PI * 23 * t) : 0;
        return Math.min(Vcc, Math.max(0, base + noise));
      };
      const samples = simulate555({ kind: "schmitt", Vcc, Vco: co, input }, 2, 2 / 1600, 1);
      return { ok: true as const, samples, tEnd: 2, schmitt: schmitt(Vcc, co), th, trig: null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [mode, Vcc, co, R1, R2, Ca, caUnit, R, Cm, trigRatio, retrigger, wave]);

  if (!sim.ok)
    return (
      <div className="widget card p-4">
        <p className="text-danger text-sm">{sim.error}</p>
      </div>
    );
  const th = thresholds(Vcc, co);
  const samples = sim.samples;
  const idx = cursor === null ? samples.length - 1 : Math.min(samples.length - 1, Math.max(0, Math.round(cursor * (samples.length - 1))));
  const cur = samples[idx];
  const edges = edgesOf(samples);
  const timeUnit = mode === "schmitt" ? "（相对时间）" : "";
  const tLabel = (t: number) => (mode === "schmitt" ? t.toFixed(2) : fmtSI(t, "s"));

  return (
    <div className="widget card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
          <button
            key={m}
            className={`btn btn-sm ${mode === m ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`}
            onClick={() => {
              setMode(m);
              setCursor(null);
            }}
          >
            {MODE_TEXT[m]}
          </button>
        ))}
        <span className="chip chip-amber ml-auto" title={MODEL_E_NOTE}>
          模型 E · 教学近似模型
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3 min-w-0">
          <InternalDiagram sample={cur} th={th} Vcc={Vcc} mode={mode} trigV={mode === "monostable" && "trig" in sim && sim.trig ? sim.trig(cur.t) : cur.v} />
          <Plots samples={samples} tEnd={sim.tEnd} th={th} Vcc={Vcc} mode={mode} trig={mode === "monostable" && "trig" in sim ? sim.trig : null} cursor={idx} onCursor={setCursor} tLabel={tLabel} />
          <p className="text-[11px] text-muted leading-relaxed">
            在波形上移动鼠标（手机上横向拖动），上方结构图会显示该时刻两个比较器、锁存器与放电管的状态。{timeUnit}
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="card-inset p-3 space-y-3">
            <Num label="V_CC" value={Vcc} onChange={setVcc} min={5} max={15} step={0.5} unit="V" />
            {mode === "astable" && (
              <>
                <Num label="R1" value={R1} onChange={setR1} min={1} max={100} step={1} unit="kΩ" />
                <Num label="R2" value={R2} onChange={setR2} min={1} max={100} step={1} unit="kΩ" />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Num label="C" value={Ca} onChange={setCa} min={1} max={100} step={1} unit={caUnit === 1 ? "µF" : "nF"} />
                  </div>
                  <select className="select !h-7 text-xs" value={caUnit} onChange={(e) => setCaUnit(Number(e.target.value))} aria-label="电容单位">
                    <option value={1}>µF</option>
                    <option value={0}>nF</option>
                  </select>
                </div>
              </>
            )}
            {mode === "monostable" && (
              <>
                <Num label="R" value={R} onChange={setR} min={1} max={200} step={1} unit="kΩ" />
                <Num label="C" value={Cm} onChange={setCm} min={1} max={100} step={1} unit="µF" />
                <Num label="触发负脉冲宽度 / t_W" value={trigRatio} onChange={setTrigRatio} min={0.05} max={1.6} step={0.05} unit="" />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={retrigger} onChange={(e) => setRetrigger(e.target.checked)} className="accent-[var(--accent)]" />
                  暂稳态期间再来一个触发
                </label>
              </>
            )}
            {mode === "schmitt" && (
              <label className="text-xs text-muted space-y-1 block">
                <span>输入波形</span>
                <select className="select w-full" value={wave} onChange={(e) => setWave(e.target.value as "triangle" | "noisy")}>
                  <option value="noisy">带干扰的缓变信号</option>
                  <option value="triangle">三角波</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={useCo} onChange={(e) => setUseCo(e.target.checked)} className="accent-[var(--accent)]" />
              控制端 CO（5 脚）外加电压
            </label>
            {useCo && <Num label="V_CO" value={Math.min(Vco, Vcc - 0.1)} onChange={setVco} min={1} max={Vcc - 0.5} step={0.1} unit="V" />}
          </div>
          <Results sim={sim as unknown as Record<string, unknown>} th={th} Vcc={Vcc} co={co} edges={edges} />
        </div>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{MODEL_E_NOTE}</p>
    </div>
  );
}

function Results({ sim, th, Vcc, co, edges }: { sim: Record<string, unknown>; th: { upper: number; lower: number }; Vcc: number; co?: number; edges: { t: number; to: 0 | 1 }[] }) {
  const thTex = co === undefined ? `V_U = \\tfrac{2}{3}V_{CC} = ${th.upper.toFixed(2)}\\,\\text{V},\\ V_L = \\tfrac{1}{3}V_{CC} = ${th.lower.toFixed(2)}\\,\\text{V}` : `V_U = V_{CO} = ${th.upper.toFixed(2)}\\,\\text{V},\\ V_L = \\tfrac{1}{2}V_{CO} = ${th.lower.toFixed(2)}\\,\\text{V}`;
  void Vcc;
  if ("astable" in sim && sim.astable) {
    const r = sim.astable as ReturnType<typeof astable>;
    // 仿真测得的稳定周期（第 2、4 个跳变之间）
    const measured = edges.length >= 5 ? edges[4].t - edges[2].t : null;
    return (
      <div className="card-inset p-3 space-y-1.5 text-xs">
        <div className="eyebrow mb-1">计算结果</div>
        <Tex>{thTex}</Tex>
        <Line k="t_H" tex={co === undefined ? "0.693(R_1+R_2)C" : "(R_1+R_2)C\\ln\\frac{V_{CC}-V_L}{V_{CC}-V_U}"} v={fmtSI(r.tH, "s")} />
        <Line k="t_L" tex="0.693R_2C" v={fmtSI(r.tL, "s")} />
        <Line k="f" tex="1/(t_H+t_L)" v={fmtSI(r.f, "Hz")} />
        <Line k="q" tex="t_H/T" v={`${(r.duty * 100).toFixed(1)} %`} />
        <Line k="\text{首个 }t_H" tex="(R_1+R_2)C\ln 3" v={fmtSI(r.tFirst, "s")} />
        {measured !== null && <p className="text-muted pt-1">仿真测得周期 {fmtSI(measured, "s")}（解析值 {fmtSI(r.T, "s")}，差异来自步长）</p>}
      </div>
    );
  }
  if ("mono" in sim && sim.mono) {
    const m = sim.mono as ReturnType<typeof monostable>;
    const measured = edges.length >= 2 ? edges[1].t - edges[0].t : null;
    const w = sim.w as number;
    return (
      <div className="card-inset p-3 space-y-1.5 text-xs">
        <div className="eyebrow mb-1">计算结果</div>
        <Tex>{thTex}</Tex>
        <Line k="t_W" tex={co === undefined ? "RC\\ln 3 \\approx 1.1RC" : "RC\\ln\\frac{V_{CC}}{V_{CC}-V_U}"} v={fmtSI(m.tW, "s")} />
        {measured !== null && <p className="text-muted">仿真测得脉宽 {fmtSI(measured, "s")}</p>}
        {w > m.tW && <p className="text-amber">触发脉冲比 t_W 还宽：触发端优先，输出要等触发撤销后才回到 0，脉宽不再由 RC 决定。</p>}
      </div>
    );
  }
  const s = sim.schmitt as ReturnType<typeof schmitt>;
  return (
    <div className="card-inset p-3 space-y-1.5 text-xs">
      <div className="eyebrow mb-1">计算结果</div>
      <Line k="V_{T+}" tex={co === undefined ? "\\tfrac{2}{3}V_{CC}" : "V_{CO}"} v={`${s.vtPlus.toFixed(2)} V`} />
      <Line k="V_{T-}" tex={co === undefined ? "\\tfrac{1}{3}V_{CC}" : "\\tfrac{1}{2}V_{CO}"} v={`${s.vtMinus.toFixed(2)} V`} />
      <Line k="\Delta V" tex="V_{T+}-V_{T-}" v={`${s.hysteresis.toFixed(2)} V`} />
      <p className="text-muted">输入上升越过 V_T+ 输出变 0，下降越过 V_T− 输出变 1（反相）。回差大于干扰幅度时，输出不会来回抖动。</p>
    </div>
  );
}

function Line({ k, tex, v }: { k: string; tex: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <Tex>{`${k} = ${tex}`}</Tex>
      <span className="ml-auto mono text-amber">{v}</span>
    </div>
  );
}

// ───────────────────────── 内部结构图 ─────────────────────────

function Lbl({ x, y, t, c = "var(--ink-2)", a = "start" }: { x: number; y: number; t: string; c?: string; a?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={10.5} className="mono" fill={c} textAnchor={a}>
      {t}
    </text>
  );
}

function InternalDiagram({ sample, th, Vcc, mode, trigV }: { sample: Sample; th: { upper: number; lower: number }; Vcc: number; mode: Mode; trigV: number }) {
  const on = "var(--amber)";
  const off = "var(--line-2)";
  const vTH = sample.v;
  const vTR = mode === "monostable" ? trigV : sample.v;
  const q = sample.out;
  return (
    <div className="card-inset p-2 overflow-x-auto thin-scroll">
      <svg viewBox="0 0 640 210" className="w-full min-w-[520px] h-auto" role="img" aria-label="555 内部结构与当前状态">
        {/* 外框 */}
        <rect x={70} y={10} width={470} height={190} rx={8} fill="var(--panel)" stroke="var(--line-2)" />
        <text x={530} y={28} fontSize={12} fontWeight={700} className="mono" fill="var(--amber)" textAnchor="end">
          555
        </text>
        {/* 分压电阻 */}
        <Lbl x={92} y={24} t={`8 VCC ${Vcc}V`} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={100} y={34 + i * 52} width={14} height={30} fill="var(--bg-2)" stroke="var(--ink-2)" />
        ))}
        <path d="M107 28 V34 M107 64 V86 M107 116 V138 M107 168 V192" stroke="var(--ink-2)" />
        <Lbl x={120} y={52} t="5k" c="var(--muted)" />
        <Lbl x={120} y={104} t="5k" c="var(--muted)" />
        <Lbl x={120} y={156} t="5k" c="var(--muted)" />
        <Lbl x={92} y={204} t="1 GND" />
        {/* 抽头 */}
        <path d="M107 75 H172 V90 H190" stroke="var(--ink-2)" fill="none" />
        <path d="M107 127 H190" stroke="var(--ink-2)" />
        <Lbl x={140} y={71} t={`V_U ${th.upper.toFixed(2)}`} c="var(--accent)" />
        <Lbl x={140} y={123} t={`V_L ${th.lower.toFixed(2)}`} c="var(--accent)" />
        {/* 比较器 C1：TH(+) vs V_U(−) */}
        <path d="M190 50 V100 L240 75 Z" fill="var(--bg-2)" stroke={sample.c1 ? on : off} strokeWidth={sample.c1 ? 2.2 : 1.3} />
        <Lbl x={196} y={64} t="+" />
        <Lbl x={196} y={92} t="−" />
        <Lbl x={204} y={79} t="C1" c="var(--ink)" />
        <path d="M20 60 H190" stroke="var(--sig-1)" />
        <Lbl x={6} y={56} t={`6 TH ${vTH.toFixed(2)}V`} c="var(--sig-1)" />
        {/* 比较器 C2：V_L(+) vs TR(−) */}
        <path d="M190 112 V162 L240 137 Z" fill="var(--bg-2)" stroke={sample.c2 ? on : off} strokeWidth={sample.c2 ? 2.2 : 1.3} />
        <Lbl x={196} y={126} t="+" />
        <Lbl x={196} y={154} t="−" />
        <Lbl x={204} y={141} t="C2" c="var(--ink)" />
        <path d="M20 150 H190" stroke={mode === "monostable" ? "var(--sig-z)" : "var(--sig-1)"} />
        <Lbl x={6} y={146} t={`2 TR̄ ${vTR.toFixed(2)}V`} c={mode === "monostable" ? "var(--sig-z)" : "var(--sig-1)"} />
        {/* 锁存器 */}
        <rect x={290} y={60} width={80} height={92} rx={4} fill="var(--bg-2)" stroke="var(--ink-2)" />
        <path d="M240 75 H290" stroke={sample.c1 ? on : off} strokeWidth={2} />
        <path d="M240 137 H290" stroke={sample.c2 ? on : off} strokeWidth={2} />
        <Lbl x={296} y={79} t="R（置 0）" c="var(--ink)" />
        <Lbl x={296} y={141} t="S（置 1）" c="var(--ink)" />
        <Lbl x={330} y={110} t={`Q = ${q}`} c="var(--amber)" a="middle" />
        <Lbl x={244} y={70} t={sample.c1 ? "1" : "0"} c={sample.c1 ? on : "var(--muted)"} />
        <Lbl x={244} y={132} t={sample.c2 ? "1" : "0"} c={sample.c2 ? on : "var(--muted)"} />
        {/* 输出 */}
        <path d="M370 85 H430" stroke={q ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={2} />
        <path d="M430 72 L456 85 L430 98 Z" fill="var(--bg-2)" stroke="var(--ink-2)" />
        <path d="M456 85 H600" stroke={q ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={2} />
        <Lbl x={560} y={80} t={`3 OUT = ${q ? "1" : "0"}`} c={q ? "var(--sig-1)" : "var(--sig-0)"} />
        {/* 放电管 */}
        <path d="M370 130 H420" stroke={sample.discharge ? on : off} strokeWidth={2} />
        <Lbl x={374} y={125} t="Q̄" />
        <circle cx={445} cy={150} r={20} fill={sample.discharge ? "var(--amber-soft)" : "var(--bg-2)"} stroke={sample.discharge ? on : off} strokeWidth={sample.discharge ? 2 : 1.2} />
        <path d="M420 130 V150 H432 M437 140 V160 M437 144 L452 134 M437 156 L452 166" stroke="var(--ink-2)" fill="none" />
        <path d="M452 134 V125 H600" stroke="var(--ink-2)" />
        <path d="M452 166 V192" stroke="var(--ink-2)" />
        <Lbl x={560} y={120} t="7 D（放电）" />
        <Lbl x={474} y={158} t={sample.discharge ? "T_D 导通" : "T_D 截止"} c={sample.discharge ? on : "var(--muted)"} />
      </svg>
    </div>
  );
}

// ───────────────────────── 波形 ─────────────────────────

function Plots({
  samples,
  tEnd,
  th,
  Vcc,
  mode,
  trig,
  cursor,
  onCursor,
  tLabel,
}: {
  samples: Sample[];
  tEnd: number;
  th: { upper: number; lower: number };
  Vcc: number;
  mode: Mode;
  trig: null | ((t: number) => number);
  cursor: number;
  onCursor: (x: number | null) => void;
  tLabel: (t: number) => string;
}) {
  const W = 620;
  const L = 44;
  const PW = W - L - 8;
  const rows: { h: number; kind: "analog" | "digital" | "trig"; label: string }[] = [
    ...(mode === "monostable" ? [{ h: 46, kind: "trig" as const, label: "v_TR" }] : []),
    { h: 120, kind: "analog", label: mode === "schmitt" ? "v_I" : "v_C" },
    { h: 50, kind: "digital", label: "v_O" },
  ];
  const H = rows.reduce((s, r) => s + r.h + 10, 0) + 20;
  const x = (t: number) => L + (t / tEnd) * PW;
  let y0 = 8;
  const els: React.ReactNode[] = [];
  for (const r of rows) {
    const top = y0;
    const yv = (v: number) => top + r.h - (v / Vcc) * (r.h - 6) - 3;
    els.push(<rect key={r.label + "bg"} x={L} y={top} width={PW} height={r.h} fill="var(--bg-2)" stroke="var(--line)" />);
    els.push(
      <text key={r.label + "lab"} x={6} y={top + 14} fontSize={11} className="mono" fill="var(--ink-2)">
        {r.label}
      </text>,
    );
    if (r.kind === "analog") {
      for (const [v, name] of [
        [th.upper, "V_U"],
        [th.lower, "V_L"],
      ] as const) {
        els.push(<line key={name} x1={L} x2={L + PW} y1={yv(v)} y2={yv(v)} stroke="var(--amber)" strokeDasharray="4 3" strokeOpacity={0.7} />);
        els.push(
          <text key={name + "t"} x={L - 4} y={yv(v) + 3} fontSize={9} textAnchor="end" className="mono" fill="var(--amber)">
            {v.toFixed(1)}
          </text>,
        );
      }
      const d = samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${yv(s.v).toFixed(1)}`).join(" ");
      els.push(<path key="analog" d={d} fill="none" stroke="var(--sig-1)" strokeWidth={1.8} />);
    } else if (r.kind === "trig" && trig) {
      const d = samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${yv(trig(s.t)).toFixed(1)}`).join(" ");
      els.push(<path key="trig" d={d} fill="none" stroke="var(--sig-z)" strokeWidth={1.6} />);
      els.push(<line key="vl" x1={L} x2={L + PW} y1={yv(th.lower)} y2={yv(th.lower)} stroke="var(--amber)" strokeDasharray="4 3" strokeOpacity={0.6} />);
    } else {
      const hi = top + 8;
      const lo = top + r.h - 8;
      let d = `M${x(0)} ${samples[0].out ? hi : lo}`;
      for (let i = 1; i < samples.length; i++) if (samples[i].out !== samples[i - 1].out) d += ` H${x(samples[i].t).toFixed(1)} V${samples[i].out ? hi : lo}`;
      d += ` H${x(tEnd)}`;
      els.push(<path key="dig" d={d} fill="none" stroke="var(--accent)" strokeWidth={2} />);
    }
    y0 += r.h + 10;
  }
  const cx = x(samples[cursor].t);
  return (
    <div className="card-inset p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          onCursor(Math.min(1, Math.max(0, (px - L) / PW)));
        }}
        onPointerLeave={(e) => e.pointerType === "mouse" && onCursor(null)}
        role="img"
        aria-label="555 电容电压与输出波形"
      >
        {els}
        <line x1={cx} x2={cx} y1={4} y2={H - 16} stroke="var(--amber)" strokeWidth={1} />
        <text x={Math.min(Math.max(cx, L + 30), W - 40)} y={H - 4} fontSize={10} textAnchor="middle" className="mono" fill="var(--amber)">
          {tLabel(samples[cursor].t)}
        </text>
        <text x={L} y={H - 4} fontSize={9} className="mono" fill="var(--muted)">
          0
        </text>
        <text x={L + PW} y={H - 4} fontSize={9} textAnchor="end" className="mono" fill="var(--muted)">
          {tLabel(tEnd)}
        </text>
      </svg>
    </div>
  );
}
