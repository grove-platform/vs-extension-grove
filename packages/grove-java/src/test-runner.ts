import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { isPathWithinRealBoundary, killProcessTree } from "@grove/shared";
import { resolveJavaTestEnv } from "./env";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  /** Additional environment variables to inject into the test process */
  env?: Record<string, string>;
  /** Test method name for Surefire -Dtest=Class#method filtering */
  testNamePattern?: string;
  /** Explicit mvn executable override (highest priority) */
  mavenPath?: string;
  /** Fallback mvn executable when none resolved */
  fallbackMavenPath?: string;
  /** Skip installing utilities/comparison-library before test (default false) */
  skipUtilitiesBuild?: boolean;
  /** Extension version from package.json (for output headers) */
  extensionVersion?: string;
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

function getSystemMavenBin(): string {
  return process.platform === "win32" ? "mvn.cmd" : "mvn";
}

/**
 * Resolve the Maven executable.
 * Prefers an explicit path, then a fallback setting, then system mvn.
 */
export function resolveMavenBin(
  mavenPath?: string,
  fallbackMavenPath?: string,
): string {
  const explicit = mavenPath?.trim();
  if (explicit) {
    return explicit;
  }

  const fallback = fallbackMavenPath?.trim();
  if (fallback) {
    return fallback;
  }

  return getSystemMavenBin();
}

/**
 * Detect whether the workspace looks like a Java Grove project.
 * Matches @grove/shared language detection: `pom.xml` or `build.gradle`.
 */
export async function detectJavaProject(
  projectPath: string,
): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, "pom.xml"));
    return true;
  } catch {
    try {
      await fs.access(path.join(projectPath, "build.gradle"));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * True when pom.xml is the java-code-examples aggregator (not a child module).
 */
export function isJavaAggregatorPom(pomContent: string): boolean {
  return (
    pomContent.includes("<packaging>pom</packaging>") &&
    pomContent.includes("<module>utilities</module>")
  );
}

/**
 * Resolve the Java multi-module root (e.g. code-example-tests/java) that owns
 * the utilities/comparison-library modules. Returns undefined when not found.
 */
export async function resolveJavaMultiModuleRoot(
  projectPath: string,
): Promise<string | undefined> {
  let dir = path.resolve(projectPath);

  while (true) {
    try {
      const content = await fs.readFile(path.join(dir, "pom.xml"), "utf-8");
      if (isJavaAggregatorPom(content)) {
        return dir;
      }
    } catch {
      // try parent
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Maven args to install comparison-library and sample-data locally.
 */
export function buildUtilitiesInstallArgs(): string[] {
  return [
    "install",
    "-DskipTests",
    "-B",
    "-pl",
    "utilities/comparison-library,utilities/sample-data",
    "-am",
  ];
}

/**
 * Maven args for `mvn test` with optional Surefire class/method filters.
 */
export function buildMavenTestArgs(options: {
  testFile?: string;
  testNamePattern?: string;
}): string[] {
  const { testFile, testNamePattern } = options;
  const args = ["test", "-B"];

  let testFilter: string | undefined;
  if (testFile && /\.java$/i.test(testFile)) {
    testFilter = path.basename(testFile).replace(/\.java$/i, "");
  }
  if (testNamePattern) {
    testFilter = testFilter
      ? `${testFilter}#${testNamePattern}`
      : `*${testNamePattern}*`;
  }
  if (testFilter) {
    args.push(`-Dtest=${testFilter}`);
  }

  return args;
}

interface MavenRunResult {
  success: boolean;
  output: string;
  duration: number;
  timedOut: boolean;
  spawnError?: string;
}

function runMavenCommand(options: {
  mavenBin: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  outputPrefix: string;
}): Promise<MavenRunResult> {
  const { mavenBin, args, cwd, env, timeoutMs, outputPrefix } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = `${outputPrefix}\nUsing mvn: ${mavenBin}\nWorking directory: ${cwd}\nCommand: mvn ${args.join(" ")}\n\n`;
    let timedOut = false;
    let settled = false;

    const proc = spawn(mavenBin, args, {
      cwd,
      env: { ...process.env, CI: "true", ...env },
      detached: process.platform !== "win32",
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcessTree(proc);
    }, timeoutMs);

    const finish = (result: MavenRunResult) => {
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
        output: `Failed to launch mvn: ${err.message}\nExecutable: ${mavenBin}\n\n${output}`,
        duration: Date.now() - startTime,
        timedOut: false,
        spawnError: err.message,
      });
    });

    proc.on("close", (code) => {
      if (settled) {
        return;
      }
      finish({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
        timedOut,
      });
    });
  });
}

