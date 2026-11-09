"use client";

import { useId, useState } from "react";
import { Tex } from "@/components/ui/Tex";
import { DEFAULT_TIMING, type TimingInput, type TimingResult, round, tryComputeTiming } from "@/lib/analog-models/timing";

type Key = keyof Required<TimingInput>;

const FIELDS: { key: Key; tex: string; hint: string }[] = [
  { key: "tpd", tex: "t_{pd}", hint: "触发器 CLK→Q 延迟" },
  { key: "tcombMax", tex: "t_{\\text{comb},\\max}", hint: "组合逻辑最长路径" },
  { key: "tcombMin", tex: "t_{\\text{comb},\\min}", hint: "组合逻辑最短路径" },
  { key: "tsu", tex: "t_{su}", hint: "建立时间" },
  { key: "th", tex: "t_{h}", hint: "保持时间" },
  { key: "tskew", tex: "t_{skew}", hint: "时钟偏斜（可为负）" },
  { key: "T", tex: "T", hint: "实际时钟周期（留空 = 取 T_min）" },
];

const toText = (p: Required<TimingInput>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) as Record<Key, string>;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim()));

export function TimingCalc() {
  const [txt, setTxt] = useState<Record<Key, string>>(() => toText(DEFAULT_TIMING));
  const input: TimingInput = {
    tpd: num(txt.tpd),
    tcombMax: num(txt.tcombMax),
    tcombMin: num(txt.tcombMin),
    tsu: num(txt.tsu),
    th: num(txt.th),
    tskew: num(txt.tskew),
    T: txt.T.trim() === "" ? undefined : num(txt.T),
  };
  const res = tryComputeTiming(input);
  const isDefault = (Object.keys(DEFAULT_TIMING) as Key[]).every((k) => num(txt[k]) === DEFAULT_TIMING[k]);

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="同步电路时序计算">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · 同步时序</div>
          <div className="text-base font-semibold text-ink">最高时钟频率与建立 / 保持裕量</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip chip-amber">带延迟模型 · 教学近似</span>
          {isDefault && <span className="chip">示例参数（假设值）</span>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5 text-xs text-muted" title={f.hint}>
            <span className="flex items-baseline justify-between gap-1">
              <span className="text-ink-2">
                <Tex>{f.tex}</Tex>
              </span>
              <span>ns</span>
            </span>
            <input
              className="input mono w-full"
              value={txt[f.key]}
              inputMode="decimal"
              placeholder={f.key === "T" ? "T_min" : ""}
              onChange={(e) => setTxt({ ...txt, [f.key]: e.target.value })}
              aria-label={f.hint}
            />
            <span className="truncate text-[0.68rem]">{f.hint}</span>
          </label>
        ))}
      </div>

      <div className="card-inset px-3 py-2 text-xs text-ink-2">
        <span className="text-ink">偏斜符号约定：</span>
        <Tex>{"t_{skew}=t_{clk}(\\text{FF}_2)-t_{clk}(\\text{FF}_1)"}</Tex>
        ，FF₁ 为发射（源）触发器，FF₂ 为捕获（目的）触发器。捕获时钟晚到为正：正偏斜对建立有利、对保持不利；负偏斜相反。保持检查严格应使用 CLK→Q 的最小延迟，这里与建立检查共用同一个 t_pd（教学简化）。
      </div>

      {!res.ok ? (
        <p role="alert" className="card-inset px-3 py-2 text-sm text-danger">
          ✕ {res.error}
        </p>
      ) : (
        <Results r={res.value} />
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        试试：
        <button type="button" className="btn btn-sm" onClick={() => setTxt(toText(DEFAULT_TIMING))}>
          恢复示例
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setTxt({ ...toText(DEFAULT_TIMING), tskew: "8" })}>
          正偏斜 +8 ns
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setTxt({ ...toText(DEFAULT_TIMING), tskew: "18" })}>
          偏斜过大 → 保持违例
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setTxt({ ...toText(DEFAULT_TIMING), T: "45" })}>
          T = 45 ns → 建立违例
        </button>
      </div>
    </section>
  );
}

