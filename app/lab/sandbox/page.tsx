import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Sandbox } from "@/components/lab/Sandbox";

export const metadata: Metadata = { title: "自由电路实验台" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="实验室 · 自由编辑" title="自由电路实验台" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/sandbox", label: "自由实验台" }]}>
        从元件库搭电路，四值逻辑实时仿真。若电路是“边沿触发器 + 门电路 + 同一时钟”的同步电路，右侧会自动给出驱动方程、状态方程与状态表；否则明确提示不支持符号分析，但仍可仿真。电路自动保存在本浏览器中，也可导出为 JSON 网表。
      </PageHeader>
      <Sandbox />
    </main>
  );
}
