"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { L, TracePoint } from "@/lib/sim/types";

/**
 * 逻辑分析仪风格的数字波形（SVG）。
 *  - 位信号：1 为高位实线（绿），0 为低位实线（青），X 为红色斜纹带，Z 为中位蓝色虚线；
 *  - 总线：六边形分段 + 数值；
 *  - 零延迟模型中"同一时刻内"的瞬态（宽度为 0）用琥珀色竖标记出，悬停显示说明；
 *  - 支持时间游标、缩放、拖动平移。
 */
export interface BitChannel {
  kind: "bit";
  name: string;
  points: TracePoint[];
  /** 高亮（例如时钟） */
  clock?: boolean;
}
export interface BusChannel {
  kind: "bus";
  name: string;
  points: { t: number; d: number; v: number | null }[];
  radix?: 2 | 10 | 16;
  width?: number;
}
export type Channel = BitChannel | BusChannel;

export interface Marker {
  t: number;
  label: string;
  tone?: "accent" | "amber" | "danger";
}

const ROW = 30;
const LABEL_W = 92;
const AXIS_H = 22;

function valueAt(points: { t: number; d: number; v: L | number | null }[], t: number) {
  let v: L | number | null | undefined = undefined;
  for (const p of points) {
    if (p.t <= t) v = p.v;
    else break;
  }
  return v;
}

/** 由若干位通道合成总线通道（bits[0] 为最低位） */
export function busFromBits(name: string, bits: TracePoint[][], radix: 2 | 10 | 16 = 10): BusChannel {
  const evs = bits.flatMap((b) => b.map((p) => ({ t: p.t, d: p.d })));
  evs.sort((a, b) => a.t - b.t || a.d - b.d);
  const uniq = evs.filter((e, i) => i === 0 || e.t !== evs[i - 1].t || e.d !== evs[i - 1].d);
  const points = uniq.map((e) => {
    let val = 0;
    let known = true;
    bits.forEach((b, i) => {
      let x: L = 2;
      for (const p of b) if (p.t < e.t || (p.t === e.t && p.d <= e.d)) x = p.v;
      if (x !== 0 && x !== 1) known = false;
      else val |= x << i;
    });
    return { t: e.t, d: e.d, v: known ? val : null };
  });
  return { kind: "bus", name, points, radix, width: bits.length };
}

const fmt = (v: number | null, radix: number, width?: number) => {
  if (v === null) return "X";
  if (radix === 2) return v.toString(2).padStart(width ?? 1, "0");
  if (radix === 16) return v.toString(16).toUpperCase();
  return String(v);
};

