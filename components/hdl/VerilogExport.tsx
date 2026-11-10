"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DRAFT_KEY } from "./HdlCompare";

/** 电路 / 设计结果的 Verilog 导出面板：查看、复制、下载、送到 Verilog 实验台运行 */
export function VerilogExport({ variants, note }: { variants: { label: string; code: string; file: string }[]; note?: string }) {
  const router = useRouter();
  const [k, setK] = useState(0);
  const [copied, setCopied] = useState(false);
  const v = variants[Math.min(k, variants.length - 1)];
  if (!v) return null;
  return (
    <details className="card p-4 group">
      <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold">
        <span className="mono text-accent">{"</>"}</span> Verilog 描述
        <span className="text-xs text-muted font-normal">由当前电路自动生成，可在实验 E 中运行并与电路仿真对照</span>
        <span className="ml-auto text-muted group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1 items-center">
          {variants.length > 1 &&
            variants.map((x, i) => (
              <button key={x.label} className={`btn btn-sm ${i === k ? "!border-accent !text-accent" : "btn-ghost"}`} onClick={() => setK(i)}>
                {x.label}
              </button>
            ))}
          <span className="ml-auto flex gap-1">
            <button
              className="btn btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(v.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "已复制" : "复制"}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([v.code], { type: "text/plain" }));
                a.download = v.file;
                a.click();
              }}
            >
              下载 .v
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                localStorage.setItem(DRAFT_KEY, v.code);
                router.push("/lab/verilog?draft=1");
              }}
            >
              在实验台中运行 →
            </button>
          </span>
        </div>
        <pre className="card-inset p-3 text-[12px] leading-[1.55] overflow-auto thin-scroll max-h-[360px] mono">{v.code}</pre>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </details>
  );
}
