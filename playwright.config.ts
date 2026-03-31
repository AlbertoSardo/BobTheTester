import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "playwright/e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  retries: 0,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results",
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  reporter: [
    ["json", { outputFile: "artifacts/playwright/results.json" }],
    [
      "monocart-reporter",
      {
        name: "BobTheTester Coverage Report",
        outputFile: "artifacts/playwright/coverage/coverage-report.json",
        coverage: {
          reports: [["v8"], ["console-details"]],
          outputDir: "artifacts/playwright/coverage",
          sourceFilter: (sourcePath: string) => {
            // Only collect coverage for application source files, not node_modules or test files
            return (
              !sourcePath.includes("node_modules") &&
              !sourcePath.includes(".spec.") &&
              !sourcePath.includes("playwright/")
            );
          },
        },
      },
    ],
  ],
});