function Results({ r }: { r: TimingResult }) {
  const p = r.input;
  const sk = p.tskew < 0 ? `(${p.tskew})` : String(p.tskew);
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="card-inset space-y-1 overflow-x-auto thin-scroll px-3 py-2 text-sm">
          <div className="eyebrow">最小周期与最高频率</div>
          <Tex>{`T_{\\min}=t_{pd}+t_{\\text{comb},\\max}+t_{su}-t_{skew}=${p.tpd}+${p.tcombMax}+${p.tsu}-${sk}=${round(r.Tmin)}\\,\\text{ns}`}</Tex>
          <div>
            <Tex>{`f_{\\max}=\\dfrac{1}{T_{\\min}}=\\dfrac{1000}{${round(r.Tmin)}}\\,\\text{MHz}\\approx${round(r.fmax)}\\,\\text{MHz}`}</Tex>
          </div>
        </div>
        <div className="card-inset space-y-1.5 overflow-x-auto thin-scroll px-3 py-2 text-sm">
          <div className="eyebrow">裕量（T = {round(r.T)} ns{p.T === undefined ? "，取 T_min" : ""}）</div>
          <div className="flex flex-wrap items-center gap-2">
            <Tex>{`\\text{建立裕量}=T+t_{skew}-(t_{pd}+t_{\\text{comb},\\max}+t_{su})=${round(r.setupSlack)}\\,\\text{ns}`}</Tex>
            {r.setupOk ? <span className="chip chip-accent">✓ 满足</span> : <span className="chip chip-danger">✕ 违例</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tex>{`\\text{保持裕量}=t_{pd}+t_{\\text{comb},\\min}-t_h-t_{skew}=${p.tpd}+${p.tcombMin}-${p.th < 0 ? `(${p.th})` : p.th}-${sk}=${round(r.holdSlack)}\\,\\text{ns}`}</Tex>
            {r.holdOk ? <span className="chip chip-accent">✓ ≥ 0</span> : <span className="chip chip-danger">✕ &lt; 0</span>}
          </div>
        </div>
      </div>
      {r.warnings.map((w) => (
        <p key={w} role="alert" className="text-sm text-danger">
          ✕ {w}
        </p>
      ))}
      <div className="card-inset overflow-x-auto thin-scroll p-2">
        <TimingSvg r={r} />
      </div>
    </>
  );
}

/* ───────────────── 时序关系条 ───────────────── */

const W = 680;
const LEFT = 104;
const RIGHT = 664;

