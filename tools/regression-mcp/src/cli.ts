import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateCodeReviewReport } from "./tools/generate-code-review-report.js";
import { generateRegressionReview } from "./review.js";
import { generateUnifiedReview } from "./unified-review.js";
import { findTool, registeredTools } from "./tool-registry.js";

function usage(): string {
  const toolNames = registeredTools.map((tool) => tool.name).join(", ");
  return [
    "Usage:",
    "  node dist/cli.js tool <tool_name> [input_json_or_@file]",
    "  node dist/cli.js review [input_json_or_@file]",
    "  node dist/cli.js code-review [input_json_or_@file]",
    "  node dist/cli.js unified-review [input_json_or_@file]",
    "",
    `Available tools: ${toolNames}`,
    "",
    "Examples:",
    "  node dist/cli.js tool map_impacted_flows '{\"changedFiles\":[\"src/settings/profile/form.ts\"]}'",
    "  node dist/cli.js review '{\"changedFiles\":[\"src/settings/profile/form.ts\"],\"dryRun\":true}'",
    "  node dist/cli.js code-review '{\"baseRef\":\"origin/main\",\"headRef\":\"HEAD\"}'",
    "  node dist/cli.js unified-review '{\"baseRef\":\"origin/main\",\"headRef\":\"HEAD\",\"dryRun\":false}'",
  ].join("\n");
}

async function parseInputArgument(rawArg: string | undefined): Promise<Record<string, unknown>> {
  if (!rawArg) {
    return {};
  }

  if (rawArg.startsWith("@")) {
    const filePath = path.resolve(rawArg.slice(1));
    const fileContent = await readFile(filePath, "utf-8");
    return JSON.parse(fileContent) as Record<string, unknown>;
  }

  return JSON.parse(rawArg) as Record<string, unknown>;
}

async function run(): Promise<void> {
  const [command, arg1, arg2] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === "tool") {
    if (!arg1) {
      throw new Error("Missing tool name.\n\n" + usage());
    }

    const tool = findTool(arg1);
    if (!tool) {
      throw new Error(`Unknown tool '${arg1}'.\n\n${usage()}`);
    }

    const input = await parseInputArgument(arg2);
    const result = await tool.handler(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "review") {
    const input = await parseInputArgument(arg1);
    const result = await generateRegressionReview(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "code-review") {
    const input = await parseInputArgument(arg1);
    const result = await generateCodeReviewReport(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "unified-review") {
    const input = await parseInputArgument(arg1);
    const result = await generateUnifiedReview(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
