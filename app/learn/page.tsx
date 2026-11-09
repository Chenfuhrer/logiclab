import type { Metadata } from "next";
import Link from "next/link";
import { CHAPTERS, FOCUS_PATH, findLesson } from "@/content/course";
import { PageHeader } from "@/components/layout/PageHeader";
import { KnowledgeMap } from "@/components/course/KnowledgeMap";
import { ChapterProgress } from "@/components/course/ChapterProgress";

export const metadata: Metadata = { title: "课程目录" };

export default function LearnIndex() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8 space-y-10">
      <PageHeader eyebrow="课程 · 11 章" title="从 0 和 1，到会设计状态机">
        章节顺序按通行教材体系组织（本地资料中没有数字电路大纲，详见“模型与依据”）。第 6 章“时序逻辑电路”是本平台的最高优先级内容；下方的金色路径是为零基础同学准备的前置学习路线。
      </PageHeader>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline gap-3 mb-4">
          <h2 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold">重点前置路径</h2>
          <span className="text-sm text-muted">逻辑代数 → 卡诺图 → 触发器 → 状态方程 → 同步计数器分析 → 同步时序设计</span>
        </div>
        <ol className="flex flex-wrap items-center gap-y-3 text-sm">
          {FOCUS_PATH.map((id, i) => {
            const l = findLesson(id)!;
            return (
              <li key={id} className="flex items-center">
                <Link href={`/learn/${id}`} className="chip chip-amber !h-7 !px-3 hover:!bg-[var(--amber)] hover:!text-[#1a1200]">
                  <span className="mono opacity-70">{String(i + 1).padStart(2, "0")}</span> {l.title}
                </Link>
                {i < FOCUS_PATH.length - 1 && <span className="mx-1.5 text-muted">→</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold mb-3">知识依赖图</h2>
        <div className="card p-4">
          <KnowledgeMap />
          <p className="text-xs text-muted mt-3">每列是一层“前置深度”；悬停一个课时可高亮它的前置与后续。实心绿色 = 已完成，虚线框 = 规划中。</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CHAPTERS.map((c) => {
          const ready = c.lessons.filter((l) => l.status === "ready");
          return (
            <article key={c.id} className={`card p-5 flex flex-col ${c.focus ? "ring-1 ring-[var(--amber)]" : ""}`}>
              <div className="flex items-baseline gap-3">
                <span className="mono text-3xl font-bold text-line-2">{String(c.no).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h3 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold">{c.title}</h3>
                  <div className="text-xs text-muted italic font-serif">{c.en}</div>
                </div>
                {c.focus && <span className="chip chip-amber ml-auto">最高优先级</span>}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                {c.lessons.map((l) => (
                  <li key={l.id}>
                    <Link href={`/learn/${l.id}`} className={`flex gap-2 items-baseline hover:text-accent ${l.status === "planned" ? "text-muted" : "text-ink"}`}>
                      <span className="text-accent">›</span>
                      {l.title}
                      {l.status === "planned" && <span className="chip !h-4 !text-[10px]">规划中</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-line">
                {ready.length ? <ChapterProgress ids={ready.map((l) => l.id)} /> : <p className="text-xs text-muted">本章提纲：{c.outline.slice(0, 4).join("、")}……</p>}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
