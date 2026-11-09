"use client";

import { useEffect, type ReactNode } from "react";
import { useHydrated, useLab, type LearnMode } from "@/lib/storage/store";

const MODES: { k: LearnMode; label: string; desc: string }[] = [
  { k: "basic", label: "基础解释", desc: "类比、直观、逐步" },
  { k: "deep", label: "深入推导", desc: "完整推导与工程条件" },
  { k: "exam", label: "考试复习", desc: "题型、步骤、陷阱" },
];

/** 课时外壳：模式切换（通过 data-learn-mode 控制 <Mode> 块）、访问记录、完成标记 */
export function LessonShell({ lesson, children }: { lesson: string; children: ReactNode }) {
  const mode = useLab((s) => s.settings.mode);
  const set = useLab((s) => s.setSetting);
  const visit = useLab((s) => s.visit);
  const h = useHydrated();
  useEffect(() => visit(lesson), [lesson, visit]);
  const m = h ? mode : "basic";
  return (
    <div data-learn-mode={m}>
      <div className="sticky top-14 z-20 -mx-1 px-1 py-2 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur border-b border-line mb-6 flex items-center gap-2 overflow-x-auto thin-scroll">
        <span className="eyebrow shrink-0 mr-1">学习模式</span>
        {MODES.map((x) => (
          <button key={x.k} onClick={() => set("mode", x.k)} className={`btn btn-sm shrink-0 ${m === x.k ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} aria-pressed={m === x.k} title={x.desc}>
            {x.label}
          </button>
        ))}
        <span className="text-xs text-muted ml-2 hidden sm:inline shrink-0">{MODES.find((x) => x.k === m)?.desc}</span>
      </div>
      {children}
    </div>
  );
}

export function DoneButton({ lesson }: { lesson: string }) {
  const done = useLab((s) => s.done[lesson]);
  const mark = useLab((s) => s.markDone);
  const h = useHydrated();
  const isDone = h && Boolean(done);
  return (
    <button className={`btn ${isDone ? "" : "btn-primary"}`} onClick={() => mark(lesson, !isDone)} data-testid="mark-done">
      {isDone ? "✓ 已完成（点击撤销）" : "标记本课为已完成"}
    </button>
  );
}
