import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="mx-auto max-w-[1400px] px-5 py-8 flex flex-col md:flex-row gap-6 md:items-center justify-between text-sm text-muted">
        <div className="flex items-center gap-4">
          <Wordmark size={18} />
          <span className="hidden sm:inline">每一个逻辑结论都能被验证。</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/about" className="hover:text-ink">模型与依据</Link>
          <Link href="/learn" className="hover:text-ink">课程目录</Link>
          <Link href="/lab" className="hover:text-ink">实验室</Link>
          <span className="mono text-xs">教学平台 · 非数据手册</span>
        </div>
      </div>
    </footer>
  );
}
