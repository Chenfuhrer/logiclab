import Link from "next/link";
import { CHAPTERS, EXPERIMENTS } from "@/content/course";
import { LiveScope } from "@/components/home/LiveScope";
import { HomeStatus } from "@/components/home/HomeStatus";
import { Reveal } from "@/components/home/Reveal";
import { Tex } from "@/components/ui/Tex";

const TITLE_1 = "让逻辑";
const TITLE_2 = ["看", "得", "见"];
const TITLE_3 = ["验", "得", "出"];

/** 标题里的每个字像一个比特一样“翻转”出现（CSS keyframes，逐字延迟） */
function Bits({ chars, start, className = "" }: { chars: string[]; start: number; className?: string }) {
  return (
    <>
      {chars.map((c, i) => (
        <span key={i} className={`bit-letter inline-block ${className}`} style={{ animation: `bitflip .55s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${start + i * 90}ms` }}>
          {c}
        </span>
      ))}
    </>
  );
}

export default function Home() {
  return (
    <main className="w-full">
      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] px-4 sm:px-5 pt-14 pb-16 lg:pt-20 lg:pb-24 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <span className="inline-block w-6 h-px bg-accent" />
              LogicLab · Interactive Digital Electronics Laboratory
            </div>
            <h1 className="mt-6 font-[family-name:var(--font-cjk-serif)] font-black leading-[1.08] tracking-tight text-[clamp(2.4rem,6vw,5.2rem)]">
              <span className="block">
                <Bits chars={[...TITLE_1]} start={80} />
              </span>
              <span className="block whitespace-nowrap">
                <span className="relative inline-block">
                  <Bits chars={TITLE_2} start={420} className="text-accent" />
                  <svg className="absolute left-0 -bottom-[0.12em] w-full h-[0.28em]" viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden>
                    <path d="M0 11 H18 V3 H38 V11 H58 V3 H78 V11 H98 V3 H120" fill="none" stroke="var(--accent)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" style={{ strokeDasharray: 400, ["--len" as string]: 400, animation: "trace-draw 1.2s .75s cubic-bezier(.4,0,.2,1) both" }} />
                  </svg>
                </span>
                <Bits chars={["，"]} start={700} />
                <Bits chars={TITLE_3} start={820} className="text-amber" />
                <Bits chars={["。"]} start={1100} />
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-[1.85] text-ink-2 reveal is-in" style={{ ["--d" as string]: "1150ms" }}>
              一个为电子信息类本科生做的数字电子技术实验室：每一个逻辑结论都能被验证，每一个状态变化都能被观察，每一个电路设计都能通过实验检验。
            </p>
            <div className="mt-8 flex flex-wrap gap-3 reveal is-in" style={{ ["--d" as string]: "1300ms" }}>
              <Link href="/learn/sync-analysis" className="btn btn-primary !h-11 !px-5 !text-[15px]">
                从同步时序电路开始 →
              </Link>
              <Link href="/learn" className="btn !h-11 !px-5 !text-[15px]">
                浏览 11 章课程
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted reveal is-in" style={{ ["--d" as string]: "1450ms" }}>
              <span>
                <Tex>{"Q^{n+1} = J\\overline{Q^n} + \\overline{K}Q^n"}</Tex>
              </span>
              <span className="mono">65536 个四变量函数 · 化简全部验证</span>
            </div>
          </div>
          <div className="reveal is-in" style={{ ["--d" as string]: "500ms" }}>
            <LiveScope />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-4 sm:px-5 py-12 space-y-16">
        <Reveal>
          <HomeStatus />
        </Reveal>

        {/* 三条原则 */}
        <section className="grid gap-px bg-line border border-line rounded-2xl overflow-hidden md:grid-cols-3">
          {[
            ["验证", "VERIFY", "化简结果、推导的每一步、学生答案，都由求解器做逻辑等价验证，而不是比对字符串。"],
            ["观察", "OBSERVE", "四值逻辑、delta 周期与传输延迟：异步清零的瞬态、冒险毛刺、纹波延迟都能在波形上看到。"],
            ["实验", "EXPERIMENT", "同一份网表驱动电路图、仿真、状态机分析和判分。改一根线，方程与状态图随之重新推导。"],
          ].map(([zh, en, d], i) => (
            <Reveal key={en} delay={i * 120} className="bg-panel p-6">
              <div className="flex items-baseline gap-3">
                <span className="font-[family-name:var(--font-cjk-serif)] text-2xl font-black">{zh}</span>
                <span className="font-serif italic text-muted">{en.toLowerCase()}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{d}</p>
            </Reveal>
          ))}
        </section>

        {/* 推荐实验 */}
        <section>
          <div className="flex items-baseline gap-4 mb-5">
            <h2 className="font-[family-name:var(--font-cjk-serif)] text-2xl font-black">推荐实验</h2>
            <Link href="/lab" className="text-sm text-accent hover:underline">
              全部实验 →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {EXPERIMENTS.slice(0, 3).map((e, i) => (
              <Reveal key={e.id} delay={i * 100}>
                <Link href={e.href} className="card p-5 h-full block group hover:border-amber transition-colors">
                  <div className="mono text-xs text-amber">{["A", "B", "C"][i]}</div>
                  <div className="mt-1 font-semibold group-hover:text-amber">{e.title.split(" · ")[1]}</div>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">{e.summary}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 课程目录 */}
        <section>
          <div className="flex items-baseline gap-4 mb-5">
            <h2 className="font-[family-name:var(--font-cjk-serif)] text-2xl font-black">课程目录</h2>
            <Link href="/learn" className="text-sm text-accent hover:underline">
              知识依赖图 →
            </Link>
          </div>
          <ol className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {CHAPTERS.map((c, i) => {
              const ready = c.lessons.filter((l) => l.status === "ready").length;
              return (
                <Reveal as="li" key={c.id} delay={(i % 3) * 80}>
                  <Link href={ready ? `/learn/${c.lessons[0].id}` : `/learn/${c.lessons[0].id}`} className="flex items-baseline gap-4 py-3.5 border-b border-line group">
                    <span className={`mono text-sm ${c.focus ? "text-amber" : "text-muted"}`}>{String(c.no).padStart(2, "0")}</span>
                    <span className={`font-[family-name:var(--font-cjk-serif)] text-[17px] font-bold group-hover:text-accent ${ready ? "" : "text-muted"}`}>{c.title}</span>
                    <span className="ml-auto text-xs text-muted">{ready ? `${ready} 课时` : "规划中"}</span>
                  </Link>
                </Reveal>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
