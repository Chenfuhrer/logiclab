import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * GitHub Pages 静态版本冒烟测试。只在设置了 PAGES_URL 时运行，例如：
 *   PAGES_URL=http://localhost:8790/logiclab npx playwright test pages.spec.ts
 *   PAGES_URL=https://chenfuhrer.github.io/logiclab npx playwright test pages.spec.ts
 */
const BASE = process.env.PAGES_URL?.replace(/\/$/, "");
test.skip(!BASE, "未设置 PAGES_URL");

const lessons = [...readFileSync("content/lessons.generated.ts", "utf8").matchAll(/"([a-z0-9-]+)":/g)].map((m) => m[1]);
const ROUTES = ["/", "/learn/", "/lab/", "/lab/logic/", "/lab/jk-counter/", "/lab/ls161/", "/lab/fsm-designer/", "/lab/timer555/", "/lab/verilog/", "/lab/sandbox/", "/practice/", "/review/", "/about/", ...lessons.map((l) => `/learn/${l}/`)];

for (const r of ROUTES) {
  test(`静态页面 ${r}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/net::ERR_(NETWORK_IO_SUSPENDED|ABORTED)/.test(m.text()) && errors.push(m.text()));
    const res = await page.goto(BASE + r, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);
    await expect(page.locator("header").first()).toContainText("课程");
    expect(errors).toEqual([]);
  });
}

test("静态版本：站内导航、实验交互、本地进度", async ({ page }) => {
  await page.goto(BASE + "/");
  await page.getByRole("link", { name: "实验室" }).first().click();
  await expect(page).toHaveURL(/\/logiclab\/lab\/?$/);
  await page.goto(BASE + "/lab/jk-counter/");
  for (let i = 0; i < 3; i++) await page.getByTestId("step").click();
  await expect(page.getByText("仿真结果与符号分析逐拍一致")).toBeVisible();
  await page.goto(BASE + "/learn/kmap/");
  await page.getByTestId("mark-done").click();
  await page.reload();
  await expect(page.getByTestId("mark-done")).toContainText("已完成");
  await page.getByRole("button", { name: "AI 助教" }).click();
  await expect(page.getByRole("dialog", { name: "AI 助教" })).toContainText("GitHub Pages");
});

test("静态版本：Verilog 实验台与对照", async ({ page }) => {
  await page.goto(BASE + "/lab/verilog/");
  await page.getByRole("button", { name: /按示例激励走一拍/ }).click();
  await page.getByRole("tab", { name: "电路 ↔ Verilog 对照" }).click();
  await expect(page.getByText(/全部 \d+ 拍一致/)).toBeVisible();
});
