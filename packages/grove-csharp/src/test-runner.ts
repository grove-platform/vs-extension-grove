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

const DEFAULT_TIMEOUT = 300_000;
const MAX_TIMEOUT = 300_000;
export const EXTENSION_VERSION = "0.0.2";

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
 * Resolve the .csproj that owns a test source file by walking up from its directory.
 */
export async function resolveTestProjectForFile(
  projectPath: string,
  testFile: string,
): Promise<string | undefined> {
  const root = path.resolve(projectPath);
  let dir = path.dirname(path.resolve(projectPath, testFile));

  while (dir.startsWith(root)) {
    try {
      const entries = await fs.readdir(dir);
      const csproj = entries.find((e) => e.endsWith(".csproj"));
      if (csproj) {
        return path.relative(projectPath, path.join(dir, csproj));
      }
    } catch {
      // try parent directory
    }

    if (dir === root) {
      break;
    }
    dir = path.dirname(dir);
  }

  return undefined;
}

/**
 * Default test project for Grove C# driver suites (code-example tests live in Tests/).
 */
export async function resolveDefaultTestProject(
  projectPath: string,
): Promise<string | undefined> {
  const candidates = ["Tests/Tests.csproj", "tests/Tests.csproj"];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(projectPath, candidate));
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

/**
 * Build argv for `dotnet` (e.g. `test`, `--filter`, ...).
 *
 * `dotnet test` has no direct "run this file" concept, so we approximate a
 * single-file run by filtering on the class name derived from the file's base
 * name (test classes conventionally match their file name). When a test file is
 * provided, pass the containing `.csproj` as a positional argument so
 * solution-wide runs do not build every test project. Combined with a test name
 * ANDed into one `--filter` expression.
 */
export function buildTestArgs(options: {
  testFile?: string;
  testNamePattern?: string;
  testProject?: string;
}): string[] {
  const { testFile, testNamePattern, testProject } = options;
  const args = ["test"];

  // Pass the .csproj as a positional argument (not --project, which MSBuild rejects).
  if (testProject) {
    args.push(testProject);
  }

  args.push("--nologo", "--verbosity", "normal");

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
 * Grove driver suites default to `dotnet test Tests/Tests.csproj`.
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
  const testProject = testFile
    ? await resolveTestProjectForFile(projectPath, testFile)
    : await resolveDefaultTestProject(projectPath);
  const args = buildTestArgs({ testFile, testNamePattern, testProject });

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = `Grove C# v${EXTENSION_VERSION}\nUsing dotnet: ${dotnetBin}\nTimeout limit: ${effectiveTimeout / 1000}s\nCommand: dotnet ${args.join(" ")}\n\n`;
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
          output: `Test execution timed out after ${effectiveTimeout / 1000} seconds\n\n${output}`,
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
 *
 * Supports VSTest summary lines:
 *   "Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 5 ms"
 *
 * And NUnit adapter summaries:
 *   "Total tests: 1"
 *   "     Passed: 1"
 */
export function parseDotnetOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const nunit = parseNunitSummary(output);
  if (nunit.total > 0 || /Test Run Successful/i.test(output)) {
    return nunit;
  }

  const vstestSummary =
    /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)/gi;

  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let matched = false;

  for (const match of output.matchAll(vstestSummary)) {
    matched = true;
    totals.failed += parseInt(match[1], 10);
    totals.passed += parseInt(match[2], 10);
    totals.skipped += parseInt(match[3], 10);
    totals.total += parseInt(match[4], 10);
  }

  if (matched && totals.total > 0) {
    return totals;
  }

  return nunit.total > 0 ? nunit : totals;
}

function parseNunitSummary(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let matched = false;

  for (const totalMatch of output.matchAll(/Total tests:\s*(\d+)/gi)) {
    matched = true;
    totals.total += parseInt(totalMatch[1], 10);
  }

  if (!matched) {
    return totals;
  }

  for (const match of output.matchAll(/^\s*Passed:\s*(\d+)/gim)) {
    totals.passed += parseInt(match[1], 10);
  }
  for (const match of output.matchAll(/^\s*Failed:\s*(\d+)/gim)) {
    totals.failed += parseInt(match[1], 10);
  }
  for (const match of output.matchAll(/^\s*(?:Skipped|Ignored):\s*(\d+)/gim)) {
    totals.skipped += parseInt(match[1], 10);
  }

  return totals;
}
