import { Fragment } from "react";
import { Tex } from "./Tex";

/**
 * 轻量富文本：支持 $行内公式$、$$独立公式$$、**加粗**、换行。用于题目、提示、解析。
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("$$")) return <Tex key={i} display>{p.slice(2, -2)}</Tex>;
        if (p.startsWith("$") && p.length > 1) return <Tex key={i}>{p.slice(1, -1)}</Tex>;
        return (
          <Fragment key={i}>
            {p.split(/(\*\*[^*]+\*\*)/g).map((s, j) =>
              s.startsWith("**") ? (
                <strong key={j} className="font-semibold">{s.slice(2, -2)}</strong>
              ) : (
                s.split("\n").map((line, k, arr) => (
                  <Fragment key={k}>
                    {line}
                    {k < arr.length - 1 && <br />}
                  </Fragment>
                ))
              ),
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
