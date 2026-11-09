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
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
});
