"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ALL_LESSONS, FOCUS_PATH } from "@/content/course";
import { useHydrated, useLab } from "@/lib/storage/store";

/**
 * 知识依赖图：按课时的前置关系分层（拓扑深度为列），连线表示“先学 → 后学”。
 * 已完成的课时为实心绿色，重点路径加琥珀色描边，规划中为虚线。
 */
export function KnowledgeMap({ compact = false }: { compact?: boolean }) {
  const done = useLab((s) => s.done);
  const h = useHydrated();
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const depth = new Map<string, number>();
    const d = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!;
      const l = ALL_LESSONS.find((x) => x.id === id);
      const v = l && l.prereqs.length ? Math.max(...l.prereqs.map(d)) + 1 : 0;
      depth.set(id, v);
      return v;
    };
    ALL_LESSONS.forEach((l) => d(l.id));
    const cols = new Map<number, string[]>();
    for (const l of ALL_LESSONS) cols.set(depth.get(l.id)!, [...(cols.get(depth.get(l.id)!) ?? []), l.id]);
    const colW = compact ? 132 : 150;
    const rowH = compact ? 40 : 46;
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    for (const [c, ids] of cols) {
      // 同列按章节排序
      ids.sort((a, b) => ALL_LESSONS.findIndex((x) => x.id === a) - ALL_LESSONS.findIndex((x) => x.id === b));
      ids.forEach((id, r) => pos.set(id, { x: 12 + c * colW, y: 16 + r * rowH }));
      maxRows = Math.max(maxRows, ids.length);
    }
    return { pos, W: 12 + cols.size * colW, H: 24 + maxRows * rowH, colW };
  }, [compact]);
  const nodeW = layout.colW - 22;
  const related = (id: string) => {
    if (!hover) return true;
    if (id === hover) return true;
    const l = ALL_LESSONS.find((x) => x.id === hover)!;
    return l.prereqs.includes(id) || ALL_LESSONS.find((x) => x.id === id)!.prereqs.includes(hover);
  };
  return (
    <div className="overflow-x-auto thin-scroll">
      <svg width={layout.W} height={layout.H} role="img" aria-label="课程知识依赖图">
        {ALL_LESSONS.flatMap((l) =>
          l.prereqs.map((p) => {
            const a = layout.pos.get(p)!;
            const b = layout.pos.get(l.id)!;
            const on = hover && (hover === l.id || hover === p);
            const focus = FOCUS_PATH.includes(p) && FOCUS_PATH.includes(l.id);
            return (
              <path
                key={`${p}-${l.id}`}
                d={`M${a.x + nodeW} ${a.y + 14} C${a.x + nodeW + 30} ${a.y + 14} ${b.x - 30} ${b.y + 14} ${b.x} ${b.y + 14}`}
                fill="none"
                stroke={on ? "var(--amber)" : focus ? "color-mix(in srgb, var(--amber) 45%, transparent)" : "var(--line-2)"}
                strokeWidth={on ? 2 : 1.2}
              />
            );
          }),
        )}
        {ALL_LESSONS.map((l) => {
          const p = layout.pos.get(l.id)!;
          const isDone = h && done[l.id];
          const planned = l.status === "planned";
          const focus = FOCUS_PATH.includes(l.id);
          return (
            <Link key={l.id} href={`/learn/${l.id}`} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}>
              <g opacity={related(l.id) ? 1 : 0.3} style={{ transition: "opacity .15s" }}>
                <rect x={p.x} y={p.y} width={nodeW} height={28} rx={7} fill={isDone ? "var(--accent)" : "var(--panel)"} stroke={focus ? "var(--amber)" : "var(--line-2)"} strokeDasharray={planned ? "4 3" : undefined} />
                <text x={p.x + 8} y={p.y + 18} fontSize={11.5} fill={isDone ? "var(--accent-ink)" : planned ? "var(--muted)" : "var(--ink)"}>
                  {l.title.length > 9 ? l.title.slice(0, 9) + "…" : l.title}
                </text>
                <title>{`${l.title}（第 ${l.chapter.no} 章${planned ? "，规划中" : ""}）`}</title>
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
