// 扫描课程 MDX 与题库文件，生成静态导入表（构建前自动运行）
import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const chapters = join(root, "content/chapters");
const lessons = [];
for (const ch of readdirSync(chapters)) {
  if (ch.startsWith("_")) continue;
  const dir = join(chapters, ch);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith(".mdx")) lessons.push({ ch, id: f.replace(/\.mdx$/, "") });
}
lessons.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  join(root, "content/lessons.generated.ts"),
  `// 由 scripts/gen-content.mjs 自动生成，请勿手改\nimport type { ComponentType } from "react";\n\nexport const LESSON_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {\n${lessons
    .map((l) => `  "${l.id}": () => import("./chapters/${l.ch}/${l.id}.mdx"),`)
    .join("\n")}\n};\n`,
);
const exDir = join(root, "content/exercises");
const exFiles = existsSync(exDir) ? readdirSync(exDir).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort() : [];
writeFileSync(
  join(exDir, "index.ts"),
  `// 由 scripts/gen-content.mjs 自动生成，请勿手改\nimport type { Exercise } from "@/lib/exercises/types";\n${exFiles
    .map((f, i) => `import { exercises as e${i} } from "./${f.replace(/\.ts$/, "")}";`)
    .join("\n")}\n\nexport const ALL_EXERCISES: Exercise[] = [${exFiles.map((_, i) => `...e${i}`).join(", ")}];\n\nexport function exercisesOf(lesson: string): Exercise[] {\n  return ALL_EXERCISES.filter((e) => e.lesson === lesson);\n}\n\nexport function findExercise(id: string): Exercise | undefined {\n  return ALL_EXERCISES.find((e) => e.id === id);\n}\n`,
);
console.log(`gen-content: ${lessons.length} lessons, ${exFiles.length} exercise files`);
