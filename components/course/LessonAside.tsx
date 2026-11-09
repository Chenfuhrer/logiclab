"use client";

import { useEffect, useState } from "react";
import { Tex } from "@/components/ui/Tex";
import type { KnowledgeNode } from "@/content/knowledge";

const SECTIONS = ["学习目标", "前置知识", "实际问题", "直观解释", "基本原理", "电路结构", "逻辑推导", "交互实验", "典型例题", "分层练习", "常见错误", "知识总结", "后续知识关联"];

/** 右侧栏：知识目录（滚动高亮）+ 公式速查 */
export function LessonAside({ knowledge }: { knowledge: KnowledgeNode[] }) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const formulas = knowledge.flatMap((k) => (k.formulas ?? []).map((f) => ({ f, k: k.name })));
  return (
    <div className="space-y-6 text-sm">
      <div>
        <div className="eyebrow mb-2">本课目录</div>
        <ul className="space-y-0.5 border-l border-line">
          {SECTIONS.map((s, i) => (
            <li key={s}>
              <a href={`#${s}`} className={`block pl-3 py-0.5 -ml-px border-l ${active === s ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
                <span className="mono text-[10px] mr-1.5">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </a>
            </li>
          ))}
        </ul>
      </div>
      {formulas.length > 0 && (
        <div>
          <div className="eyebrow mb-2">公式速查</div>
          <ul className="space-y-2">
            {formulas.map(({ f, k }, i) => (
              <li key={i} className="card-inset px-2.5 py-2 overflow-x-auto thin-scroll">
                <div className="text-[10px] text-muted mb-0.5">{k}</div>
                <Tex>{f}</Tex>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="eyebrow mb-2">知识点</div>
        <ul className="space-y-2">
          {knowledge.map((k) => (
            <li key={k.id} className="text-xs leading-relaxed">
              <span className="text-ink font-medium">{k.name}</span>
              <span className="text-muted">　{k.brief.replace(/\\overline\{([^}]*)\}/g, "$1̄").replace(/[\\{}]/g, "").replace(/\^/g, "")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
