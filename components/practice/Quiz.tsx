"use client";

import { exercisesOf } from "@/content/exercises";
import { ExercisePlayer, LEVEL_TEXT } from "./ExercisePlayer";
import type { Level } from "@/lib/exercises/types";

/** 课时内的分层练习：基础 → 计算与分析 → 综合设计 */
export function Quiz({ lesson }: { lesson: string }) {
  const list = exercisesOf(lesson);
  if (!list.length) return <p className="widget text-sm text-muted">本课时的题目正在整理中。</p>;
  const levels: Level[] = ["basic", "analysis", "design"];
  let idx = 0;
  return (
    <div className="widget space-y-6 not-prose">
      {levels.map((lv) => {
        const items = list.filter((e) => e.level === lv);
        if (!items.length) return null;
        return (
          <div key={lv} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="eyebrow">{LEVEL_TEXT[lv]}</span>
              <span className="h-px flex-1 bg-line" />
              <span className="mono text-xs text-muted">{items.length} 题</span>
            </div>
            {items.map((ex) => (
              <ExercisePlayer key={ex.id} ex={ex} index={idx++} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
