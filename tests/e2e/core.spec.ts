import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const lessons = [...readFileSync("content/lessons.generated.ts", "utf8").matchAll(/"([a-z0-9-]+)":/g)].map((m) => m[1]);
const ROUTES = ["/", "/learn", "/lab", "/lab/logic", "/lab/jk-counter", "/lab/ls161", "/lab/fsm-designer", "/lab/sandbox", "/lab/timer555", "/lab/verilog", "/practice", "/review", "/about", ...lessons.map((l) => `/learn/${l}`)];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // 链接预取被中断属于网络环境问题，不是页面错误
    if (m.type() === "error" && !/net::ERR_(NETWORK_IO_SUSPENDED|ABORTED)/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

for (const route of ROUTES) {
  test(`页面无运行错误 ${route}`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(route, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}

test("实验 A：单步三次后现态 011、次态 100，仿真与分析一致", async ({ page }) => {
  await page.goto("/lab/jk-counter");
  const step = page.getByTestId("step");
  for (let i = 0; i < 3; i++) await step.click();
  await expect(page.getByText("现态 Q2Q1Q0").locator("..")).toContainText("011");
  await expect(page.getByText("次态（由状态方程）").locator("..")).toContainText("100");
  await expect(page.getByText("仿真结果与符号分析逐拍一致")).toBeVisible();
});

test("实验 A：改接 K0 = Q2 后方程随网表重新推导", async ({ page }) => {
  await page.goto("/lab/jk-counter");
  await page.getByLabel("K0 的驱动源").selectOption("Q2");
  await page.getByRole("tab", { name: "自启动检查" }).click();
  await expect(page.getByText(/能够自启动|不能自启动/).first()).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByTestId("step").click();
  await expect(page.getByText("仿真结果与符号分析逐拍一致")).toBeVisible();
});

test("实验 B：74LS161 十进制清零法实测模数为 10，状态 10 为瞬态", async ({ page }) => {
  await page.goto("/lab/ls161");
  await expect(page.getByText("实测模数 10 = 目标 N")).toBeVisible();
  await expect(page.getByText(/瞬态状态：10/)).toBeVisible();
  await page.getByLabel("设计方法").selectOption("sync-load");
  await expect(page.getByText("实测模数 10 = 目标 N")).toBeVisible();
});

test("实验 C：101 序列检测器设计后仿真逐拍一致", async ({ page }) => {
  await page.goto("/lab/fsm-designer?seq=1101&kind=moore&overlap=1");
  await expect(page.getByText("逐拍一致")).toBeVisible();
  await page.getByLabel("触发器类型").selectOption("D");
  await expect(page.getByText("逐拍一致")).toBeVisible();
});

test("逻辑工作台：化简与等价验证", async ({ page }) => {
  await page.goto("/lab/logic");
  const input = page.getByLabel("逻辑表达式");
  await input.fill("AB+A'C+BC");
  await page.getByLabel("比较的表达式").fill("AB+A'C");
  await expect(page.getByText(/逻辑等价（穷举/)).toBeVisible();
  await page.getByLabel("比较的表达式").fill("AB+C");
  await expect(page.getByText(/不等价/)).toBeVisible();
});

test("课程：模式切换控制内容块，完成标记持久化", async ({ page }) => {
  await page.goto("/learn/sync-analysis");
  const deep = page.locator('.mode-block[data-mode~="deep"]').first();
  await page.getByRole("button", { name: "基础解释" }).click();
  await expect(deep).toBeHidden();
  await page.getByRole("button", { name: "深入推导" }).click();
  await expect(deep).toBeVisible();
  await page.getByTestId("mark-done").click();
  await page.reload();
  await expect(page.getByTestId("mark-done")).toContainText("已完成");
  await page.goto("/");
  await expect(page.locator("header")).toContainText(/1\/\d+/);
});

test("练习：表达式题按逻辑等价判分，答错进入错题本", async ({ page }) => {
  await page.goto("/practice");
  const card = page.locator("[data-exercise]").filter({ has: page.getByLabel("表达式答案") }).first();
  await card.getByLabel("表达式答案").fill("A");
  await card.getByRole("button", { name: "提交" }).click();
  await expect(card.getByRole("status")).toBeVisible();
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "错题本", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "移出错题本" }).first()).toBeVisible();
});

test("主题切换 @mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "切换深色/浅色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("555 实验：三种接法切换，多谐振荡器参数与公式一致", async ({ page }) => {
  await page.goto("/lab/timer555");
  await expect(page.getByText("模型 E · 教学近似模型")).toBeVisible();
  await expect(page.getByText("60.0 %")).toBeVisible(); // R1=10k, R2=20k：(R1+R2)/(R1+2R2)
  await page.getByRole("button", { name: "单稳态触发器" }).click();
  await expect(page.getByText(/仿真测得脉宽/)).toBeVisible();
  await page.getByRole("button", { name: "施密特触发器" }).click();
  await expect(page.getByText("1.67 V").first()).toBeVisible();
});

test("实验 E：Verilog 实验台运行计数器，对照页全部一致", async ({ page }) => {
  await page.goto("/lab/verilog");
  await expect(page.getByText("教学用 Verilog 子集解释器").first()).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /按示例激励走一拍/ }).click();
  await expect(page.getByText("q = 001").or(page.locator("text=001")).first()).toBeVisible();
  await page.getByRole("tab", { name: "电路 ↔ Verilog 对照" }).click();
  await expect(page.getByText(/全部 \d+ 拍一致/)).toBeVisible();
  await page.getByLabel("电路来源").selectOption("fsm");
  await expect(page.getByText(/全部 \d+ 拍一致/)).toBeVisible();
});

test("Verilog 编译错误给出行号", async ({ page }) => {
  await page.goto("/lab/verilog");
  const ed = page.getByLabel("Verilog 代码");
  await ed.fill("module m(input a, output y);\n  assign y = b;\nendmodule\n");
  await page.getByRole("button", { name: /编译并重置/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "编译" })).toContainText("第 2 行");
});

test("AI 助教：未配置密钥时说明原因，其他功能正常", async ({ page }) => {
  await page.goto("/learn/kmap");
  await page.getByRole("button", { name: "AI 助教" }).click();
  await expect(page.getByRole("dialog", { name: "AI 助教" })).toContainText("尚未启用");
});
