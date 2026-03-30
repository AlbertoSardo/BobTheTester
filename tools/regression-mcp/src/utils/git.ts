import { execFile } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execCommand(command: string, args: string[], cwd: string): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve, reject) => {
    execFile(command, args, { cwd, encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            [`Command failed: ${command} ${args.join(" ")}`, stderr ? `stderr: ${stderr.trim()}` : ""]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: 0,
      });
    });
  });
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    const result = await execCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}
