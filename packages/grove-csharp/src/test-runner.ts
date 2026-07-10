import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  /** Additional environment variables to inject into the test process */
  env?: Record<string, string>;
  /** Test name pattern for filtering tests (dotnet test --filter DisplayName~) */
  testNamePattern?: string;
  /** Explicit dotnet executable override (highest priority) */
  dotnetPath?: string;
  /** Fallback dotnet executable when none resolved (e.g. VS Code setting) */
  fallbackDotnetPath?: string;
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

function getSystemDotnetBin(): string {
  return process.platform === "win32" ? "dotnet.exe" : "dotnet";
}

/**
 * Resolve the dotnet executable for a Grove project.
 * Prefers an explicit path, then a fallback (e.g. VS Code setting), then system dotnet.
 */
export function resolveDotnetBin(
  dotnetPath?: string,
  fallbackDotnetPath?: string,
): string {
  const explicit = dotnetPath?.trim();
  if (explicit) {
    return explicit;
  }

  const fallback = fallbackDotnetPath?.trim();
  if (fallback) {
    return fallback;
  }

  return getSystemDotnetBin();
}

/**
 * Detect whether the workspace looks like a C# Grove project.
 * Matches @grove/shared language detection: presence of a `*.csproj` (or `*.sln`) file.
 */
export async function detectCSharpProject(
  projectPath: string,
): Promise<boolean> {
  try {
    const entries = await fs.readdir(projectPath);
    return entries.some(
      (e) => e.endsWith(".csproj") || e.endsWith(".sln"),
    );
  } catch {
    return false;
  }
}

/**
 * Build argv for `dotnet` (e.g. `test`, `--filter`, ...).
 *
 * `dotnet test` has no direct "run this file" concept, so we approximate a
 * single-file run by filtering on the class name derived from the file's base
 * name (test classes conventionally match their file name). Combined with a
 * test name pattern, both are ANDed into one `--filter` expression.
 */
export function buildTestArgs(options: {
  testFile?: string;
  testNamePattern?: string;
}): string[] {
  const { testFile, testNamePattern } = options;
  const args = ["test", "--nologo", "--verbosity", "normal"];

  const filters: string[] = [];
  if (testFile) {
    const className = path.basename(testFile).replace(/\.cs$/i, "");
    filters.push(`FullyQualifiedName~${className}`);
  }
  if (testNamePattern) {
    filters.push(`DisplayName~${testNamePattern}`);
  }

  if (filters.length > 0) {
    args.push("--filter", filters.join("&"));
  }

  return args;
}

/**
 * Run C# tests via `dotnet test`.
 * The C# driver suite runs: dotnet test
 */
export async function runCSharpTests(
  options: TestRunOptions,
): Promise<TestResult> {
  const {
    projectPath,
    testFile,
    timeout = DEFAULT_TIMEOUT,
    env,
    testNamePattern,
    dotnetPath,
    fallbackDotnetPath,
  } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);
  const dotnetBin = resolveDotnetBin(dotnetPath, fallbackDotnetPath);
  const args = buildTestArgs({ testFile, testNamePattern });

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = `Using dotnet: ${dotnetBin}\n\n`;
    let timedOut = false;
    let settled = false;

    const proc = spawn(dotnetBin, args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true", ...env },
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, effectiveTimeout);

    const finish = (result: TestResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      finish({
        success: false,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        output: `Failed to launch dotnet: ${err.message}\nExecutable: ${dotnetBin}\n\n${output}`,
        duration: Date.now() - startTime,
      });
    });

    proc.on("close", (code) => {
      if (settled) {
        return;
      }
      const duration = Date.now() - startTime;

      if (timedOut) {
        finish({
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

      const counts = parseDotnetOutput(output);

      finish({
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
 * Parse `dotnet test` console output to extract test counts.
 * The VSTest summary line looks like:
 *   "Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 5 ms"
 *   "Failed!  - Failed:     2, Passed:     5, Skipped:     0, Total:     7, Duration: 8 ms"
 * Multiple test projects each emit a summary line, so counts are summed across all matches.
 */
export function parseDotnetOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const summary = /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)/gi;

  let matched = false;
  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };

  for (const match of output.matchAll(summary)) {
    matched = true;
    totals.failed += parseInt(match[1], 10);
    totals.passed += parseInt(match[2], 10);
    totals.skipped += parseInt(match[3], 10);
    totals.total += parseInt(match[4], 10);
  }

  return matched ? totals : { total: 0, passed: 0, failed: 0, skipped: 0 };
}
