import katex from "katex";

/** KaTeX 公式（服务端/客户端均可用）。display=true 为独立公式 */
export function Tex({ children, display = false, className = "" }: { children: string; display?: boolean; className?: string }) {
  const html = katex.renderToString(children, { displayMode: display, throwOnError: false, strict: false, output: "html" });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