/**
 * Parse Maven Surefire summary lines from console output.
 *
 * Example:
 *   [INFO] Tests run: 42, Failures: 0, Errors: 0, Skipped: 3
 */
export function parseMavenOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const summary =
    /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/i;

  let matched = false;
  for (const line of output.split("\n")) {
    if (line.includes("Time elapsed")) {
      continue;
    }

    const match = line.match(summary);
    if (!match) {
      continue;
    }

    matched = true;
    const run = parseInt(match[1], 10);
    const failures = parseInt(match[2], 10);
    const errors = parseInt(match[3], 10);
    const skipped = parseInt(match[4], 10);
    totals.total += run;
    totals.failed += failures + errors;
    totals.skipped += skipped;
    totals.passed += run - failures - errors - skipped;
  }

  if (matched) {
    return totals;
  }

  return totals;
}

function emptyFailureResult(
  output: string,
  duration: number,
): TestResult {
  return {
    success: false,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    output,
    duration,
  };
}

/**
 * Run Java tests via Maven. Installs utilities/comparison-library locally first
 * when a multi-module Java root is found, then runs `mvn test` in the Grove project.
 */
export async function runJavaTests(
  options: TestRunOptions,
): Promise<TestResult> {
  const {
    projectPath,
    testFile,
    timeout = DEFAULT_TIMEOUT,
    env: envOverride,
    testNamePattern,
    mavenPath,
    fallbackMavenPath,
    skipUtilitiesBuild = false,
    extensionVersion = "unknown",
  } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);
  const mavenBin = resolveMavenBin(mavenPath, fallbackMavenPath);
  const startTime = Date.now();

  if (testFile) {
    const resolvedTestFile = path.resolve(projectPath, testFile);
    if (!(await isPathWithinRealBoundary(resolvedTestFile, projectPath))) {
      return {
        success: false,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        output: `Test file is outside the Grove project: ${testFile}`,
        duration: 0,
      };
    }
  }

  const env =
    envOverride !== undefined
      ? envOverride
      : await resolveJavaTestEnv(projectPath);

  let output = `Grove Java v${extensionVersion}\nTimeout limit: ${effectiveTimeout / 1000}s\n`;
  if (env.CONNECTION_STRING) {
    output += "MongoDB: CONNECTION_STRING is set\n";
  } else {
    output +=
      "Warning: CONNECTION_STRING is not set. Add driver-sync/.env, driver-sync/src/.env, or java/.env, or use Grove: Run Current Test File (Grove Core) with a MongoDB connection in the Grove UI.\n";
  }
  output += "\n";

  const remainingTimeout = () =>
    Math.max(effectiveTimeout - (Date.now() - startTime), 1);

  if (!skipUtilitiesBuild) {
    const multiModuleRoot = await resolveJavaMultiModuleRoot(projectPath);
    if (multiModuleRoot) {
      const utilitiesArgs = buildUtilitiesInstallArgs();
      const buildResult = await runMavenCommand({
        mavenBin,
        args: utilitiesArgs,
        cwd: multiModuleRoot,
        env,
        timeoutMs: remainingTimeout(),
        outputPrefix: "=== Installing Java utilities (comparison-library) ===",
      });

      output += buildResult.output + "\n";

      if (buildResult.spawnError) {
        return emptyFailureResult(output, Date.now() - startTime);
      }
      if (buildResult.timedOut) {
        return emptyFailureResult(
          `${output}Utilities build timed out after ${effectiveTimeout / 1000} seconds\n`,
          Date.now() - startTime,
        );
      }
      if (!buildResult.success) {
        return emptyFailureResult(
          `${output}Utilities build failed. Fix Maven errors before running tests.\n`,
          Date.now() - startTime,
        );
      }
    } else {
      output +=
        "Note: No Java multi-module root found; skipping utilities install.\n" +
        "If tests fail on missing com.mongodb.docs:comparison-library, open the java/ parent folder or run mvn install -DskipTests from that directory.\n\n";
    }
  }

  const testArgs = buildMavenTestArgs({ testFile, testNamePattern });
  const testResult = await runMavenCommand({
    mavenBin,
    args: testArgs,
    cwd: projectPath,
    env,
    timeoutMs: remainingTimeout(),
    outputPrefix: "=== Running Maven tests ===",
  });

  output += testResult.output;

  if (testResult.spawnError) {
    return emptyFailureResult(output, Date.now() - startTime);
  }

  const duration = Date.now() - startTime;

  if (testResult.timedOut) {
    return emptyFailureResult(
      `${output}\nTest execution timed out after ${effectiveTimeout / 1000} seconds\n`,
      duration,
    );
  }

  const counts = parseMavenOutput(output);

  return {
    success: testResult.success,
    total: counts.total,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    output,
    duration,
  };
}
