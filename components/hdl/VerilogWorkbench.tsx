"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { VerilogLab } from "./VerilogLab";
import { HdlCompare, DRAFT_KEY } from "./HdlCompare";

export function VerilogWorkbench() {
  const q = useSearchParams();
  const draft = q.get("draft") === "1" && typeof window !== "undefined" ? localStorage.getItem(DRAFT_KEY) : null;
  const [tab, setTab] = useState<"lab" | "compare">(q.get("tab") === "compare" ? "compare" : "lab");
  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="tablist">
        <button role="tab" aria-selected={tab === "lab"} className={`btn ${tab === "lab" ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setTab("lab")}>
          Verilog 实验台
        </button>
        <button role="tab" aria-selected={tab === "compare"} className={`btn ${tab === "compare" ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setTab("compare")}>
          电路 ↔ Verilog 对照
        </button>
      </div>
      {tab === "lab" ? <VerilogLab key={draft ?? "ex"} initialCode={draft ?? undefined} /> : <HdlCompare />}
    </div>
  );
}
