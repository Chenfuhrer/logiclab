"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";
import { ALL_LESSONS, READY_LESSONS, EXPERIMENTS } from "@/content/course";
import { KNOWLEDGE } from "@/content/knowledge";
import { useHydrated, useLab } from "@/lib/storage/store";

const NAV = [
  { href: "/learn", label: "课程" },
  { href: "/lab", label: "实验室" },
  { href: "/practice", label: "练习" },
  { href: "/review", label: "复习" },
];

export function TopBar() {
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] h-14 px-4 sm:px-5 flex items-center gap-3 sm:gap-6">
        <Link href="/" className="shrink-0" aria-label="LogicLab 首页">
          <Wordmark size={19} />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}>
                {n.label}
                {active && <span className="absolute left-3 right-3 -bottom-[13px] h-[2px] bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <button onClick={() => setSearchOpen(true)} className="ml-auto md:ml-4 flex items-center gap-2 h-8 px-3 rounded-lg border border-line bg-bg-2 text-muted text-sm hover:border-line-2 transition-colors min-w-0 sm:w-64">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="hidden sm:inline truncate">搜索课时、知识点、实验</span>
          <span className="hidden sm:inline ml-auto kbd">⌘K</span>
        </button>
        <ProgressRing />
        <SettingsMenu />
        <ThemeToggle />
      </div>
      <nav className="md:hidden flex border-t border-line">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`flex-1 text-center py-2 text-sm ${path.startsWith(n.href) ? "text-accent" : "text-ink-2"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

function ProgressRing() {
  const hydrated = useHydrated();
  const done = useLab((s) => s.done);
  const n = hydrated ? READY_LESSONS.filter((l) => done[l.id]).length : 0;
  const total = READY_LESSONS.length;
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <Link href="/review" className="hidden sm:flex items-center gap-2 text-xs text-ink-2 hover:text-ink" title={`已完成 ${n}/${total} 个课时`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <circle cx="14" cy="14" r={r} fill="none" stroke="var(--line-2)" strokeWidth="3" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${(c * n) / Math.max(1, total)} ${c}`} strokeLinecap="round" transform="rotate(-90 14 14)" />
      </svg>
      <span className="mono">
        {n}/{total}
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const theme = useLab((s) => s.settings.theme);
  const set = useLab((s) => s.setSetting);
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated) document.documentElement.dataset.theme = theme;
  }, [theme, hydrated]);
  return (
    <button className="btn btn-ghost btn-sm !px-2" onClick={() => set("theme", theme === "dark" ? "light" : "dark")} aria-label="切换深色/浅色主题" title="切换主题">
      {hydrated && theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

function OptButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`btn btn-sm flex-1 justify-center ${active ? "!border-accent !text-accent" : ""}`}>
      {label}
    </button>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const s = useLab((x) => x.settings);
  const set = useLab((x) => x.setSetting);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const Opt = ({ k, v, label }: { k: "negation" | "nextState" | "gateStyle"; v: string; label: string }) => <OptButton active={s[k] === v} onClick={() => set(k, v as never)} label={label} />;
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost btn-sm !px-2" onClick={() => setOpen((o) => !o)} aria-label="符号约定设置" title="符号约定">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-72 card p-4 space-y-4 text-sm z-50">
          <div className="eyebrow">符号约定</div>
          <div className="space-y-1.5">
            <div className="text-ink-2 text-xs">逻辑非</div>
            <div className="flex gap-2">
              {Opt({ k: "negation", v: "overline", label: "上划线 Ā" })}
              {Opt({ k: "negation", v: "prime", label: "撇号 A′" })}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-ink-2 text-xs">次态</div>
            <div className="flex gap-2">
              {Opt({ k: "nextState", v: "n+1", label: "Qⁿ⁺¹" })}
              {Opt({ k: "nextState", v: "star", label: "Q*" })}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-ink-2 text-xs">逻辑符号</div>
            <div className="flex gap-2">
              {Opt({ k: "gateStyle", v: "gb", label: "国标矩形" })}
              {Opt({ k: "gateStyle", v: "ansi", label: "ANSI 特异形" })}
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed">设置作用于求解器、实验和电路图中自动生成的公式与符号。课程正文按默认约定（上划线、Qⁿ⁺¹、国标符号）排版，依据见“模型与依据”页。</p>
        </div>
      )}
    </div>
  );
}

interface Hit {
  href: string;
  title: string;
  sub: string;
  tag: string;
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const index = useMemo<Hit[]>(
    () => [
      ...ALL_LESSONS.map((l) => ({ href: `/learn/${l.id}`, title: l.title, sub: l.summary, tag: l.status === "ready" ? `第 ${l.chapter.no} 章` : "规划中" })),
      ...EXPERIMENTS.map((e) => ({ href: e.href, title: e.title, sub: e.summary, tag: "实验" })),
      ...KNOWLEDGE.filter((k) => ALL_LESSONS.find((l) => l.id === k.lesson)?.status === "ready").map((k) => ({ href: `/learn/${k.lesson}`, title: k.name, sub: k.brief.replace(/\\[a-z]+|[{}_^]/g, ""), tag: "知识点" })),
    ],
    [],
  );
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return index.slice(0, 8);
    return index.filter((h) => (h.title + h.sub).toLowerCase().includes(t)).slice(0, 12);
  }, [q, index]);
  const go = (h: Hit) => {
    router.push(h.href);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="card w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && hits[sel]) go(hits[sel]);
          }}
          placeholder="例如：卡诺图、74LS161、自启动、Mealy……"
          className="w-full h-12 px-4 bg-transparent outline-none border-b border-line text-ink"
        />
        <ul className="max-h-[50vh] overflow-y-auto thin-scroll p-2">
          {hits.length === 0 && <li className="p-4 text-sm text-muted">没有找到匹配内容。</li>}
          {hits.map((h, i) => (
            <li key={h.href + h.title}>
              <button onMouseEnter={() => setSel(i)} onClick={() => go(h)} className={`w-full text-left px-3 py-2 rounded-lg flex gap-3 items-start ${i === sel ? "bg-panel-2" : ""}`}>
                <span className={`chip mt-0.5 ${h.tag === "实验" ? "chip-amber" : h.tag === "规划中" ? "" : "chip-accent"}`}>{h.tag}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{h.title}</span>
                  <span className="block text-xs text-muted truncate">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
