"use client";

import Link from "next/link";
import { ALL_EXERCISES } from "@/content/exercises";
import { READY_LESSONS } from "@/content/course";
import { useHydrated, useLab, masteryOf, type ErrorCategory } from "@/lib/storage/store";
import { ExercisePlayer } from "./ExercisePlayer";

const CAT: Record<ErrorCategory, string> = { concept: "概念", calculation: "计算", "not-minimal": "未化到最简", syntax: "书写格式", timing: "时序/波形", state: "状态推导" };

export function ReviewBoard() {
  const h = useHydrated();
  const s = useLab();
  if (!h) return <div className="card p-6 text-sm text-muted">读取本地学习记录…</div>;
  const attempted = Object.keys(s.attempts).length;
  const correct = Object.values(s.attempts).filter((a) => a.correct).length;
  const wrongIds = Object.keys(s.wrong).filter((id) => ALL_EXERCISES.some((e) => e.id === id));
  const cats = new Map<ErrorCategory, number>();
  Object.values(s.attempts).forEach((a) => a.categories.forEach((c) => cats.set(c, (cats.get(c) ?? 0) + 1)));
  const lessonStats = READY_LESSONS.map((l) => {
    const ids = ALL_EXERCISES.filter((e) => e.lesson === l.id).map((e) => e.id);
    return { l, m: masteryOf(ids, s.attempts), n: ids.length, done: Boolean(s.done[l.id]) };
  });
  const plan = lessonStats.filter((x) => (x.m !== null && x.m < 0.6) || (x.done && x.m === null)).slice(0, 6);
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["已完成课时", `${READY_LESSONS.filter((l) => s.done[l.id]).length}/${READY_LESSONS.length}`],
          ["做过的题", `${attempted}/${ALL_EXERCISES.length}`],
          ["正确率", attempted ? `${Math.round((correct / attempted) * 100)}%` : "—"],
          ["错题本", String(wrongIds.length)],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="mono text-2xl font-bold mt-1">{v}</div>
          </div>
        ))}
      </section>
      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <div className="card p-5">
          <h2 className="font-[family-name:var(--font-cjk-serif)] font-bold mb-3">各课时掌握度</h2>
          <ul className="space-y-1.5 text-sm">
            {lessonStats.map(({ l, m, done }) => (
              <li key={l.id} className="grid grid-cols-[1fr_120px_40px] items-center gap-3">
                <Link href={`/learn/${l.id}`} className="truncate hover:text-accent">
                  {done && <span className="text-accent mr-1">✓</span>}
                  {l.title}
                </Link>
                <div className="h-1.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full" style={{ width: `${(m ?? 0) * 100}%`, background: m !== null && m < 0.6 ? "var(--amber)" : "var(--accent)" }} />
                </div>
                <span className="mono text-xs text-muted text-right">{m === null ? "—" : `${Math.round(m * 100)}`}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-3">掌握度 = 该课时题目中首次做对计 1、多次后做对计 0.7、未做对计 0.1，除以题目总数。</p>
        </div>
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-[family-name:var(--font-cjk-serif)] font-bold mb-3">复习计划</h2>
            {plan.length ? (
              <ol className="space-y-2 text-sm">
                {plan.map(({ l, m }) => (
                  <li key={l.id} className="flex gap-2">
                    <span className="text-amber">●</span>
                    <span>
                      <Link href={`/learn/${l.id}`} className="hover:text-accent">
                        {l.title}
                      </Link>
                      <span className="text-muted text-xs ml-2">{m === null ? "已学但还没做题" : `掌握度 ${Math.round(m * 100)}%，建议重做本课练习`}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">暂时没有需要复习的课时。先去学一课、做几道题吧。</p>
            )}
          </div>
          <div className="card p-5">
            <h2 className="font-[family-name:var(--font-cjk-serif)] font-bold mb-3">错误类型</h2>
            {cats.size ? (
              <ul className="flex flex-wrap gap-2">
                {[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <li key={c} className="chip chip-amber">
                    {CAT[c]} × {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">还没有错误记录。</p>
            )}
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold">错题本</h2>
          <span className="text-xs text-muted">连续答对两次自动移出</span>
          {attempted > 0 && (
            <button className="btn btn-sm btn-ghost ml-auto text-danger" onClick={() => confirm("清空全部本地学习记录（进度、做题记录、错题本）？此操作不可撤销。") && s.reset()}>
              清空学习记录
            </button>
          )}
        </div>
        {wrongIds.length === 0 ? (
          <p className="card p-5 text-sm text-muted">错题本是空的。</p>
        ) : (
          wrongIds.map((id, i) => {
            const ex = ALL_EXERCISES.find((e) => e.id === id)!;
            return (
              <div key={id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{READY_LESSONS.find((l) => l.id === ex.lesson)?.title}</span>
                  <button className="ml-auto hover:text-ink" onClick={() => s.removeWrong(id)}>
                    移出错题本
                  </button>
                </div>
                <ExercisePlayer ex={ex} index={i} />
              </div>
            );
          })
        )}
      </section>
      <p className="text-xs text-muted">学习记录保存在本浏览器的 localStorage 中（键名 logiclab-v1），不会上传到任何服务器。</p>
    </div>
  );
}
