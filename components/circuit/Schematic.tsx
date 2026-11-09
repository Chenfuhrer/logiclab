"use client";

import { useMemo, useState } from "react";
import type { ComponentInstance, L, Netlist, PinDef } from "@/lib/sim/types";
import { geometry, isFF, isGate, pinText, titleOf, type SymbolGeom } from "./geometry";
import { Tex } from "@/components/ui/Tex";
import { useLab } from "@/lib/storage/store";

/**
 * 电路图渲染器：同一份网表 + 仿真得到的网络取值 → 带实时着色的电路图。
 * 导线颜色：1 绿、0 青、X 红、Z 蓝虚线（颜色 + 线型双重编码）。点击引脚查看其含义与有效电平。
 */
export const wireColor = (v: L | undefined) => (v === 1 ? "var(--sig-1)" : v === 0 ? "var(--sig-0)" : v === 2 ? "var(--sig-x)" : v === 3 ? "var(--sig-z)" : "var(--line-2)");

export interface SchematicProps {
  netlist: Netlist;
  /** 网络 id → 取值 */
  values?: Record<string, L>;
  onToggle?: (compId: string) => void;
  /** 由编辑器使用 */
  selected?: Set<string>;
  onCompPointerDown?: (e: React.PointerEvent, compId: string) => void;
  onPinClick?: (compId: string, pin: string) => void;
  pendingPin?: { comp: string; pin: string } | null;
  /** 固定 viewBox（编辑器的平移缩放）；缺省时自动适配 */
  viewBox?: [number, number, number, number];
  className?: string;
  style?: React.CSSProperties;
  svgRef?: React.Ref<SVGSVGElement>;
  onSvgPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onSvgPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onSvgPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onWheel?: (e: React.WheelEvent<SVGSVGElement>) => void;
  /** 关闭引脚说明弹层 */
  noPinInfo?: boolean;
  /** 状态显示：元件 id → 内部状态文字（例如触发器 Q 值） */
  badges?: Record<string, string>;
  children?: React.ReactNode;
}

interface PinInfo {
  comp: ComponentInstance;
  def: PinDef;
  x: number;
  y: number;
  value?: L;
}

