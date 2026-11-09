"use client";

import Link from "next/link";
import { CHAPTERS } from "@/content/course";
import { useHydrated, useLab } from "@/lib/storage/store";

/** 左侧课程导航树 */
export function CourseTree({ current }: { current?: string }) {
  const done = useLab((s) => s.done);
  const h = useHydrated();
  return (
    <nav aria-label="课程目录" className="text-sm space-y-4">
      {CHAPTERS.map((c) => {
        const open = c.lessons.some((l) => l.id === current) || c.focus;
        return (
          <details key={c.id} open={open} className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 py-1 text-ink-2 hover:text-ink">
              <span className="mono text-[11px] text-muted w-5">{String(c.no).padStart(2, "0")}</span>
              <span className="font-medium">{c.title}</span>
              {c.focus && <span className="chip chip-amber !h-4 !text-[10px]">重点</span>}
            </summary>
            <ul className="mt-1 ml-[1.15rem] border-l border-line">
              {c.lessons.map((l) => {
                const active = l.id === current;
                const isDone = h && done[l.id];
                return (
                  <li key={l.id}>
                    <Link href={`/learn/${l.id}`} className={`flex items-center gap-2 pl-3 py-1.5 -ml-px border-l transition-colors ${active ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"} ${l.status === "planned" ? "opacity-55" : ""}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-accent" : l.status === "planned" ? "bg-transparent border border-muted" : "bg-line-2"}`} />
                      <span className="truncate">{l.title}</span>
                      {l.status === "planned" && <span className="text-[10px] text-muted ml-auto pr-1">规划中</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
