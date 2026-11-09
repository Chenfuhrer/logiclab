"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 入场动画：IntersectionObserver 触发，动画本身是 CSS keyframes（不使用 motion/react）。
 * 进入视口的状态保存在 React state 中，重新渲染不会把元素重新隐藏。
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return (
    <Tag ref={ref as never} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
