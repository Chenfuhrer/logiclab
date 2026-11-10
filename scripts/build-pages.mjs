// 构建 GitHub Pages 静态站点：暂时移走服务端接口（app/api），以 STATIC_EXPORT=1 运行 next build，结束后恢复。
import { renameSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const api = join(root, "app/api");
const parked = join(root, ".api-parked");
if (existsSync(parked)) throw new Error(".api-parked 已存在：上次构建可能中断，请先手动把它移回 app/api");
const moved = existsSync(api);
if (moved) renameSync(api, parked);
let code = 1;
try {
  const r = spawnSync("npx", ["next", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1" } });
  code = r.status ?? 1;
  // GitHub Pages 默认会用 Jekyll 处理并忽略 _next 目录，加 .nojekyll 关闭
  if (code === 0) writeFileSync(join(root, "out/.nojekyll"), "");
} finally {
  if (moved) renameSync(parked, api);
}
process.exit(code);