export function Waveform({
  channels,
  t0 = 0,
  t1,
  markers = [],
  height,
  unit = "ns",
  title,
  emptyHint,
}: {
  channels: Channel[];
  t0?: number;
  t1: number;
  markers?: Marker[];
  height?: number;
  unit?: string;
  title?: string;
  emptyHint?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [view, setView] = useState<[number, number] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hoverTransient, setHoverTransient] = useState<{ x: number; y: number; text: string } | null>(null);
  const drag = useRef<{ x: number; v: [number, number] } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 新数据到来时，若用户未缩放则自动跟随
  const full: [number, number] = [t0, Math.max(t1, t0 + 1)];
  const [vs, ve] = view ?? full;
  const plotW = Math.max(100, w - LABEL_W - 8);
  const x = (t: number) => LABEL_W + ((t - vs) / (ve - vs)) * plotW;
  const tAt = (px: number) => vs + ((px - LABEL_W) / plotW) * (ve - vs);
  const H = AXIS_H + channels.length * ROW + 6;

  const ticks = useMemo(() => {
    const span = ve - vs;
    const raw = span / Math.max(2, Math.floor(plotW / 90));
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let t = Math.ceil(vs / step) * step; t <= ve; t += step) out.push(t);
    return out;
  }, [vs, ve, plotW]);

  const zoom = (factor: number, center?: number) => {
    const c = center ?? (vs + ve) / 2;
    let ns = c - (c - vs) * factor;
    let ne = c + (ve - c) * factor;
    const minSpan = 4;
    if (ne - ns < minSpan) {
      ns = c - minSpan / 2;
      ne = c + minSpan / 2;
    }
    if (ns < full[0]) {
      ne += full[0] - ns;
      ns = full[0];
    }
    if (ne > full[1]) {
      ns -= ne - full[1];
      ne = full[1];
    }
    ns = Math.max(full[0], ns);
    if (ne - ns >= full[1] - full[0] - 1e-9) setView(null);
    else setView([ns, ne]);
  };

  const rows = channels.map((ch, i) => {
    const y0 = AXIS_H + i * ROW + 5;
    const yHi = y0 + 3;
    const yLo = y0 + ROW - 9;
    const yMid = (yHi + yLo) / 2;
    if (ch.kind === "bit") {
      const segs: React.ReactNode[] = [];
      const transients: React.ReactNode[] = [];
      const pts = ch.points;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const next = pts[k + 1];
        const sT = p.t;
        const eT = next ? next.t : ve;
        if (next && next.t === p.t) {
          // 同一时刻被覆盖的值：零宽瞬态
          const xx = x(p.t);
          if (xx >= LABEL_W && xx <= LABEL_W + plotW)
            transients.push(
              <g key={`tr${k}`} onMouseEnter={() => setHoverTransient({ x: xx, y: yHi, text: `${ch.name} 在 t=${p.t} ${unit} 处出现宽度为 0 的瞬态（值 ${valText(p.v)}，同一时刻内被下一事件覆盖）` })} onMouseLeave={() => setHoverTransient(null)}>
                <rect x={xx - 4} y={yHi - 4} width={8} height={yLo - yHi + 8} fill="transparent" />
                <path d={`M${xx} ${yHi - 3} V${yLo + 3}`} stroke="var(--amber)" strokeWidth={2} strokeDasharray="2 2" />
                <circle cx={xx} cy={yHi - 4} r={2.5} fill="var(--amber)" />
              </g>,
            );
          continue;
        }
        if (eT < vs || sT > ve) continue;
        const xa = Math.max(LABEL_W, x(sT));
        const xb = Math.min(LABEL_W + plotW, x(eT));
        if (xb <= xa && next) continue;
        const prev = pts[k - 1];
        const v = p.v;
        // 跳变竖线
        if (prev && prev.t !== p.t && sT >= vs) {
          const pv = prev.v;
          if ((pv === 0 || pv === 1) && (v === 0 || v === 1)) segs.push(<path key={`e${k}`} d={`M${xa} ${yHi} V${yLo}`} stroke="var(--ink-2)" strokeWidth={1.2} />);
        }
        if (v === 1) segs.push(<path key={k} d={`M${xa} ${yHi} H${xb}`} stroke={ch.clock ? "var(--amber)" : "var(--sig-1)"} strokeWidth={2} />);
        else if (v === 0) segs.push(<path key={k} d={`M${xa} ${yLo} H${xb}`} stroke={ch.clock ? "var(--amber)" : "var(--sig-0)"} strokeWidth={2} />);
        else if (v === 2) segs.push(<rect key={k} x={xa} y={yHi} width={Math.max(0, xb - xa)} height={yLo - yHi} fill="url(#hatchX)" stroke="var(--sig-x)" strokeWidth={1} />);
        else segs.push(<path key={k} d={`M${xa} ${yMid} H${xb}`} stroke="var(--sig-z)" strokeWidth={1.6} strokeDasharray="5 3" />);
      }
      return (
        <g key={ch.name + i}>
          {segs}
          {transients}
        </g>
      );
    }
    // 总线
    const segs: React.ReactNode[] = [];
    const pts = ch.points.filter((p, k) => !(ch.points[k + 1] && ch.points[k + 1].t === p.t));
    const transients = ch.points.filter((p, k) => ch.points[k + 1] && ch.points[k + 1].t === p.t);
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const eT = pts[k + 1] ? pts[k + 1].t : ve;
      if (eT < vs || p.t > ve) continue;
      const xa = Math.max(LABEL_W, x(p.t));
      const xb = Math.min(LABEL_W + plotW, x(eT));
      const s = Math.min(4, (xb - xa) / 2);
      const unknown = p.v === null;
      segs.push(
        <g key={k}>
          <path
            d={`M${xa} ${yMid} L${xa + s} ${yHi} H${xb - s} L${xb} ${yMid} L${xb - s} ${yLo} H${xa + s} Z`}
            fill={unknown ? "url(#hatchX)" : "var(--accent-soft)"}
            stroke={unknown ? "var(--sig-x)" : "var(--sig-1)"}
            strokeWidth={1.2}
          />
          {xb - xa > 18 && (
            <text x={(xa + xb) / 2} y={yMid + 4} textAnchor="middle" className="mono" fontSize={11} fill={unknown ? "var(--sig-x)" : "var(--ink)"}>
              {fmt(p.v, ch.radix ?? 10, ch.width)}
            </text>
          )}
        </g>,
      );
    }
    for (const [k, p] of transients.entries()) {
      const xx = x(p.t);
      if (xx < LABEL_W || xx > LABEL_W + plotW) continue;
      segs.push(
        <g key={`bt${k}`} onMouseEnter={() => setHoverTransient({ x: xx, y: yHi, text: `${ch.name} 在 t=${p.t} ${unit} 出现瞬态值 ${fmt(p.v, ch.radix ?? 10, ch.width)}（同一时刻内被覆盖，宽度为 0）` })} onMouseLeave={() => setHoverTransient(null)}>
          <rect x={xx - 5} y={yHi - 6} width={10} height={yLo - yHi + 10} fill="transparent" />
          <path d={`M${xx} ${yHi - 4} V${yLo + 3}`} stroke="var(--amber)" strokeWidth={2} />
          <text x={xx + 4} y={yHi - 1} fontSize={9} className="mono" fill="var(--amber)">
            {fmt(p.v, ch.radix ?? 10, ch.width)}
          </text>
        </g>,
      );
    }
    return <g key={ch.name + i}>{segs}</g>;
  });

  return (
    <div className="card-inset relative select-none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <span className="eyebrow">{title ?? "时序波形 · 逻辑分析仪"}</span>
        <span className="ml-auto flex items-center gap-1">
          <Legend />
          <button className="btn btn-sm btn-ghost" onClick={() => zoom(0.5)} aria-label="放大">＋</button>
          <button className="btn btn-sm btn-ghost" onClick={() => zoom(2)} aria-label="缩小">－</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setView(null)}>全部</button>
        </span>
      </div>
      <div ref={wrap} className="relative overflow-hidden" style={{ height: height ?? H }}>
        {channels.length === 0 || (t1 <= t0 && emptyHint) ? (
          <div className="p-6 text-sm text-muted">{emptyHint ?? "暂无波形"}</div>
        ) : (
          <svg
            width={w}
            height={H}
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = e.clientX - r.left;
              if (drag.current) {
                const dt = ((drag.current.x - px) / plotW) * (drag.current.v[1] - drag.current.v[0]);
                let ns = drag.current.v[0] + dt;
                let ne = drag.current.v[1] + dt;
                if (ns < full[0]) {
                  ne += full[0] - ns;
                  ns = full[0];
                }
                if (ne > full[1]) {
                  ns -= ne - full[1];
                  ne = full[1];
                }
                setView([ns, ne]);
              }
              setCursor(px > LABEL_W ? tAt(px) : null);
            }}
            onMouseLeave={() => {
              setCursor(null);
              drag.current = null;
            }}
            onMouseDown={(e) => {
              if (!view) return;
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              drag.current = { x: e.clientX - r.left, v: [vs, ve] };
            }}
            onMouseUp={() => (drag.current = null)}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              zoom(e.deltaY > 0 ? 1.25 : 0.8, tAt(e.clientX - r.left));
            }}
            className={view ? "cursor-grab active:cursor-grabbing" : ""}
          >
            <defs>
              <pattern id="hatchX" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="color-mix(in srgb, var(--sig-x) 18%, transparent)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--sig-x)" strokeWidth="2" />
              </pattern>
            </defs>
            {/* 网格与时间轴 */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={AXIS_H - 4} y2={H} stroke="var(--grid)" strokeWidth={1} />
                <text x={x(t)} y={13} textAnchor="middle" fontSize={10} className="mono" fill="var(--muted)">
                  {t}
                </text>
              </g>
            ))}
            <text x={8} y={13} fontSize={10} className="mono" fill="var(--muted)">
              t / {unit}
            </text>
            {markers.map((m, i) =>
              m.t >= vs && m.t <= ve ? (
                <g key={i}>
                  <line x1={x(m.t)} x2={x(m.t)} y1={AXIS_H} y2={H} stroke={m.tone === "danger" ? "var(--sig-x)" : m.tone === "amber" ? "var(--amber)" : "var(--accent)"} strokeOpacity={0.35} strokeDasharray="3 3" />
                  <text x={x(m.t) + 3} y={AXIS_H + 8} fontSize={9} className="mono" fill="var(--muted)">
                    {m.label}
                  </text>
                </g>
              ) : null,
            )}
            {channels.map((ch, i) => {
              const v = cursor !== null ? valueAt(ch.points as { t: number; d: number; v: L | number | null }[], cursor) : undefined;
              const txt = v === undefined ? "" : ch.kind === "bus" ? fmt(v as number | null, ch.radix ?? 10, ch.width) : valText(v as L);
              return (
                <g key={`l${i}`}>
                  <line x1={0} x2={w} y1={AXIS_H + (i + 1) * ROW + 2} y2={AXIS_H + (i + 1) * ROW + 2} stroke="var(--line)" strokeWidth={1} />
                  <text x={8} y={AXIS_H + i * ROW + 21} fontSize={12} className="mono" fill={ch.kind === "bit" && ch.clock ? "var(--amber)" : "var(--ink)"}>
                    {ch.name}
                  </text>
                  {txt && (
                    <text x={LABEL_W - 8} y={AXIS_H + i * ROW + 21} fontSize={11} textAnchor="end" className="mono" fill={txt === "X" ? "var(--sig-x)" : txt === "Z" ? "var(--sig-z)" : "var(--amber)"}>
                      {txt}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={LABEL_W - 1} x2={LABEL_W - 1} y1={0} y2={H} stroke="var(--line-2)" />
            {rows}
            {cursor !== null && (
              <g pointerEvents="none">
                <line x1={x(cursor)} x2={x(cursor)} y1={AXIS_H - 6} y2={H} stroke="var(--amber)" strokeWidth={1} />
                <rect x={x(cursor) - 26} y={0} width={52} height={16} rx={4} fill="var(--amber)" />
                <text x={x(cursor)} y={12} textAnchor="middle" fontSize={10} className="mono" fill="#1a1200">
                  {cursor.toFixed(cursor < 100 ? 1 : 0)}
                </text>
              </g>
            )}
          </svg>
        )}
        {hoverTransient && (
          <div className="absolute z-10 max-w-xs text-xs card px-2.5 py-1.5 pointer-events-none" style={{ left: Math.min(hoverTransient.x + 8, w - 260), top: hoverTransient.y + 10 }}>
            {hoverTransient.text}
          </div>
        )}
      </div>
    </div>
  );
}

function valText(v: L | undefined) {
  return v === 0 ? "0" : v === 1 ? "1" : v === 2 ? "X" : v === 3 ? "Z" : "";
}

function Legend() {
  return (
    <span className="hidden lg:flex items-center gap-2.5 mr-2 text-[10px] text-muted mono">
      <span className="flex items-center gap-1">
        <svg width="16" height="8"><path d="M0 1 H16" stroke="var(--sig-1)" strokeWidth="2" /></svg>1
      </span>
      <span className="flex items-center gap-1">
        <svg width="16" height="8"><path d="M0 7 H16" stroke="var(--sig-0)" strokeWidth="2" /></svg>0
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-4 h-2 lv-x !min-w-0 !p-0 !rounded-sm" />X
      </span>
      <span className="flex items-center gap-1">
        <svg width="16" height="8"><path d="M0 4 H16" stroke="var(--sig-z)" strokeWidth="1.6" strokeDasharray="4 2" /></svg>Z
      </span>
      <span className="flex items-center gap-1">
        <svg width="8" height="10"><path d="M4 0 V10" stroke="var(--amber)" strokeWidth="2" strokeDasharray="2 2" /></svg>瞬态
      </span>
    </span>
  );
}
