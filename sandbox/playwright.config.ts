const config = {
  testDir: "playwright/e2e",
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3333",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results",
  webServer: {
    command: "npx tsx clinic-app/src/app.ts",
    port: 3333,
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  reporter: [
    ["json", { outputFile: "artifacts/playwright/results.json" }],
  ],
};

export default config;
