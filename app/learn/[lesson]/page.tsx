import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ALL_LESSONS, findLesson, EXPERIMENTS } from "@/content/course";
import { KNOWLEDGE } from "@/content/knowledge";
import { LESSON_LOADERS } from "@/content/lessons.generated";
import { CourseTree } from "@/components/course/CourseTree";
import { LessonShell, DoneButton } from "@/components/course/LessonShell";
import { LessonAside } from "@/components/course/LessonAside";

export function generateStaticParams() {
  return ALL_LESSONS.map((l) => ({ lesson: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[lesson]">): Promise<Metadata> {
  const { lesson } = await params;
  const l = findLesson(lesson);
  return { title: l ? l.title : "课程" };
}

export default async function LessonPage({ params }: PageProps<"/learn/[lesson]">) {
  const { lesson } = await params;
  const l = findLesson(lesson);
  if (!l) notFound();
  const idx = ALL_LESSONS.findIndex((x) => x.id === l.id);
  const prev = ALL_LESSONS.slice(0, idx).reverse().find((x) => x.status === "ready");
  const next = ALL_LESSONS.slice(idx + 1).find((x) => x.status === "ready");
  const loader = l.status === "ready" ? LESSON_LOADERS[l.id] : undefined;
  const Content = loader ? (await loader()).default : null;
  const knowledge = KNOWLEDGE.filter((k) => l.knowledge.includes(k.id));
  const prereqs = l.prereqs.map((p) => findLesson(p)).filter(Boolean);
  const followers = ALL_LESSONS.filter((x) => x.prereqs.includes(l.id));
  const exps = EXPERIMENTS.filter((e) => l.experiments?.includes(e.id));
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-6 grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_240px]">
      <aside className="hidden lg:block sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto thin-scroll pr-2">
        <CourseTree current={l.id} />
      </aside>
      <article className="min-w-0 max-w-[820px]">
        <header className="mb-4">
          <div className="eyebrow mb-2">
            第 {l.chapter.no} 章 · {l.chapter.title} {l.minutes ? `· 约 ${l.minutes} 分钟` : ""}
          </div>
          <h1 className="font-[family-name:var(--font-cjk-serif)] text-3xl sm:text-4xl font-black tracking-tight leading-tight">{l.title}</h1>
          <p className="mt-3 text-ink-2 text-[15px] leading-relaxed">{l.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {prereqs.length > 0 && <span className="text-muted self-center">前置：</span>}
            {prereqs.map((p) => (
              <Link key={p!.id} href={`/learn/${p!.id}`} className="chip hover:border-accent">
                {p!.title}
              </Link>
            ))}
            {exps.map((e) => (
              <Link key={e.id} href={e.href} className="chip chip-amber">
                {e.title.split(" · ")[0]} →
              </Link>
            ))}
          </div>
        </header>
        {Content ? (
          <LessonShell lesson={l.id}>
            <div className="prose-lab">
              <Content />
            </div>
            <div className="mt-12 card p-5 flex flex-wrap gap-3 items-center">
              <DoneButton lesson={l.id} />
              {followers.length > 0 && (
                <span className="text-sm text-ink-2">
                  接下来可以学：
                  {followers.map((f, i) => (
                    <span key={f.id}>
                      {i > 0 && "、"}
                      <Link href={`/learn/${f.id}`} className="text-accent hover:underline">
                        {f.title}
                      </Link>
                    </span>
                  ))}
                </span>
              )}
            </div>
          </LessonShell>
        ) : (
          <PlannedLesson chapterOutline={l.chapter.outline} />
        )}
        <nav className="mt-8 flex justify-between gap-4 text-sm">
          {prev ? (
            <Link href={`/learn/${prev.id}`} className="card px-4 py-3 hover:border-accent max-w-[48%]">
              <div className="text-xs text-muted">← 上一课</div>
              <div className="truncate">{prev.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/learn/${next.id}`} className="card px-4 py-3 hover:border-accent text-right max-w-[48%] ml-auto">
              <div className="text-xs text-muted">下一课 →</div>
              <div className="truncate">{next.title}</div>
            </Link>
          )}
        </nav>
      </article>
      <aside className="hidden xl:block sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto thin-scroll">{Content && <LessonAside knowledge={knowledge} />}</aside>
    </main>
  );
}

function PlannedLesson({ chapterOutline }: { chapterOutline: string[] }) {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="chip">规划中</span>
        <span className="text-sm text-ink-2">本课时尚未编写正文，也没有交互实验——这里不放占位内容。</span>
      </div>
      <div>
        <div className="eyebrow mb-2">本章计划覆盖的知识点</div>
        <ul className="grid sm:grid-cols-2 gap-1.5 text-sm">
          {chapterOutline.map((o) => (
            <li key={o} className="flex gap-2 items-center text-ink-2">
              <span className="w-1.5 h-1.5 rounded-full border border-muted" />
              {o}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted">开发顺序见“模型与依据”页与 docs/implementation-plan.md。已完成的重点内容在第 2、5、6 章。</p>
    </div>
  );
}
