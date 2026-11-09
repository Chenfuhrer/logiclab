"use client";

import Link from "next/link";
import { findLesson, READY_LESSONS, FOCUS_PATH } from "@/content/course";
import { ALL_EXERCISES } from "@/content/exercises";
import { useHydrated, useLab, masteryOf } from "@/lib/storage/store";

/** 首页的个人状态：继续学习、进度、错题复习、掌握情况 */
export function HomeStatus() {
  const h = useHydrated();
  const s = useLab();
  const done = h ? s.done : {};
  const last = h && s.lastLesson ? findLesson(s.lastLesson) : null;
  const nextFocus = FOCUS_PATH.map((id) => findLesson(id)!).find((l) => !done[l.id]);
  const target = last && !done[last.id] ? last : nextFocus ?? READY_LESSONS[0];
  const nDone = READY_LESSONS.filter((l) => done[l.id]).length;
  const wrong = h ? Object.keys(s.wrong).length : 0;
  const attempted = h ? Object.keys(s.attempts).length : 0;
  const weakest = h
    ? READY_LESSONS.map((l) => ({ l, m: masteryOf(ALL_EXERCISES.filter((e) => e.lesson === l.id).map((e) => e.id), s.attempts) }))
        .filter((x) => x.m !== null)
        .sort((a, b) => a.m! - b.m!)
        .slice(0, 3)
    : [];
  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
      <Link href={`/learn/${target.id}`} className="card p-5 group hover:border-accent transition-colors relative overflow-hidden" data-testid="continue">
        <div className="eyebrow">{last && !done[last.id] ? "继续学习" : nDone ? "下一课（重点路径）" : "从这里开始"}</div>
        <div className="mt-2 font-[family-name:var(--font-cjk-serif)] text-2xl font-bold group-hover:text-accent">{target.title}</div>
        <div className="text-sm text-ink-2 mt-1">
          第 {target.chapter.no} 章 · {target.summary}
        </div>
        <span className="absolute right-5 bottom-4 text-3xl text-accent transition-transform group-hover:translate-x-1">→</span>
      </Link>
      <div className="card p-5">
        <div className="eyebrow">学习进度</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="mono text-4xl font-bold">{nDone}</span>
          <span className="text-muted">/ {READY_LESSONS.length} 课时</span>
        </div>
        <div className="mt-3 flex gap-[3px]" aria-hidden>
          {READY_LESSONS.map((l) => (
            <span key={l.id} title={l.title} className={`h-5 flex-1 rounded-[2px] ${done[l.id] ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <div className="text-xs text-muted mt-2">做过 {attempted} 题 · 共 {ALL_EXERCISES.length} 题</div>
      </div>
      <Link href="/review" className="card p-5 hover:border-amber transition-colors">
        <div className="eyebrow">错题复习</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`mono text-4xl font-bold ${wrong ? "text-amber" : ""}`}>{wrong}</span>
          <span className="text-muted">道待复习</span>
        </div>
        {weakest.length > 0 ? (
          <ul className="mt-2 text-xs text-ink-2 space-y-0.5">
            {weakest.map(({ l, m }) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="truncate">{l.title}</span>
                <span className="mono text-muted">{Math.round(m! * 100)}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted mt-2">做题后这里会显示掌握最薄弱的课时。</p>
        )}
      </Link>
    </div>
  );
}
