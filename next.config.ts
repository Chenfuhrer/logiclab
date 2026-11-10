import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * STATIC_EXPORT=1：生成 GitHub Pages 用的纯静态站点（out/），部署在 /logiclab 子路径下。
 * 静态版本不含服务端接口，因此没有 AI 助教；其余课程、实验、练习都在浏览器中运行。
 */
const STATIC = process.env.STATIC_EXPORT === "1";
const BASE = process.env.PAGES_BASE_PATH ?? "/logiclab";

const nextConfig: NextConfig = {
  // 部分预渲染（PPR）不能用于静态导出，静态构建时关闭
  cacheComponents: !STATIC,
  partialPrefetching: !STATIC,
  // 静态构建时 app/api 被暂时移走，引用它的测试文件无法通过类型检查；类型检查与测试在部署工作流中先于本构建完整运行
  ...(STATIC ? { output: "export" as const, basePath: BASE, trailingSlash: true, images: { unoptimized: true }, typescript: { ignoreBuildErrors: true } } : {}),
  env: { NEXT_PUBLIC_STATIC_EXPORT: STATIC ? "1" : "0", NEXT_PUBLIC_BASE_PATH: STATIC ? BASE : "" },
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm", "remark-math"],
    rehypePlugins: [["rehype-katex", { strict: false, throwOnError: false }]],
  },
});

export default withMDX(nextConfig);
