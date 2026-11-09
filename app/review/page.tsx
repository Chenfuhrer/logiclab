import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReviewBoard } from "@/components/practice/ReviewBoard";

export const metadata: Metadata = { title: "复习" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-5 py-8">
      <PageHeader eyebrow="复习" title="学习进度、掌握度与错题本" />
      <ReviewBoard />
    </main>
  );
}
