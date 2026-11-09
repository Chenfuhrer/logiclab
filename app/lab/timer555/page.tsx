import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Timer555Lab } from "@/components/widgets/Timer555Lab";

export const metadata: Metadata = { title: "555 定时器实验" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验室 · 第 7 章 · 模型 E" title="555 定时器：施密特、单稳态与多谐振荡" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/timer555", label: "555 定时器" }]}>
        两个比较器、一个锁存器、一个放电管，加上 RC 的指数充放电，就能做出整形、定时和振荡三种电路。这里的波形来自教学近似模型（理想比较器与放电管），计算公式与仿真在单元测试中相互校核。
      </PageHeader>
      <Timer555Lab mode="astable" />
    </main>
  );
}
