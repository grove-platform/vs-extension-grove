import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
}

export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  output: string;
  duration: number;
}

const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 300_000;

/**
 * Detect if a project is a Node.js/Jest project.
 * Checks for package.json with jest in dependencies or a test script.
 */
export async function detectJestProject(projectPath: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Check for jest/vitest in dependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("jest" in deps || "vitest" in deps) {
      return true;
    }

    // Check for test script
    if (pkg.scripts?.test) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Run tests using the project's own npm scripts.
 * This respects the project's existing test infrastructure.
 */
export async function runJestTests(
  options: TestRunOptions,
): Promise<TestResult> {
  const { projectPath, testFile, timeout = DEFAULT_TIMEOUT } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);

  // Use the project's npm test script, optionally with a specific file
  const args = ["test"];
  if (testFile) {
    // Pass the test file as an argument to npm test
    args.push("--", testFile);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timedOut = false;

    const proc = spawn("npm", args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true" },
      shell: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, effectiveTimeout);

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (timedOut) {
        resolve({
          success: false,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          output: `Test execution timed out after ${effectiveTimeout / 1000} seconds`,
          duration,
        });
        return;
      }

      // Parse test counts from Jest output if possible
      const counts = parseJestOutput(output);

      resolve({
        success: code === 0,
        total: counts.total,
        passed: counts.passed,
        failed: counts.failed,
        skipped: counts.skipped,
        output,
        duration,
      });
    });
  });
}

/**
 * Parse Jest console output to extract test counts.
 * Looks for patterns like "Tests: 5 passed, 2 failed, 7 total"
 */
function parseJestOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };

  // Match Jest summary line: "Tests: X passed, Y failed, Z total"
  const testsMatch = output.match(
    /Tests:\s*(?:(\d+)\s*passed)?[,\s]*(?:(\d+)\s*failed)?[,\s]*(?:(\d+)\s*skipped)?[,\s]*(\d+)\s*total/i,
  );

  if (testsMatch) {
    return {
      passed: parseInt(testsMatch[1] || "0", 10),
      failed: parseInt(testsMatch[2] || "0", 10),
      skipped: parseInt(testsMatch[3] || "0", 10),
      total: parseInt(testsMatch[4] || "0", 10),
    };
  }

  return defaults;
}