function niceStep(span: number): number {
  const raw = span / 8;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function TimingSvg({ r }: { r: TimingResult }) {
  const uid = useId().replace(/:/g, "");
  const p = r.input;
  const T = r.T;
  const sk = p.tskew;
  const capture = T + sk; // 捕获沿（下一个周期）
  const holdEdge = sk; // 同一发射沿对应的捕获沿
  const t0 = Math.min(0, sk, sk + Math.min(0, p.th));
  const t1 = Math.max(capture, r.arrivalMax, T);
  const pad = (t1 - t0) * 0.06 + 1;
  const a = t0 - pad;
  const b = t1 + pad;
  const x = (t: number) => LEFT + ((t - a) / (b - a)) * (RIGHT - LEFT);
  const hatch = `ts-${uid}`;

  const rows = { clk1: 34, clk2: 76, setup: 128, hold: 200, axis: 244 };
  const H = 278;

  const clockPath = (offset: number, yMid: number) => {
    const hi = yMid - 11;
    const lo = yMid + 11;
    const pts: string[] = [`M ${x(a)} ${lo}`];
    for (let k = -1; k <= 2; k++) {
      const rise = offset + k * T;
      const fall = rise + T / 2;
      if (rise > b) break;
      if (fall < a) continue;
      pts.push(`L ${x(Math.max(rise, a))} ${lo}`, `L ${x(Math.max(rise, a))} ${hi}`, `L ${x(Math.min(fall, b))} ${hi}`, `L ${x(Math.min(fall, b))} ${lo}`);
    }
    pts.push(`L ${x(b)} ${lo}`);
    return pts.join(" ");
  };

  const bar = (t1_: number, t2_: number, y: number, fill: string, label: string, textFill = "var(--accent-ink)") => {
    const xa = x(Math.min(t1_, t2_));
    const w = Math.abs(x(t2_) - x(t1_));
    return (
      <g>
        <rect x={xa} y={y - 9} width={Math.max(w, 0.5)} height={18} rx={2} fill={fill} />
        {w > label.length * 6.2 + 6 && (
          <text x={xa + w / 2} y={y + 4} textAnchor="middle" fontSize={10.5} fill={textFill} className="mono">
            {label}
          </text>
        )}
      </g>
    );
  };

  const windowBox = (t1_: number, t2_: number, y: number, label: string) => {
    const xa = x(Math.min(t1_, t2_));
    const w = Math.abs(x(t2_) - x(t1_));
    return (
      <g>
        <rect x={xa} y={y - 13} width={Math.max(w, 1)} height={26} fill={`url(#${hatch})`} stroke="var(--amber)" strokeWidth={1} />
        <text x={xa + w / 2} y={y - 17} textAnchor="middle" fontSize={10} fill="var(--amber)" className="mono">
          {label}
        </text>
      </g>
    );
  };

  const slack = (from: number, to: number, y: number, ok: boolean, label: string) => {
    const xa = x(Math.min(from, to));
    const w = Math.abs(x(to) - x(from));
    const color = ok ? "var(--accent)" : "var(--danger)";
    return (
      <g>
        <line x1={x(from)} x2={x(to)} y1={y + 18} y2={y + 18} stroke={color} strokeWidth={2} />
        <line x1={x(from)} x2={x(from)} y1={y + 13} y2={y + 23} stroke={color} />
        <line x1={x(to)} x2={x(to)} y1={y + 13} y2={y + 23} stroke={color} />
        <text x={xa + w / 2} y={y + 33} textAnchor="middle" fontSize={10.5} fill={color} className="mono">
          {label}
        </text>
      </g>
    );
  };

  const step = niceStep(b - a);
  const ticks: number[] = [];
  for (let t = Math.ceil(a / step) * step; t <= b; t += step) ticks.push(Number(t.toPrecision(10)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label="一个时钟周期内的时序关系">
      <defs>
        <pattern id={hatch} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke="var(--amber)" strokeWidth={1} opacity={0.6} />
        </pattern>
      </defs>

      {/* 行标签 */}
      <text x={8} y={rows.clk1 + 4} fontSize={11} fill="var(--ink-2)">
        CLK₁ 发射
      </text>
      <text x={8} y={rows.clk2 + 4} fontSize={11} fill="var(--ink-2)">
        CLK₂ 捕获
      </text>
      <text x={8} y={rows.setup + 4} fontSize={11} fill="var(--ink-2)">
        最长路径
      </text>
      <text x={8} y={rows.setup + 17} fontSize={9.5} fill="var(--muted)">
        建立检查
      </text>
      <text x={8} y={rows.hold + 4} fontSize={11} fill="var(--ink-2)">
        最短路径
      </text>
      <text x={8} y={rows.hold + 17} fontSize={9.5} fill="var(--muted)">
        保持检查
      </text>

      {/* 时钟 */}
      <path d={clockPath(0, rows.clk1)} fill="none" stroke="var(--sig-1)" strokeWidth={1.6} />
      <path d={clockPath(sk, rows.clk2)} fill="none" stroke="var(--sig-1)" strokeWidth={1.6} />

      {/* 参考竖线：发射沿 0、捕获沿 t_skew 与 T + t_skew */}
      <line x1={x(0)} x2={x(0)} y1={rows.clk1 - 14} y2={rows.axis} stroke="var(--ink-2)" strokeDasharray="2 3" strokeWidth={0.8} />
      <line x1={x(holdEdge)} x2={x(holdEdge)} y1={rows.clk2 - 14} y2={rows.axis} stroke="var(--amber)" strokeDasharray="2 3" strokeWidth={0.8} />
      <line x1={x(capture)} x2={x(capture)} y1={rows.clk2 - 14} y2={rows.axis} stroke="var(--amber)" strokeDasharray="2 3" strokeWidth={0.8} />
      {sk !== 0 && (
        <g>
          <line x1={x(0)} x2={x(sk)} y1={rows.clk2 - 16} y2={rows.clk2 - 16} stroke="var(--amber)" strokeWidth={1.2} />
          <text x={(x(0) + x(sk)) / 2} y={rows.clk2 - 20} textAnchor="middle" fontSize={10} fill="var(--amber)" className="mono">
            t_skew = {round(sk)}
          </text>
        </g>
      )}

      {/* 最长路径 / 建立 */}
      {bar(0, p.tpd, rows.setup, "var(--sig-0)", "t_pd")}
      {bar(p.tpd, r.arrivalMax, rows.setup, "var(--sig-z)", "t_comb,max")}
      {windowBox(capture - p.tsu, capture, rows.setup, `t_su ${round(p.tsu)}`)}
      {slack(r.arrivalMax, capture - p.tsu, rows.setup, r.setupOk, `建立裕量 ${round(r.setupSlack)} ns`)}

      {/* 最短路径 / 保持 */}
      {bar(0, p.tpd, rows.hold, "var(--sig-0)", "t_pd")}
      {bar(p.tpd, r.arrivalMin, rows.hold, "var(--sig-z)", "t_comb,min")}
      {windowBox(holdEdge, holdEdge + p.th, rows.hold, `t_h ${round(p.th)}`)}
      {slack(holdEdge + p.th, r.arrivalMin, rows.hold, r.holdOk, `保持裕量 ${round(r.holdSlack)} ns`)}

      {/* 时间轴 */}
      <line x1={LEFT} x2={RIGHT} y1={rows.axis} y2={rows.axis} stroke="var(--line-2)" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={rows.axis} y2={rows.axis + 4} stroke="var(--muted)" />
          <text x={x(t)} y={rows.axis + 15} textAnchor="middle" fontSize={9.5} fill="var(--muted)" className="mono">
            {t}
          </text>
        </g>
      ))}
      <text x={RIGHT} y={H - 3} textAnchor="end" fontSize={9.5} fill="var(--muted)">
        时间 / ns（0 = 发射沿；虚线为捕获沿 t_skew 与 T + t_skew）
      </text>
    </svg>
  );
}
