"use client";

import { useHydrated, useLab } from "@/lib/storage/store";

export function ChapterProgress({ ids }: { ids: string[] }) {
  const done = useLab((s) => s.done);
  const h = useHydrated();
  const n = h ? ids.filter((i) => done[i]).length : 0;
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${(n / ids.length) * 100}%` }} />
      </div>
      <span className="mono">
        {n}/{ids.length}
      </span>
    </div>
  );
}
