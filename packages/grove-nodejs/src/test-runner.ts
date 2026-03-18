import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  /** Additional environment variables to inject into the test process */
  env?: Record<string, string>;
  /** Test name pattern for filtering tests (passed as -t to Jest) */
  testNamePattern?: string;
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
  const {
    projectPath,
    testFile,
    timeout = DEFAULT_TIMEOUT,
    env,
    testNamePattern,
  } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);

  // Use the project's npm test script, optionally scoped to a specific file and test name.
  // --testPathPattern restricts which test files Jest runs (avoids running all suites).
  // -t filters by test name within matched files.
  const args = ["test", "--"];
  if (testFile) {
    args.push("--testPathPatterns", testFile);
  }
  if (testNamePattern) {
    args.push("-t", testNamePattern);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timedOut = false;

    // Merge injected env vars with process.env
    // Injected vars (like CONNECTION_STRING from Grove UI) take precedence
    // Use npm.cmd on Windows; shell: true is intentionally omitted to prevent
    // shell injection if testFile contains metacharacters.
    const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
    const proc = spawn(npmBin, args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true", ...env },
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
 * Looks for the "Tests:" summary line and extracts counts regardless of order.
 * Jest outputs counts in varying order, e.g.:
 *   "Tests:  7 passed, 7 total"
 *   "Tests:  135 skipped, 7 passed, 142 total"
 *   "Tests:  2 failed, 5 passed, 7 total"
 */
function parseJestOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };

  // Find the "Tests:" summary line
  const testsLine = output.match(/Tests:\s*(.+total)/i);
  if (!testsLine) return defaults;

  const line = testsLine[1];

  const passed = line.match(/(\d+)\s*passed/i);
  const failed = line.match(/(\d+)\s*failed/i);
  const skipped = line.match(/(\d+)\s*skipped/i);
  const total = line.match(/(\d+)\s*total/i);

  return {
    passed: passed ? parseInt(passed[1], 10) : 0,
    failed: failed ? parseInt(failed[1], 10) : 0,
    skipped: skipped ? parseInt(skipped[1], 10) : 0,
    total: total ? parseInt(total[1], 10) : 0,
  };
}
