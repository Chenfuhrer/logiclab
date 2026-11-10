import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { VerilogWorkbench } from "@/components/hdl/VerilogWorkbench";

export const metadata: Metadata = { title: "实验 E · Verilog 对照实验台" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验 E · HDL 对照学习" title="电路图、状态表与 Verilog，同一个电路的三种写法" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/verilog", label: "实验 E" }]}>
        左边写 Verilog，右边立刻看到波形；或者把实验 A/B/C 的电路一键导出成 Verilog，与电路仿真逐拍对照。这里运行代码的是平台自带的<strong className="text-ink">教学用 Verilog 子集解释器</strong>，不是完整的 HDL 仿真器——需要完整语言特性时，请下载 .v 与自检 Testbench 到 iverilog 等工具中运行。
      </PageHeader>
      <Suspense fallback={<div className="card p-6 text-sm text-muted">加载实验台…</div>}>
        <VerilogWorkbench />
      </Suspense>
    </main>
  );
}
