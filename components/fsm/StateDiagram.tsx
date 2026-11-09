"use client";

export interface SDNode {
  id: number;
  label: string;
  /** Moore 输出等，显示在圆内下方 */
  sub?: string;
  kind?: "legal" | "unused" | "trap";
}
export interface SDEdge {
  from: number;
  to: number;
  label?: string;
}

/**
 * 状态转换图（SVG）。合法状态排在主圆上，未用状态排在外圈并用虚线表示；
 * 落入无效循环的状态用红色。当前状态高亮，当前转移用琥珀色。
 */
export function StateDiagram({
  nodes,
  edges,
  current,
  activeEdge,
  size = 360,
  order,
}: {
  nodes: SDNode[];
  edges: SDEdge[];
  current?: number | null;
  activeEdge?: { from: number; to: number } | null;
  size?: number;
  /** 主圆上的排列顺序（例如计数序列） */
  order?: number[];
}) {
  const legal = order ?? nodes.filter((n) => n.kind !== "unused" && n.kind !== "trap").map((n) => n.id);
  const others = nodes.filter((n) => !legal.includes(n.id)).map((n) => n.id);
  const W = size;
  const H = others.length ? size + 20 : size;
  const cx = W / 2;
  const cy = H / 2;
  const R = others.length ? W * 0.27 : W * 0.36;
  const R2 = W * 0.44;
  const nodeR = nodes.length > 10 ? 16 : 20;
  const pos = new Map<number, { x: number; y: number }>();
  legal.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, legal.length);
    pos.set(id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  });
  others.forEach((id, i) => {
    const a = -Math.PI / 2 + Math.PI / Math.max(1, others.length) + (2 * Math.PI * i) / Math.max(1, others.length);
    pos.set(id, { x: cx + R2 * Math.cos(a), y: cy + R2 * Math.sin(a) });
  });
  // 合并同起止边
  const merged = new Map<string, SDEdge & { labels: string[] }>();
  for (const e of edges) {
    const k = `${e.from}>${e.to}`;
    const m = merged.get(k);
    if (m) {
      if (e.label) m.labels.push(e.label);
    } else merged.set(k, { ...e, labels: e.label ? [e.label] : [] });
  }
  const edgeEls = [...merged.values()].map((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return null;
    const active = activeEdge && activeEdge.from === e.from && activeEdge.to === e.to;
    const color = active ? "var(--amber)" : "var(--ink-2)";
    const label = e.labels.join(", ");
    if (e.from === e.to) {
      // 自环：朝外侧
      const ang = Math.atan2(a.y - cy, a.x - cx) || -Math.PI / 2;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const px = -uy;
      const py = ux;
      const s1 = { x: a.x + nodeR * (ux * 0.7 + px * 0.7), y: a.y + nodeR * (uy * 0.7 + py * 0.7) };
      const s2 = { x: a.x + nodeR * (ux * 0.7 - px * 0.7), y: a.y + nodeR * (uy * 0.7 - py * 0.7) };
      const c1 = { x: a.x + (ux * 2.6 + px * 1.3) * nodeR, y: a.y + (uy * 2.6 + py * 1.3) * nodeR };
      const c2 = { x: a.x + (ux * 2.6 - px * 1.3) * nodeR, y: a.y + (uy * 2.6 - py * 1.3) * nodeR };
      return (
        <g key={`${e.from}-${e.to}`}>
          <path d={`M${s1.x} ${s1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${s2.x} ${s2.y}`} fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.3} markerEnd={active ? "url(#arrA)" : "url(#arr)"} />
          {label && (
            <text x={a.x + ux * nodeR * 2.9} y={a.y + uy * nodeR * 2.9 + 4} textAnchor="middle" fontSize={10} className="mono" fill={active ? "var(--amber)" : "var(--muted)"}>
              {label}
            </text>
          )}
        </g>
      );
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bidir = merged.has(`${e.to}>${e.from}`);
    const bend = bidir ? 18 : 8;
    const mx = (a.x + b.x) / 2 + nx * bend;
    const my = (a.y + b.y) / 2 + ny * bend;
    const sx = a.x + (dx / len) * nodeR;
    const sy = a.y + (dy / len) * nodeR;
    const ex = b.x - (dx / len) * (nodeR + 3);
    const ey = b.y - (dy / len) * (nodeR + 3);
    return (
      <g key={`${e.from}-${e.to}`}>
        <path d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.3} markerEnd={active ? "url(#arrA)" : "url(#arr)"} />
        {label && (
          <g>
            <rect x={mx + nx * 6 - label.length * 3.4 - 3} y={my + ny * 6 - 8} width={label.length * 6.8 + 6} height={14} rx={3} fill="var(--bg-2)" opacity={0.9} />
            <text x={mx + nx * 6} y={my + ny * 6 + 3} textAnchor="middle" fontSize={10} className="mono" fill={active ? "var(--amber)" : "var(--ink-2)"}>
              {label}
            </text>
          </g>
        )}
      </g>
    );
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="状态转换图">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-2)" />
        </marker>
        <marker id="arrA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--amber)" />
        </marker>
      </defs>
      {edgeEls}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const cur = current === n.id;
        const stroke = n.kind === "trap" ? "var(--sig-x)" : n.kind === "unused" ? "var(--muted)" : cur ? "var(--amber)" : "var(--accent)";
        return (
          <g key={n.id}>
            {cur && <circle cx={p.x} cy={p.y} r={nodeR + 6} fill="var(--amber-soft)" />}
            <circle cx={p.x} cy={p.y} r={nodeR} fill={cur ? "var(--amber)" : "var(--panel)"} stroke={stroke} strokeWidth={cur ? 2.5 : 1.6} strokeDasharray={n.kind === "unused" || n.kind === "trap" ? "4 3" : undefined} />
            <text x={p.x} y={p.y + (n.sub ? 0 : 4)} textAnchor="middle" fontSize={nodes.length > 10 ? 10 : 11.5} fontWeight={600} className="mono" fill={cur ? "#1a1200" : "var(--ink)"}>
              {n.label}
            </text>
            {n.sub && (
              <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={9} className="mono" fill={cur ? "#1a1200" : "var(--muted)"}>
                {n.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
