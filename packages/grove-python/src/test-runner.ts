import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { isPathWithinRealBoundary, killProcessTree } from "@grove/shared";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  /** Additional environment variables to inject into the test process */
  env?: Record<string, string>;
  /** Test name pattern for filtering tests (pytest -k, unittest -k) */
  testNamePattern?: string;
  /** Explicit Python interpreter override (highest priority) */
  pythonPath?: string;
  /** Fallback interpreter when no project venv exists (e.g. VS Code setting) */
  fallbackPythonPath?: string;
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

type PythonTestFramework = "pytest" | "unittest";

const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 300_000;

const VENV_PYTHON_CANDIDATES = [
  ".venv/bin/python",
  "venv/bin/python",
  ".venv/Scripts/python.exe",
  "venv/Scripts/python.exe",
];

/** PyMongo-style layout; avoid generic `tests/` so pytest-only repos are not misclassified. */
const UNITTEST_DISCOVER_DIRS = ["tests_package"];

function getSystemPythonBin(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Resolve the Python interpreter for a Grove project.
 * Prefers an explicit path, then a project-local venv, then system python.
 */
export async function resolvePythonBin(
  projectPath: string,
  pythonPath?: string,
  fallbackPythonPath?: string,
): Promise<string> {
  const explicit = pythonPath?.trim();
  if (explicit) {
    return explicit;
  }

  for (const relative of VENV_PYTHON_CANDIDATES) {
    const candidate = path.join(projectPath, relative);
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  const fallback = fallbackPythonPath?.trim();
  if (fallback) {
    return fallback;
  }

  return getSystemPythonBin();
}

/**
 * Detect whether the workspace looks like a Python Grove project.
 * Matches @grove/shared language detection: `pyproject.toml` or `pytest.ini`.
 */
export async function detectPythonProject(
  projectPath: string,
): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, "pyproject.toml"));
    return true;
  } catch {
    try {
      await fs.access(path.join(projectPath, "pytest.ini"));
      return true;
    } catch {
      return false;
    }
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** True when the project configures pytest explicitly. */
export async function usesPytest(projectPath: string): Promise<boolean> {
  if (await pathExists(path.join(projectPath, "pytest.ini"))) {
    return true;
  }

  try {
    const content = await fs.readFile(
      path.join(projectPath, "pyproject.toml"),
      "utf-8",
    );
    return /\[tool\.pytest(?:\.ini_options)?\]/m.test(content);
  } catch {
    return false;
  }
}

/** Resolve unittest discover root (PyMongo uses tests_package/). */
export async function resolveUnittestDiscoverDir(
  projectPath: string,
): Promise<string | undefined> {
  for (const dir of UNITTEST_DISCOVER_DIRS) {
    if (await pathExists(path.join(projectPath, dir))) {
      return dir;
    }
  }
  return undefined;
}

export async function resolveTestFramework(
  projectPath: string,
): Promise<PythonTestFramework> {
  if (await usesPytest(projectPath)) {
    return "pytest";
  }
  if (await resolveUnittestDiscoverDir(projectPath)) {
    return "unittest";
  }
  return "pytest";
}

/**
 * Build argv for `python` after the interpreter path (e.g. `-m`, `pytest`, paths).
 * `unittest` + single-file + `-k` only works on Python 3.12+, so we omit `-k`
 * for that shape and only pass it for `unittest discover` (supported since 3.7).
 */
export function buildTestArgs(
  framework: PythonTestFramework,
  options: {
    testFile?: string;
    testNamePattern?: string;
    unittestDiscoverDir?: string;
  },
): string[] {
  const { testFile, testNamePattern, unittestDiscoverDir } = options;

  if (framework === "pytest") {
    const args = ["-m", "pytest", "--tb=short", "-q"];
    if (testFile) {
      args.push(testFile);
    }
    if (testNamePattern) {
      args.push("-k", testNamePattern);
    }
    return args;
  }

  if (testFile) {
    return ["-m", "unittest", testFile];
  }

  const discoverDir = unittestDiscoverDir ?? "tests_package";
  const args = ["-m", "unittest", "discover", discoverDir];
  if (testNamePattern) {
    args.push("-k", testNamePattern);
  }
  return args;
}

/**
 * Run Python tests via pytest or unittest, depending on project layout.
 * PyMongo suites use: python3 -m unittest discover tests_package
 */
export async function runPythonTests(
  options: TestRunOptions,
): Promise<TestResult> {
  const {
    projectPath,
    testFile,
    timeout = DEFAULT_TIMEOUT,
    env,
    testNamePattern,
    pythonPath,
    fallbackPythonPath,
    extensionVersion = "unknown",
  } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);

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

  const pythonBin = await resolvePythonBin(
    projectPath,
    pythonPath,
    fallbackPythonPath,
  );
  const unittestDiscoverDir = await resolveUnittestDiscoverDir(projectPath);
  const framework = await resolveTestFramework(projectPath);
  const args = buildTestArgs(framework, {
    testFile,
    testNamePattern,
    unittestDiscoverDir,
  });

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = `Grove Python v${extensionVersion}\nUsing Python: ${pythonBin}\n\n`;
    let timedOut = false;
    let settled = false;

    const proc = spawn(pythonBin, args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true", ...env },
      detached: process.platform !== "win32",
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcessTree(proc);
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
        output: `Failed to launch Python: ${err.message}\nInterpreter: ${pythonBin}\n\n${output}`,
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

      const counts =
        framework === "unittest"
          ? parseUnittestOutput(output)
          : parsePytestOutput(output);

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
 * Parse pytest console output to extract test counts.
 */
export function parsePytestOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const lines = output.trim().split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!/\d+\s+(passed|failed|skipped|error)/i.test(line)) {
      continue;
    }

    const passed = line.match(/(\d+)\s+passed/i);
    const failed = line.match(/(\d+)\s+failed/i);
    const skipped = line.match(/(\d+)\s+skipped/i);
    const errors = line.match(/(\d+)\s+error/i);

    const passedCount = passed ? parseInt(passed[1], 10) : 0;
    const failedCount =
      (failed ? parseInt(failed[1], 10) : 0) +
      (errors ? parseInt(errors[1], 10) : 0);
    const skippedCount = skipped ? parseInt(skipped[1], 10) : 0;

    if (passedCount + failedCount + skippedCount === 0) {
      continue;
    }

    return {
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      total: passedCount + failedCount + skippedCount,
    };
  }

  return defaults;
}

/**
 * Parse unittest console output (e.g. "Ran 7 tests in 0.012s" / "OK").
 */
export function parseUnittestOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const ran = output.match(/Ran\s+(\d+)\s+tests?\s+in/i);
  if (!ran) {
    return defaults;
  }

  const total = parseInt(ran[1], 10);
  const failures = output.match(/failures=(\d+)/i);
  const errors = output.match(/errors=(\d+)/i);
  const skipped = output.match(/skipped=(\d+)/i);
  const failed =
    (failures ? parseInt(failures[1], 10) : 0) +
    (errors ? parseInt(errors[1], 10) : 0);
  const skippedCount = skipped ? parseInt(skipped[1], 10) : 0;

  return {
    total,
    passed: Math.max(0, total - failed - skippedCount),
    failed,
    skipped: skippedCount,
  };
}
