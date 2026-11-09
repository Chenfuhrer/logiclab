// 编译全部课程 MDX，检查语法错误与未登记的组件名（不需要 next build）
import { compile } from "@mdx-js/mdx";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED = new Set(["Mode", "Callout", "Example", "Solution", "ExprLab", "TruthTable", "KMapLab", "Derivation", "GateLab", "BaseConverter", "ComplementLab", "CodeLab", "LevelsLab", "OCPullupLab", "TriStateBusLab", "Decoder138Lab", "Mux151Lab", "HazardLab", "LatchLab", "TriggerCompare", "FFLab", "SyncAnalyzer", "RippleCounterLab", "ShiftRegisterLab", "SeqDetectorDemo", "TimingCalc", "ExperimentCard", "Quiz", "Timer555Lab"]);
const root = fileURLToPath(new URL("../content/chapters", import.meta.url));
const only = process.argv[2];
let bad = 0;
for (const ch of readdirSync(root)) {
  const dir = join(root, ch);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mdx"))) {
    if (only && !f.startsWith(only)) continue;
    const src = readFileSync(join(dir, f), "utf8");
    const katexErrors = [];
    try {
      await compile(src, { remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [[rehypeKatex, { strict: (code, msg) => { katexErrors.push(msg); return "ignore"; }, throwOnError: true }]] });
    } catch (e) {
      bad++;
      console.log(`✗ ${ch}/${f}: ${e.message}`);
      continue;
    }
    const noMath = src.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/\$[^$\n]*\$/g, "");
    const used = new Set([...noMath.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]));
    const unknown = [...used].filter((c) => !ALLOWED.has(c));
    const h2 = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const need = ["学习目标", "前置知识", "实际问题", "直观解释", "基本原理", "电路结构", "逻辑推导", "交互实验", "典型例题", "分层练习", "常见错误", "知识总结", "后续知识关联"];
    const missing = need.filter((n) => !h2.includes(n));
    if (unknown.length || missing.length || katexErrors.length) {
      bad++;
      console.log(`✗ ${ch}/${f}${unknown.length ? ` 未登记组件: ${unknown.join(",")}` : ""}${missing.length ? ` 缺少部分: ${missing.join(",")}` : ""}${katexErrors.length ? ` KaTeX: ${katexErrors.slice(0, 3).join(" | ")}` : ""}`);
    } else console.log(`✓ ${ch}/${f} (${src.length} 字符)`);
  }
}
process.exit(bad ? 1 : 0);
