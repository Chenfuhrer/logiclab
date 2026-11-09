"use client";

import { codeLabel, kmapLayout, type CellValue } from "@/lib/logic/kmap";
import { implicantPattern } from "@/lib/logic/qm";

/**
 * 卡诺图网格（2～5 变量）。
 *  - values：按最小项编号的取值 0 / 1 / "x"
 *  - groups：要画出的卡诺圈（最小项集合），跨边界（循环相邻）的圈会拆成多个矩形绘制，并用相同颜色表示同一个圈
 *  - onCellClick：编辑或圈选模式
 */
export const GROUP_COLORS = ["#5ef0a2", "#ffc94d", "#7b93ff", "#ff8fb1", "#4fd8e8", "#c792ea", "#f78c6c", "#a3e635"];

export function KMap({
  vars,
  values,
  groups = [],
  selecting = [],
  onCellClick,
  highlight,
  compact = false,
  title,
}: {
  vars: string[];
  values: CellValue[];
  groups?: number[][];
  selecting?: number[];
  onCellClick?: (m: number) => void;
  highlight?: number[];
  compact?: boolean;
  title?: string;
}) {
  const n = vars.length;
  const lay = kmapLayout(n, vars);
  const cell = compact ? 34 : 44;
  const headW = compact ? 40 : 52;
  const headH = compact ? 26 : 32;
  const rows = lay.rowCodes.length;
  const cols = lay.colCodes.length;
  const W = headW + cols * cell + 8;
  const H = headH + rows * cell + 8;
  const posOf = new Map<number, { r: number; c: number }>();
  lay.cells.forEach((row, r) => row.forEach((m, c) => posOf.set(m, { r, c })));

  const segments = (idx: number[], size: number) => {
    const set = [...new Set(idx)].sort((a, b) => a - b);
    const segs: [number, number][] = [];
    for (const i of set) {
      const last = segs[segs.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else segs.push([i, i]);
    }
    void size;
    return segs;
  };
  const groupRects = groups.map((g, gi) => {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
    const pts = g.map((m) => posOf.get(m)!).filter(Boolean);
    const rs = segments(
      pts.map((p) => p.r),
      rows,
    );
    const cs = segments(
      pts.map((p) => p.c),
      cols,
    );
    const inset = 4 + (gi % 4) * 2.5;
    const rects: React.ReactNode[] = [];
    rs.forEach(([r0, r1], ri) =>
      cs.forEach(([c0, c1], ci) => {
        // 只画确实属于该圈的矩形块
        const ok = g.some((m) => {
          const p = posOf.get(m)!;
          return p.r >= r0 && p.r <= r1 && p.c >= c0 && p.c <= c1;
        });
        if (!ok) return;
        const openL = cs.length > 1 && ci > 0;
        const openR = cs.length > 1 && ci < cs.length - 1;
        void openL;
        void openR;
        rects.push(
          <rect
            key={`${ri}-${ci}`}
            x={headW + c0 * cell + inset}
            y={headH + r0 * cell + inset}
            width={(c1 - c0 + 1) * cell - inset * 2}
            height={(r1 - r0 + 1) * cell - inset * 2}
            rx={cell / 3}
            fill={color}
            fillOpacity={0.1}
            stroke={color}
            strokeWidth={2}
          />,
        );
      }),
    );
    return <g key={gi}>{rects}</g>;
  });

  return (
    <figure className="inline-block">
      {title && <figcaption className="text-xs text-muted mb-1 mono">{title}</figcaption>}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" role="grid" aria-label={`${n} 变量卡诺图`}>
        {/* 角标：行变量 \ 列变量 */}
        <line x1={2} y1={2} x2={headW} y2={headH} stroke="var(--line-2)" />
        <text x={4} y={headH - 4} fontSize={compact ? 9 : 11} className="mono" fill="var(--ink-2)">
          {lay.rowVars.join("")}
        </text>
        <text x={headW - 2} y={11} textAnchor="end" fontSize={compact ? 9 : 11} className="mono" fill="var(--ink-2)">
          {lay.colVars.join("")}
        </text>
        {lay.colCodes.map((code, c) => (
          <text key={`c${c}`} x={headW + c * cell + cell / 2} y={headH - 8} textAnchor="middle" fontSize={compact ? 9.5 : 11} className="mono" fill="var(--accent)">
            {codeLabel(code, lay.colBits)}
          </text>
        ))}
        {lay.rowCodes.map((code, r) => (
          <text key={`r${r}`} x={headW - 8} y={headH + r * cell + cell / 2 + 4} textAnchor="end" fontSize={compact ? 9.5 : 11} className="mono" fill="var(--accent)">
            {codeLabel(code, lay.rowBits)}
          </text>
        ))}
        {n === 5 && <line x1={headW + 4 * cell} x2={headW + 4 * cell} y1={headH - 4} y2={headH + rows * cell + 4} stroke="var(--amber)" strokeDasharray="3 3" />}
        {lay.cells.map((row, r) =>
          row.map((m, c) => {
            const v = values[m];
            const sel = selecting.includes(m);
            const hl = highlight?.includes(m);
            return (
              <g key={m} onClick={onCellClick ? () => onCellClick(m) : undefined} style={{ cursor: onCellClick ? "pointer" : undefined }} role="gridcell" aria-label={`m${m} = ${v}`}>
                <rect x={headW + c * cell} y={headH + r * cell} width={cell} height={cell} fill={sel ? "var(--amber-soft)" : hl ? "var(--accent-soft)" : "var(--bg-2)"} stroke="var(--line-2)" strokeWidth={1} />
                <text x={headW + c * cell + cell / 2} y={headH + r * cell + cell / 2 + 6} textAnchor="middle" fontSize={compact ? 14 : 17} fontWeight={600} className="mono" fill={v === 1 ? "var(--sig-1)" : v === "x" ? "var(--amber)" : "var(--muted)"}>
                  {v === "x" ? "×" : v}
                </text>
                {!compact && (
                  <text x={headW + c * cell + 4} y={headH + r * cell + 11} fontSize={8.5} className="mono" fill="var(--muted)" opacity={0.7}>
                    {m}
                  </text>
                )}
              </g>
            );
          }),
        )}
        <g pointerEvents="none">{groupRects}</g>
      </svg>
    </figure>
  );
}

export function implicantLabel(imp: { value: number; mask: number }, n: number) {
  return implicantPattern(imp, n);
}
