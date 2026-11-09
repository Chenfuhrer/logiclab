import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { JKCounterLab } from "@/components/lab/JKCounterLab";
import { Tex } from "@/components/ui/Tex";

export const metadata: Metadata = { title: "实验 A · 同步三位二进制加法计数器" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验 A · 同步时序电路分析" title="同步三位二进制加法计数器" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/jk-counter", label: "实验 A" }]}>
        三个下降沿触发的 JK 触发器共用时钟 CP。默认接法 <Tex>{"J_0=K_0=1,\\ J_1=K_1=Q_0,\\ J_2=K_2=Q_0Q_1"}</Tex>，进位 <Tex>{"C=Q_0Q_1Q_2"}</Tex>。下方的方程、状态表和状态图都是<strong className="text-ink">从当前网表自动提取并计算</strong>的；改动任意一个 J/K 的接法，它们会随之重新推导，并与仿真结果逐拍比对。
      </PageHeader>
      <JKCounterLab />
    </main>
  );
}
