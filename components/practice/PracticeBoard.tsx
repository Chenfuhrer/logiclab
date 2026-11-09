"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_EXERCISES } from "@/content/exercises";
import { CHAPTERS, findLesson } from "@/content/course";
import { ExercisePlayer, LEVEL_TEXT } from "./ExercisePlayer";
import type { Exercise, Level } from "@/lib/exercises/types";
import { useHydrated, useLab } from "@/lib/storage/store";

const KIND_TEXT: Record<Exercise["kind"], string> = { choice: "选择", numeric: "数值", text: "填空", expression: "表达式", kmap: "卡诺图", statetable: "状态表", waveform: "波形" };

export function PracticeBoard() {
  const [chapter, setChapter] = useState("all");
  const [level, setLevel] = useState<Level | "all">("all");
  const [kind, setKind] = useState<Exercise["kind"] | "all">("all");
  const [unseen, setUnseen] = useState(false);
  const [exam, setExam] = useState<{ ids: string[]; end: number } | null>(null);
  const [now, setNow] = useState(0);
  const attempts = useLab((s) => s.attempts);
  const h = useHydrated();
  useEffect(() => {
    if (!exam) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [exam]);
  const list = useMemo(
    () =>
      ALL_EXERCISES.filter((e) => {
        const l = findLesson(e.lesson);
        if (chapter !== "all" && l?.chapter.id !== chapter) return false;
        if (level !== "all" && e.level !== level) return false;
        if (kind !== "all" && e.kind !== kind) return false;
        if (unseen && h && attempts[e.id]) return false;
        return true;
      }),
    [chapter, level, kind, unseen, attempts, h],
  );
  const startExam = () => {
    const pool = ALL_EXERCISES.filter((e) => e.level !== "basic" && (chapter === "all" || findLesson(e.lesson)?.chapter.id === chapter));
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    setExam({ ids: pick.map((e) => e.id), end: Date.now() + 20 * 60 * 1000 });
    setNow(Date.now());
  };
  if (exam) {
    const left = Math.max(0, exam.end - now);
    const exs = exam.ids.map((id) => ALL_EXERCISES.find((e) => e.id === id)!);
    const correct = exs.filter((e) => attempts[e.id]?.correct && (attempts[e.id]?.lastAt ?? 0) >= exam.end - 20 * 60 * 1000).length;
    return (
      <div className="space-y-4">
        <div className="card p-4 flex flex-wrap items-center gap-4 sticky top-16 z-10">
          <span className="eyebrow">限时练习 · 5 题 · 20 分钟</span>
          <span className={`mono text-2xl font-bold ${left < 120000 ? "text-danger" : "text-amber"}`}>
            {String(Math.floor(left / 60000)).padStart(2, "0")}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
          </span>
          <span className="text-sm text-ink-2">本轮已答对 {correct}/5</span>
          {left === 0 && <span className="chip chip-danger">时间到</span>}
          <button className="btn btn-sm ml-auto" onClick={() => setExam(null)}>
            结束
          </button>
        </div>
        {exs.map((e, i) => (
          <ExercisePlayer key={e.id} ex={e} index={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <label className="text-xs text-muted space-y-1">
          <span className="block">章节</span>
          <select className="select" value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="all">全部章节</option>
            {CHAPTERS.filter((c) => c.lessons.some((l) => l.status === "ready")).map((c) => (
              <option key={c.id} value={c.id}>
                第 {c.no} 章 {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted space-y-1">
          <span className="block">层次</span>
          <select className="select" value={level} onChange={(e) => setLevel(e.target.value as Level | "all")}>
            <option value="all">全部</option>
            {(Object.keys(LEVEL_TEXT) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_TEXT[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted space-y-1">
          <span className="block">题型</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Exercise["kind"] | "all")}>
            <option value="all">全部</option>
            {(Object.keys(KIND_TEXT) as Exercise["kind"][]).map((k) => (
              <option key={k} value={k}>
                {KIND_TEXT[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm h-9">
          <input type="checkbox" checked={unseen} onChange={(e) => setUnseen(e.target.checked)} className="accent-[var(--accent)]" />
          只看没做过的
        </label>
        <span className="text-sm text-muted h-9 flex items-center">共 {list.length} 题</span>
        <button className="btn btn-primary ml-auto" onClick={startExam}>
          考试模式：限时 5 题
        </button>
      </div>
      {list.slice(0, 40).map((e, i) => (
        <div key={e.id}>
          <div className="text-xs text-muted mb-1.5">
            {findLesson(e.lesson)?.title} · {KIND_TEXT[e.kind]}
          </div>
          <ExercisePlayer ex={e} index={i} />
        </div>
      ))}
      {list.length > 40 && <p className="text-sm text-muted">只显示前 40 题，请用上方筛选缩小范围。</p>}
    </div>
  );
}