export function Schematic({ svgRef, netlist, values = {}, onToggle, ...props }: SchematicProps) {
  const style = useLab((s) => s.settings.gateStyle);
  const [info, setInfo] = useState<PinInfo | null>(null);
  const geoms = useMemo(() => new Map(netlist.components.map((c) => [c.id, geometry(c)])), [netlist]);
  const pinPos = (comp: string, pin: string) => {
    const c = netlist.components.find((x) => x.id === comp);
    const g = geoms.get(comp);
    const p = g?.pins.find((q) => q.def.name === pin);
    if (!c || !p) return null;
    return { x: c.x + p.x, y: c.y + p.y, side: p.side, dir: p.def.dir };
  };
  const pinNet = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of netlist.nets) for (const e of n.endpoints) m.set(`${e.comp}.${e.pin}`, n.id);
    return m;
  }, [netlist]);

  const bounds = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of netlist.components) {
      const g = geoms.get(c.id)!;
      x0 = Math.min(x0, c.x - 30);
      y0 = Math.min(y0, c.y - 30);
      x1 = Math.max(x1, c.x + g.w + 40);
      y1 = Math.max(y1, c.y + g.h + 40);
    }
    if (!isFinite(x0)) return [0, 0, 400, 200] as [number, number, number, number];
    return [x0, y0, x1 - x0, y1 - y0 + 30] as [number, number, number, number];
  }, [netlist, geoms]);
  const vb = props.viewBox ?? bounds;
  const bottomLane = bounds[1] + bounds[3] - 40;

  // 导线
  const wires = netlist.nets.map((net, ni) => {
    const v = values[net.id];
    const color = wireColor(v);
    const dash = v === 3 ? "5 3" : undefined;
    const paths: string[] = [];
    const dots: [number, number][] = [];
    if (net.wires?.length) {
      for (const w of net.wires) paths.push("M" + w.map((p) => p.join(" ")).join(" L"));
    } else {
      const eps = net.endpoints.map((e) => ({ e, p: pinPos(e.comp, e.pin) })).filter((x) => x.p) as { e: { comp: string; pin: string }; p: NonNullable<ReturnType<typeof pinPos>> }[];
      const src = eps.find((x) => x.p.dir === "out") ?? eps[0];
      if (src) {
        const targets = eps.filter((x) => x !== src);
        const lane = (ni % 7) * 6;
        for (const [ti, t] of targets.entries()) {
          const s = src.p;
          const d = t.p;
          if (s.side === "b") {
            paths.push(`M${s.x} ${s.y} V${d.y} H${d.x}`);
          } else if (d.side === "t") {
            paths.push(`M${s.x} ${s.y} H${d.x} V${d.y}`);
          } else if (d.side === "b") {
            paths.push(`M${s.x} ${s.y} H${s.x + 12 + lane} V${d.y + 14} H${d.x} V${d.y}`);
          } else if (d.x > s.x + 20) {
            const mx = Math.round((d.x - 14 - lane / 2) / 2) * 2;
            paths.push(`M${s.x} ${s.y} H${mx} V${d.y} H${d.x}`);
            if (targets.length > 1 && ti > 0) dots.push([mx, s.y]);
          } else {
            // 反馈：从下方绕回
            const y = bottomLane + lane;
            paths.push(`M${s.x} ${s.y} H${s.x + 14 + lane} V${y} H${d.x - 14 - lane} V${d.y} H${d.x}`);
          }
        }
      }
    }
    return (
      <g key={net.id} className="transition-[stroke] duration-150">
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={v === 1 ? 2 : 1.6} strokeDasharray={dash} strokeLinejoin="round" opacity={v === undefined ? 0.6 : 1} />
        ))}
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.6} fill={color} />
        ))}
      </g>
    );
  });

  return (
    <div className={`relative ${props.className ?? ""}`} style={props.style}>
      <svg
        ref={svgRef}
        viewBox={vb.join(" ")}
        className="w-full h-full block"
        onPointerDown={props.onSvgPointerDown}
        onPointerMove={props.onSvgPointerMove}
        onPointerUp={props.onSvgPointerUp}
        onWheel={props.onWheel}
        onClick={() => setInfo(null)}
        role="img"
        aria-label={`电路图：${netlist.name}`}
      >
        <defs>
          <pattern id="sch-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.7" fill="var(--grid)" />
          </pattern>
        </defs>
        <rect x={vb[0] - 2000} y={vb[1] - 2000} width={vb[2] + 4000} height={vb[3] + 4000} fill="url(#sch-grid)" />
        {wires}
        {netlist.components.map((c) => {
          const g = geoms.get(c.id)!;
          const sel = props.selected?.has(c.id);
          return (
            <g key={c.id} transform={`translate(${c.x} ${c.y})`} onPointerDown={props.onCompPointerDown ? (e) => props.onCompPointerDown!(e, c.id) : undefined} style={{ cursor: onToggle && (c.type === "switch" || c.type === "button") ? "pointer" : props.onCompPointerDown ? "move" : undefined }}>
              {sel && <rect x={-14} y={-14} width={g.w + 28} height={g.h + 28} rx={8} fill="var(--accent-soft)" stroke="var(--accent)" strokeDasharray="4 3" />}
              <SymbolBody comp={c} g={g} styleKind={style} values={values} pinNet={pinNet} onToggle={onToggle} badge={props.badges?.[c.id]} />
              {g.pins.filter((p) => !p.def.optional || pinNet.has(`${c.id}.${p.def.name}`) || props.onPinClick).map((p) => {
                const v = values[pinNet.get(`${c.id}.${p.def.name}`) ?? ""];
                const pending = props.pendingPin?.comp === c.id && props.pendingPin.pin === p.def.name;
                return (
                  <g
                    key={p.def.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (props.onPinClick) props.onPinClick(c.id, p.def.name);
                      else if (!props.noPinInfo) setInfo({ comp: c, def: p.def, x: c.x + p.x, y: c.y + p.y, value: v });
                    }}
                    onPointerDown={(e) => props.onPinClick && e.stopPropagation()}
                    style={{ cursor: "pointer" }}
                  >
                    <PinStub p={p} v={v} />
                    <circle cx={p.x} cy={p.y} r={pending ? 5 : 3} fill={pending ? "var(--amber)" : wireColor(v)} stroke="var(--bg)" strokeWidth={1} />
                    <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
                  </g>
                );
              })}
            </g>
          );
        })}
        {props.children}
      </svg>
      {info && <PinPopover info={info} vb={vb} onClose={() => setInfo(null)} />}
    </div>
  );
}

