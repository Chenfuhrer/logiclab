import Link from "next/link";

export function PageHeader({ eyebrow, title, children, crumbs }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="mb-6">
      {crumbs && (
        <nav className="text-xs text-muted mb-3 flex gap-1.5 items-center" aria-label="面包屑">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              <Link href={c.href} className="hover:text-ink">{c.label}</Link>
            </span>
          ))}
        </nav>
      )}
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1 className="font-[family-name:var(--font-cjk-serif)] text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      {children && <div className="mt-3 text-ink-2 max-w-3xl leading-relaxed text-[15px]">{children}</div>}
    </header>
  );
}
