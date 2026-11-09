import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PracticeBoard } from "@/components/practice/PracticeBoard";
import { ALL_EXERCISES } from "@/content/exercises";

export const metadata: Metadata = { title: "练习" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[980px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow={`练习 · ${ALL_EXERCISES.length} 题`} title="分层练习与自动判分">
        表达式题按逻辑等价判对错（不比较字符串），卡诺图题检查逻辑正确性与最简程度，状态表逐状态检查，波形题逐个时钟沿用仿真引擎比对。答错时先给提示，不直接给答案；做错的题自动进入错题本。
      </PageHeader>
      <PracticeBoard />
    </main>
  );
}
