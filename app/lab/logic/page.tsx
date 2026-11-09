import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExprLab, KMapLab } from "@/components/course/widgets/LogicWidgets";

export const metadata: Metadata = { title: "逻辑工作台" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-5 py-8 space-y-8">
      <PageHeader eyebrow="工具 · 逻辑求解器" title="逻辑工作台" crumbs={[{ href: "/lab", label: "实验室" }, { href: "/lab/logic", label: "逻辑工作台" }]}>
        表达式 ↔ 真值表 ↔ 卡诺图 ↔ 逻辑图。化简使用 Quine–McCluskey + Petrick 方法，给出全部最简解；等价验证在 16 个变量以内穷举真值表，更多变量用 ROBDD。
      </PageHeader>
      <ExprLab initial="A'B'C + A'BC + AB'C + ABC' + ABC" full />
      <div>
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-lg font-bold mb-1">卡诺图画圈练习</h2>
        <p className="text-sm text-muted">切换到“改取值”可以编辑任意 2～5 变量函数（含无关项）。</p>
        <KMapLab vars={["A", "B", "C", "D"]} minterms={[0, 2, 5, 7, 8, 10, 13, 15]} dontCares={[6]} />
      </div>
    </main>
  );
}
