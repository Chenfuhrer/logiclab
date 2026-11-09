/** LogicLab 字标：衬线斜体 "Logic" + 一个上升沿 + 等宽 "LAB" */
export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[0.18em] leading-none select-none ${className}`} style={{ fontSize: size }} aria-label="LogicLab">
      <span className="font-serif italic tracking-tight" style={{ fontSize: "1.18em" }}>Logic</span>
      <svg width="0.95em" height="0.9em" viewBox="0 0 24 22" className="self-center" aria-hidden>
        <path d="M1 18 H8 V4 H15 V18 H23" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="miter" />
        <path d="M8 13 l0 -4 M6 11 l2 -2.6 l2 2.6" fill="none" stroke="var(--amber)" strokeWidth="1.6" />
      </svg>
      <span className="font-mono font-bold tracking-[0.12em] text-[0.62em] pb-[0.14em]">LAB</span>
    </span>
  );
}
