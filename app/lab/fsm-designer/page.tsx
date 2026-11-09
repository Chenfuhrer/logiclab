import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DesignerFromQuery } from "@/components/lab/DesignerFromQuery";

export const metadata: Metadata = { title: "实验 C · 同步时序逻辑设计向导" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验 C · 同步时序逻辑设计" title="同步时序逻辑设计向导" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/fsm-designer", label: "实验 C" }]}>
        从序列检测器模板或自己的状态表出发，13 个步骤全部自动推导并可检查：隐含表化简、编码、次态与激励卡诺图、驱动方程、自启动检查，最后把生成的门级电路放进仿真引擎，与原始状态表逐拍比对。
      </PageHeader>
      <Suspense fallback={<div className="card p-6 text-sm text-muted">加载设计向导…</div>}>
        <DesignerFromQuery />
      </Suspense>
    </main>
  );
}