function PinStub({ p, v }: { p: SymbolGeom["pins"][number]; v: L | undefined }) {
  const c = wireColor(v);
  const len = 10;
  const bubble = p.def.active === "low" && p.def.dir === "in";
  const { x, y, side } = p;
  const ex = side === "l" ? x + len : side === "r" ? x - len : x;
  const ey = side === "t" ? y + len : side === "b" ? y - len : y;
  return (
    <g>
      <line x1={x} y1={y} x2={bubble ? ex - (side === "l" ? 6 : 0) : ex} y2={bubble ? ey - (side === "t" ? 6 : side === "b" ? -6 : 0) : ey} stroke={c} strokeWidth={1.6} />
      {bubble && <circle cx={side === "l" ? ex - 3 : ex} cy={side === "t" ? ey - 3 : side === "b" ? ey + 3 : ey} r={3} fill="var(--panel)" stroke="var(--ink-2)" strokeWidth={1.2} />}
    </g>
  );
}

const QUAL: Record<string, string> = { and: "&", nand: "&", or: "≥1", nor: "≥1", xor: "=1", xnor: "=", not: "1", buf: "1", tribuf: "▽" };

function SymbolBody({
  comp,
  g,
  styleKind,
  values,
  pinNet,
  onToggle,
  badge,
}: {
  comp: ComponentInstance;
  g: SymbolGeom;
  styleKind: "gb" | "ansi";
  values: Record<string, L>;
  pinNet: Map<string, string>;
  onToggle?: (id: string) => void;
  badge?: string;
}) {
  const stroke = "var(--ink-2)";
  const body = "var(--panel)";
  const t = comp.type;
  const outV = (pin: string) => values[pinNet.get(`${comp.id}.${pin}`) ?? ""];
  const label = comp.label ?? comp.id;
  if (isGate(t) || t === "not" || t === "buf") {
    const inverted = t === "nand" || t === "nor" || t === "not";
    const w = g.w;
    const h = g.h;
    const out = g.pins.find((p) => p.def.dir === "out")!;
    const oc = Boolean(comp.params?.oc);
    return (
      <g>
        {styleKind === "gb" ? (
          <>
            <rect x={0} y={0} width={w} height={h} fill={body} stroke={stroke} strokeWidth={1.4} rx={1.5} />
            <text x={w / 2} y={16} textAnchor="middle" fontSize={13} className="mono" fill="var(--ink)">
              {QUAL[t]}
            </text>
            {oc && (
              <text x={w - 9} y={h - 6} textAnchor="middle" fontSize={11} fill="var(--amber)">
                ◇
              </text>
            )}
          </>
        ) : (
          <path d={ansiPath(t, w, h)} fill={body} stroke={stroke} strokeWidth={1.4} />
        )}
        {inverted && <circle cx={w + 4} cy={h / 2} r={4} fill={body} stroke={stroke} strokeWidth={1.3} />}
        <line x1={inverted ? w + 8 : w} y1={h / 2} x2={out.x} y2={out.y} stroke={wireColor(outV("Y"))} strokeWidth={1.6} />
        <text x={w / 2} y={h + 13} textAnchor="middle" fontSize={9.5} className="mono" fill="var(--muted)">
          {label}
        </text>
      </g>
    );
  }
  switch (t) {
    case "switch":
    case "button": {
      const v = outV("Y");
      return (
        <g onClick={(e) => (onToggle ? (e.stopPropagation(), onToggle(comp.id)) : undefined)}>
          <rect x={0} y={0} width={g.w} height={g.h} rx={14} fill={v === 1 ? "var(--accent-soft)" : "var(--bg-2)"} stroke={v === 1 ? "var(--sig-1)" : "var(--line-2)"} strokeWidth={1.4} />
          <circle cx={v === 1 ? g.w - 14 : 14} cy={14} r={9} fill={v === 1 ? "var(--sig-1)" : "var(--muted)"} style={{ transition: "cx 0.15s" }} />
          <line x1={g.w} y1={14} x2={g.w + 10} y2={14} stroke={wireColor(v)} strokeWidth={1.6} />
          <text x={g.w / 2} y={-6} textAnchor="middle" fontSize={11} className="mono" fill="var(--ink)">
            {label}
          </text>
        </g>
      );
    }
    case "const0":
    case "const1":
      return (
        <g>
          <rect x={0} y={0} width={g.w} height={g.h} rx={4} fill="var(--bg-2)" stroke="var(--line-2)" />
          <text x={g.w / 2} y={15} textAnchor="middle" fontSize={12} className="mono" fill={t === "const1" ? "var(--sig-1)" : "var(--sig-0)"}>
            {t === "const1" ? "1" : "0"}
          </text>
          <line x1={g.w} y1={11} x2={g.w + 10} y2={11} stroke={wireColor(t === "const1" ? 1 : 0)} strokeWidth={1.6} />
        </g>
      );
    case "clock": {
      const v = outV("CLK");
      return (
        <g>
          <rect x={0} y={0} width={g.w} height={g.h} rx={5} fill="var(--bg-2)" stroke="var(--amber)" strokeWidth={1.3} />
          <path d="M8 21 H16 V9 H26 V21 H36 V9 H42" fill="none" stroke="var(--amber)" strokeWidth={1.6} />
          <line x1={g.w} y1={15} x2={g.w + 10} y2={15} stroke={wireColor(v)} strokeWidth={1.6} />
          <text x={g.w / 2} y={-6} textAnchor="middle" fontSize={11} className="mono" fill="var(--amber)">
            {label}
          </text>
        </g>
      );
    }
    case "led": {
      const v = outV("A") ?? values[pinNet.get(`${comp.id}.A`) ?? ""];
      const on = v === 1;
      return (
        <g>
          {on && <circle cx={13} cy={13} r={16} fill="var(--sig-1)" opacity={0.18} />}
          <circle cx={13} cy={13} r={11} fill={on ? "var(--sig-1)" : v === 2 ? "var(--sig-x)" : "var(--bg-2)"} stroke={v === 3 ? "var(--sig-z)" : "var(--line-2)"} strokeDasharray={v === 3 ? "3 2" : undefined} strokeWidth={1.4} style={v === 2 ? { animation: "blink-x 0.9s infinite" } : undefined} />
          <text x={13} y={-6} textAnchor="middle" fontSize={11} className="mono" fill="var(--ink)">
            {label}
          </text>
        </g>
      );
    }
    case "probe": {
      const v = values[pinNet.get(`${comp.id}.A`) ?? ""];
      const txt = v === 1 ? "1" : v === 0 ? "0" : v === 2 ? "X" : v === 3 ? "Z" : "·";
      return (
        <g>
          <rect x={0} y={0} width={g.w} height={g.h} rx={5} fill={v === 1 ? "var(--sig-1)" : v === 2 ? "var(--sig-x)" : "var(--bg-2)"} stroke={v === 0 ? "var(--sig-0)" : v === 3 ? "var(--sig-z)" : "var(--line-2)"} strokeDasharray={v === 3 ? "3 2" : undefined} />
          <text x={g.w / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={700} className="mono" fill={v === 1 ? "var(--accent-ink)" : v === 2 ? "#fff" : v === 0 ? "var(--sig-0)" : "var(--sig-z)"}>
            {txt}
          </text>
          <text x={g.w / 2} y={-5} textAnchor="middle" fontSize={10} className="mono" fill="var(--ink-2)">
            {label}
          </text>
        </g>
      );
    }
    case "pullup":
      return (
        <g>
          <text x={10} y={-4} textAnchor="middle" fontSize={9} className="mono" fill="var(--muted)">
            VCC
          </text>
          <rect x={4} y={4} width={12} height={30} fill={body} stroke={stroke} />
          <line x1={10} y1={34} x2={10} y2={40} stroke={stroke} />
          <text x={22} y={22} fontSize={9} className="mono" fill="var(--muted)">
            R
          </text>
        </g>
      );
    case "hexdisplay": {
      const bits = [0, 1, 2, 3].map((i) => values[pinNet.get(`${comp.id}.D${i}`) ?? ""]);
      const known = bits.every((b) => b === 0 || b === 1);
      const n = known ? bits.reduce<number>((a, b, i) => a | ((b as number) << i), 0) : null;
      return (
        <g>
          <rect x={0} y={0} width={g.w} height={g.h} rx={6} fill="#05080a" stroke="var(--line-2)" />
          <text x={g.w / 2} y={60} textAnchor="middle" fontSize={44} className="mono" fill={known ? "var(--sig-x)" : "var(--muted)"} style={{ filter: known ? "drop-shadow(0 0 6px var(--sig-x))" : undefined }}>
            {n === null ? "-" : n.toString(16).toUpperCase()}
          </text>
          <text x={g.w / 2} y={-6} textAnchor="middle" fontSize={10} className="mono" fill="var(--ink-2)">
            {label}
          </text>
        </g>
      );
    }
    case "tribuf": {
      const lo = Boolean(comp.params?.enActiveLow);
      return (
        <g>
          {styleKind === "gb" ? (
            <>
              <rect x={0} y={0} width={40} height={40} fill={body} stroke={stroke} strokeWidth={1.4} />
              <text x={20} y={16} textAnchor="middle" fontSize={12} className="mono" fill="var(--ink)">1</text>
              <text x={32} y={34} textAnchor="middle" fontSize={11} fill="var(--ink-2)">▽</text>
            </>
          ) : (
            <path d="M0 0 L40 20 L0 40 Z" fill={body} stroke={stroke} strokeWidth={1.4} />
          )}
          <line x1={40} y1={20} x2={50} y2={20} stroke={wireColor(outV("Y"))} strokeWidth={1.6} />
          {lo && <circle cx={20} cy={-3} r={3} fill={body} stroke={stroke} />}
          <text x={20} y={53} textAnchor="middle" fontSize={9.5} className="mono" fill="var(--muted)">{label}</text>
        </g>
      );
    }
  }
  if (isFF(t) || t === "sr_latch" || t === "d_latch") {
    const falling = comp.params?.edge === "falling";
    const ms = t === "jkff_ms";
    return (
      <g>
        <rect x={0} y={0} width={g.w} height={g.h} rx={2} fill={body} stroke={stroke} strokeWidth={1.4} />
        {g.pins
          .filter((p) => p.side === "l")
          .map((p) => {
            const isClk = p.def.name === "CLK" || p.def.name === "EN";
            const txt = p.def.name === "CLK" ? (ms ? "C1" : "C1") : p.def.name === "EN" ? "C1" : isFF(t) ? `1${p.def.name}` : p.def.name;
            return (
              <g key={p.def.name}>
                <text x={isClk && isFF(t) ? 13 : 6} y={p.y + 4} fontSize={10.5} className="mono" fill="var(--ink)">
                  {txt}
                </text>
                {isClk && isFF(t) && !ms && <path d={`M0 ${p.y - 5} L8 ${p.y} L0 ${p.y + 5}`} fill="none" stroke={stroke} strokeWidth={1.2} />}
                {isClk && falling && <circle cx={-3} cy={p.y} r={3} fill={body} stroke={stroke} strokeWidth={1.2} />}
              </g>
            );
          })}
        {ms && (
          <text x={g.w - 8} y={g.h / 2 + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)">
            ┐
          </text>
        )}
        <text x={g.w - 6} y={19} textAnchor="end" fontSize={10.5} className="mono" fill="var(--ink)">
          Q
        </text>
        <text x={g.w - 6} y={g.h - 11} textAnchor="end" fontSize={10.5} className="mono" fill="var(--ink)" textDecoration="overline">
          Q
        </text>
        {g.pins.find((p) => p.def.name === "SD") && pinNet.has(`${comp.id}.SD`) && (
          <text x={35} y={11} textAnchor="middle" fontSize={9} className="mono" fill="var(--ink-2)">S</text>
        )}
        {g.pins.find((p) => p.def.name === "RD") && pinNet.has(`${comp.id}.RD`) && (
          <text x={35} y={g.h - 4} textAnchor="middle" fontSize={9} className="mono" fill="var(--ink-2)">R</text>
        )}
        <text x={g.w / 2} y={-6} textAnchor="middle" fontSize={10} className="mono" fill="var(--ink-2)">
          {label}
        </text>
        {badge && (
          <text x={g.w / 2} y={g.h / 2 + 5} textAnchor="middle" fontSize={15} fontWeight={700} className="mono" fill="var(--amber)">
            {badge}
          </text>
        )}
      </g>
    );
  }
  // 中规模器件
  return (
    <g>
      <rect x={0} y={0} width={g.w} height={g.h} rx={3} fill={body} stroke={stroke} strokeWidth={1.4} />
      <text x={g.w / 2} y={15} textAnchor="middle" fontSize={10.5} fontWeight={600} className="mono" fill="var(--amber)">
        {titleOf(t)}
      </text>
      {g.pins.map((p) => {
        const { text, bar } = pinText(p.def);
        const left = p.side === "l";
        return (
          <g key={p.def.name}>
            <text x={left ? 6 : g.w - 6} y={p.y + 4} textAnchor={left ? "start" : "end"} fontSize={9.5} className="mono" fill="var(--ink)" textDecoration={bar ? "overline" : undefined}>
              {text}
            </text>
            {p.def.clock && <path d={`M0 ${p.y - 4} L6 ${p.y} L0 ${p.y + 4}`} fill="none" stroke={stroke} strokeWidth={1.1} />}
          </g>
        );
      })}
      <text x={g.w / 2} y={g.h + 13} textAnchor="middle" fontSize={9.5} className="mono" fill="var(--muted)">
        {label === comp.id ? "" : label}
      </text>
    </g>
  );
}

function ansiPath(t: string, w: number, h: number): string {
  switch (t) {
    case "and":
    case "nand":
      return `M0 0 H${w / 2} A${w / 2} ${h / 2} 0 0 1 ${w / 2} ${h} H0 Z`;
    case "or":
    case "nor":
      return `M0 0 Q${w * 0.55} 0 ${w} ${h / 2} Q${w * 0.55} ${h} 0 ${h} Q${w * 0.28} ${h / 2} 0 0 Z`;
    case "xor":
    case "xnor":
      return `M6 0 Q${w * 0.58} 0 ${w} ${h / 2} Q${w * 0.58} ${h} 6 ${h} Q${w * 0.32} ${h / 2} 6 0 Z M0 0 Q${w * 0.26} ${h / 2} 0 ${h}`;
    default:
      return `M0 0 L${w - 4} ${h / 2} L0 ${h} Z`;
  }
}

function PinPopover({ info, vb, onClose }: { info: PinInfo; vb: [number, number, number, number]; onClose: () => void }) {
  const left = ((info.x - vb[0]) / vb[2]) * 100;
  const top = ((info.y - vb[1]) / vb[3]) * 100;
  const v = info.value;
  return (
    <div className="absolute z-20 card p-3 w-64 text-xs space-y-1.5" style={{ left: `min(${left}%, calc(100% - 16rem))`, top: `calc(${top}% + 12px)` }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className="text-sm">
          <Tex>{info.def.label}</Tex>
        </span>
        <span className="chip">{info.def.dir === "in" ? "输入" : "输出"}</span>
        <span className={`chip ${info.def.active === "low" ? "chip-amber" : ""}`}>{info.def.active === "low" ? "低电平有效" : "高电平有效"}</span>
        <button className="ml-auto text-muted hover:text-ink" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>
      <div className="text-ink-2 leading-relaxed">
        <Tex>{`\\text{${(info.comp.label ?? info.comp.id).replace(/[{}\\]/g, "")}}`}</Tex> · {titleOf(info.comp.type)}
      </div>
      <p className="leading-relaxed">{info.def.desc.split(/(\\overline\{[^}]+\}|\\[a-zA-Z]+_\{?\w+\}?)/).map((s, i) => (s.startsWith("\\") ? <Tex key={i}>{s}</Tex> : s))}</p>
      {info.def.clock && <p className="text-amber">触发方式：{info.def.clock === "rising" ? "上升沿" : info.def.clock === "falling" ? "下降沿" : "脉冲/电平"}</p>}
      {info.def.datasheet && <p className="text-muted">数据手册引脚名：{info.def.datasheet}</p>}
      <p className="flex items-center gap-2">
        当前值：<span className={`lv ${v === 1 ? "lv-1" : v === 0 ? "lv-0" : v === 2 ? "lv-x" : "lv-z"}`}>{v === 1 ? "1" : v === 0 ? "0" : v === 2 ? "X" : v === 3 ? "Z" : "–"}</span>
        {v === undefined && <span className="text-muted">（未连接）</span>}
      </p>
    </div>
  );
}
