import type { Metadata } from "next";
import Link from "next/link";
import { EXPERIMENTS } from "@/content/course";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "实验室" };

const GLYPH: Record<string, string> = {
  "jk-counter": "M4 34 H14 V10 H28 V34 H42 V10 H56 V34 H70",
  ls161: "M4 34 H20 V22 H36 V10 H52 V34 H70",
  "fsm-designer": "M14 22 a8 8 0 1 0 0.1 0 M50 22 a8 8 0 1 0 0.1 0 M22 18 Q36 6 42 18 M42 26 Q36 38 22 26",
  logic: "M6 10 H30 A12 12 0 0 1 30 34 H6 Z M42 22 H70",
  sandbox: "M8 8 H26 V26 H8 Z M44 18 H62 V36 H44 Z M26 17 H35 V27 H44",
  timer555: "M4 34 Q14 8 24 14 L24 34 Q34 8 44 14 L44 34 Q54 8 64 14 L64 34",
};

export default function LabIndex() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验室" title="每一个结论，都可以拿到电路上去验证">
        所有实验共用同一个仿真引擎和同一种网表格式：方程、状态表、波形都是从电路计算出来的，不是预先画好的动画。
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {EXPERIMENTS.map((e, i) => (
          <Link key={e.id} href={e.href} className="card p-6 group hover:border-accent transition-colors flex gap-5">
            <svg width="74" height="44" viewBox="0 0 74 44" className="shrink-0 mt-1" aria-hidden>
              <path d={GLYPH[e.id]} fill="none" stroke={i < 4 ? "var(--amber)" : "var(--accent)"} strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            <div>
              <h2 className="font-semibold text-lg group-hover:text-accent">{e.title}</h2>
              <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{e.summary}</p>
            </div>
          </Link>
        ))}
      </div>
      <section className="mt-10 card p-5 text-sm leading-relaxed text-ink-2 space-y-2">
        <div className="eyebrow">仿真模型说明</div>
        <p>
          <strong className="text-ink">模型 A/B（理想 + 四值）</strong>：零延迟，取值 0/1/X/Z；同一时刻内的事件用 delta 周期区分先后。同一时钟沿上所有触发器“先统一采样、再统一更新”。
        </p>
        <p>
          <strong className="text-ink">模型 C（事件驱动 + 传输延迟）</strong>：每个元件按 tpd 延迟输出，采用传输延迟（不吞窄脉冲），用于观察竞争冒险、纹波延迟、异步清零瞬态与建立/保持时间违例。默认延迟为教学示意值。
        </p>
        <p>
          模型 D（电平/噪声容限/扇出）与模型 E（555、RC 充放电等模拟近似，界面标注“教学近似模型”）用于第 3、7 章。详见 <Link href="/about" className="text-accent underline">模型与依据</Link>。
        </p>
      </section>
    </main>
  );
}
