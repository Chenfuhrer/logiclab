import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3211);
// 可用 PW_CHROMIUM 指向本机已安装的 Chromium，避免重新下载浏览器
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  // 去掉 ANTHROPIC_* 变量：端到端测试检查“未配置密钥”时的行为，不发起付费调用
  webServer: {
    command: `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
