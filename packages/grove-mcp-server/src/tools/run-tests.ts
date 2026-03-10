import { spawn } from "child_process";
import * as path from "path";
import {
  detectLanguage,
  isPathWithinBoundary,
  sanitizePath,
} from "@grove/shared";

const DEFAULT_TIMEOUT = 60_000; // 60 seconds
const MAX_TIMEOUT = 300_000; // 5 minutes
const MAX_OUTPUT_SIZE = 10_000; // 10KB output cap

// Allowlisted test commands per language - no arbitrary command execution
const TEST_RUNNERS: Record<string, { cmd: string; args: string[] }> = {
  nodejs: { cmd: "npx", args: ["jest", "--json", "--testLocationInResults"] },
  python: { cmd: "python", args: ["-m", "pytest", "--tb=short", "-q"] },
  go: { cmd: "go", args: ["test", "-json", "./..."] },
  java: { cmd: "mvn", args: ["test", "-B"] },
  csharp: { cmd: "dotnet", args: ["test", "--logger:console"] },
  mongosh: { cmd: "npx", args: ["jest", "--json"] },
};

/**
 * Handle grove_run_tests tool invocation.
 * Security: Uses allowlisted commands only, validates paths, enforces timeouts.
 */
export async function handleRunTests(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const projectPath = (args.projectPath as string) || "";
  const testFile = args.testFile as string | undefined;
  const languageOverride = args.language as string | undefined;
  const timeoutSeconds = args.timeout as number | undefined;

  if (!workspacePath) {
    return {
      isError: true,
      content: [
        { type: "text", text: "GROVE_WORKSPACE environment variable not set." },
      ],
    };
  }

  // Resolve and validate project path
  const sanitizedProjectPath = projectPath ? sanitizePath(projectPath) : "";
  const fullProjectPath = sanitizedProjectPath
    ? path.resolve(workspacePath, sanitizedProjectPath)
    : workspacePath;

  if (!isPathWithinBoundary(fullProjectPath, workspacePath)) {
    return {
      isError: true,
      content: [
        { type: "text", text: "Project path outside workspace boundaries." },
      ],
    };
  }

  // Detect or use provided language
  const language = languageOverride || (await detectLanguage(fullProjectPath));

  if (!language || !TEST_RUNNERS[language]) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unsupported or undetected language: ${language || "unknown"}. Supported: ${Object.keys(TEST_RUNNERS).join(", ")}`,
        },
      ],
    };
  }

  // Validate test file path if provided
  if (testFile) {
    const sanitizedTestFile = sanitizePath(testFile);
    const fullTestPath = path.resolve(fullProjectPath, sanitizedTestFile);
    if (!isPathWithinBoundary(fullTestPath, workspacePath)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Test file path outside workspace boundaries.",
          },
        ],
      };
    }
  }

  // Calculate timeout (capped at MAX_TIMEOUT)
  const timeout = Math.min((timeoutSeconds || 60) * 1000, MAX_TIMEOUT);

  // Get runner config and build args
  const runner = TEST_RUNNERS[language];
  const runArgs = [...runner.args];

  // Add test file to args if specified (for Jest)
  if (testFile && (language === "nodejs" || language === "mongosh")) {
    runArgs.push(sanitizePath(testFile));
  }

  return runTests(runner.cmd, runArgs, fullProjectPath, timeout, language);
}

async function runTests(
  cmd: string,
  args: string[],
  cwd: string,
  timeout: number,
  language: string,
) {
  return new Promise<{
    isError?: boolean;
    content: Array<{ type: "text"; text: string }>;
  }>((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timedOut = false;

    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, CI: "true" }, // Prevent interactive prompts
      shell: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeout);

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
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "timeout",
                message: `Test execution timed out after ${timeout / 1000} seconds`,
                duration,
              }),
            },
          ],
        });
        return;
      }

      // Parse results based on language
      const result = parseTestOutput(output, code, duration, language);
      resolve({
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    });
  });
}

interface TestResult {
  success: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  output?: string;
  duration: number;
}

function parseTestOutput(
  output: string,
  exitCode: number | null,
  duration: number,
  language: string,
): TestResult {
  // Cap output size to prevent memory issues
  const cappedOutput = output.slice(0, MAX_OUTPUT_SIZE);

  // Try to parse JSON output (Jest)
  if (language === "nodejs" || language === "mongosh") {
    try {
      const jsonResult = JSON.parse(output);
      return {
        success: jsonResult.success,
        total: jsonResult.numTotalTests,
        passed: jsonResult.numPassedTests,
        failed: jsonResult.numFailedTests,
        skipped: jsonResult.numPendingTests,
        duration,
      };
    } catch {
      // Fall through to generic parsing
    }
  }

  // Generic result based on exit code
  return {
    success: exitCode === 0,
    output: cappedOutput,
    duration,
  };
}
