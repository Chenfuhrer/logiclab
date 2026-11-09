import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { LS161Lab } from "@/components/lab/LS161Lab";

export const metadata: Metadata = { title: "实验 B · 74LS161 任意进制计数器" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验 B · 计数器" title="74LS161 任意进制计数器" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/ls161", label: "实验 B" }]}>
        选择目标模数 N 与设计方法，平台自动生成反馈译码电路，并<strong className="text-ink">用仿真测出实际模数</strong>。注意观察异步清零法中“状态 N”只是一个瞬态，而同步置数法没有瞬态。
      </PageHeader>
      <LS161Lab />
    </main>
  );
}
