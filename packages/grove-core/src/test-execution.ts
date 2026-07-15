/**
 * Shared Test Execution Module
 *
 * Provides common test execution helpers used by grove.runTests,
 * grove.runTestFile, language-specific commands, and CodeLens runs.
 */

import * as vscode from "vscode";
import * as path from "path";
import { findProjectForFile, isPathWithinRealBoundary } from "@grove/shared";
import type { GroveLanguage, GroveProject } from "@grove/shared";
import { getTestRunner, resolveRunnerForProject, runTests } from "./test-runner-api";
import { getTestOutputChannel } from "./logger";
import { getCachedProjects } from "./project-cache";
import { maskConnectionString } from "./mongo/credentials";

const RUNNABLE_TEST_FILE_MESSAGES: Partial<Record<GroveLanguage, string>> = {
  csharp:
    "Open a C# test file (for example InsertTests.cs) before running this command.",
  nodejs:
    "Open a Node.js test file (for example foo.test.js) before running this command.",
  python:
    "Open a Python test file (for example test_foo.py) before running this command.",
};

const LANGUAGE_DISPLAY_NAMES: Partial<Record<GroveLanguage, string>> = {
  csharp: "C#",
  nodejs: "Node.js",
  python: "Python",
  java: "Java",
  go: "Go",
  mongosh: "mongosh",
};

let getUiConnectionString: (() => string | undefined) | undefined;

export function initTestExecution(options: {
  getUiConnectionString: () => string | undefined;
}): void {
  getUiConnectionString = options.getUiConnectionString;
}

export interface RunGroveTestsOptions {
  language?: string;
  activeFilePath?: string;
  documentScheme?: string;
  testFileScope?: boolean;
  testNamePattern?: string;
}

export interface TestRunOptions {
  /** Relative path to the specific test file. */
  testFile?: string;
  /** Pattern to match test names (for targeted test runs). */
  testNamePattern?: string;
  /** Additional env variables to inject (e.g., CONNECTION_STRING). */
  env?: Record<string, string>;
}

export interface ResolvedProject {
  project: GroveProject;
  allProjects: GroveProject[];
}

export function requireTrustedWorkspace(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showErrorMessage(
    "Grove tests cannot run in an untrusted workspace. Trust this workspace first.",
  );
  return false;
}

function languageLabel(language: string): string {
  return LANGUAGE_DISPLAY_NAMES[language as GroveLanguage] ?? language;
}

/**
 * Resolve a Grove project, optionally filtered to a specific language.
 */
export async function resolveProjectForLanguage(
  language: string,
  activeFilePath?: string,
): Promise<ResolvedProject | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder open");
    return undefined;
  }

  const projects = await getCachedProjects();
  const languageProjects = projects.filter((p) => p.language === language);

  if (languageProjects.length === 0) {
    vscode.window.showErrorMessage(
      `No Grove ${languageLabel(language)} project found. Open a file inside a Grove project and try again.`,
    );
    return undefined;
  }

  if (activeFilePath) {
    const project = findProjectForFile(activeFilePath, languageProjects);
    if (project) {
      return { project, allProjects: projects };
    }
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const rootProject = languageProjects.find(
    (p) => path.resolve(p.rootPath) === path.resolve(workspaceRoot),
  );
  if (rootProject) {
    return { project: rootProject, allProjects: projects };
  }

  if (languageProjects.length === 1) {
    return { project: languageProjects[0], allProjects: projects };
  }

  vscode.window.showErrorMessage(
    `No Grove ${languageLabel(language)} project found. Open a file inside a Grove project and try again.`,
  );
  return undefined;
}

/**
 * Resolve the Grove project for the current context.
 * Returns undefined if no project can be determined.
 */
export async function resolveProject(
  activeFilePath?: string,
): Promise<ResolvedProject | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder open");
    return undefined;
  }

  const projects = await getCachedProjects();

  if (projects.length === 0) {
    vscode.window.showErrorMessage(
      "No Grove project detected. Create a snip.js file to define a Grove project.",
    );
    return undefined;
  }

  const filePath =
    activeFilePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!filePath) {
    const projectList = projects
      .map((p) => p.relativePath || "root")
      .join(", ");
    vscode.window.showErrorMessage(
      `Cannot determine which Grove project to test. Open a file within a Grove project and try again. Detected projects: ${projectList}`,
    );
    return undefined;
  }

  const project = findProjectForFile(filePath, projects);
  if (!project) {
    const projectList = projects
      .map((p) => p.relativePath || "root")
      .join(", ");
    vscode.window.showErrorMessage(
      `Cannot determine which Grove project to test. Open a file within a Grove project and try again. Detected projects: ${projectList}`,
    );
    return undefined;
  }

  return { project, allProjects: projects };
}

function validateRunnableTestFile(
  language: string,
  filePath: string,
  scheme: string,
): boolean {
  const runner = getTestRunner(language);
  if (!runner?.isRunnableTestFile) {
    return true;
  }

  if (runner.isRunnableTestFile(filePath, scheme)) {
    return true;
  }

  const message =
    (language in RUNNABLE_TEST_FILE_MESSAGES
      ? RUNNABLE_TEST_FILE_MESSAGES[language as GroveLanguage]
      : undefined) ??
    "Open a test file before running this command.";
  vscode.window.showWarningMessage(message);
  return false;
}

/**
 * Shared entry point for Grove Core and language-specific test commands.
 */
export async function runGroveTests(
  options: RunGroveTestsOptions = {},
): Promise<void> {
  if (!requireTrustedWorkspace()) {
    return;
  }

  const {
    language,
    activeFilePath,
    documentScheme = "file",
    testFileScope = false,
    testNamePattern,
  } = options;

  if (testFileScope) {
    if (!activeFilePath) {
      vscode.window.showWarningMessage("No active file");
      return;
    }

    if (documentScheme !== "file") {
      vscode.window.showWarningMessage(
        "Open a file on disk before running this command.",
      );
      return;
    }
  }

  const resolved = language
    ? await resolveProjectForLanguage(
        language,
        activeFilePath ?? vscode.window.activeTextEditor?.document.uri.fsPath,
      )
    : await resolveProject(activeFilePath);
  if (!resolved) {
    return;
  }

  const projectLanguage = language ?? resolved.project.language ?? undefined;
  let testFile: string | undefined;

  if (testFileScope) {
    if (!activeFilePath) {
      return;
    }

    if (
      projectLanguage &&
      !validateRunnableTestFile(projectLanguage, activeFilePath, documentScheme)
    ) {
      return;
    }

    if (
      !(await isPathWithinRealBoundary(
        activeFilePath,
        resolved.project.rootPath,
      ))
    ) {
      vscode.window.showErrorMessage(
        "Test file is outside the Grove project.",
      );
      return;
    }

    testFile = path.relative(resolved.project.rootPath, activeFilePath);
  }

  const uiConnectionString = getUiConnectionString?.();
  const usingUiConnection =
    resolved.project.supportsEnvInjection && !!uiConnectionString;

  const progressTitle = testFile
    ? usingUiConnection
      ? `Running tests for ${testFile} (using Grove MongoDB connection)...`
      : `Running tests for ${testFile}...`
    : usingUiConnection
      ? "Running tests (using Grove MongoDB connection)..."
      : "Running tests...";

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: progressTitle,
      cancellable: false,
    },
    async () => {
      await runGroveTestsForResolvedProject(resolved, {
        testFile,
        testNamePattern,
        label: testFile ?? resolved.project.displayName,
        uiConnectionString,
      });
    },
  );
}

/**
 * Execute tests and return results along with the runner used.
 * Returns undefined if no runner was found.
 */
export async function executeTests(
  projectPath: string,
  opts: TestRunOptions & { language?: string | null } = {},
) {
  if (!requireTrustedWorkspace()) {
    return undefined;
  }

  const runner = await resolveRunnerForProject({
    projectPath,
    language: opts.language,
  });
  if (!runner) {
    vscode.window.showWarningMessage(
      "No test runner found. Install a Grove language extension (e.g., Grove for Node.js).",
    );
    return undefined;
  }

  const result = await runTests({
    projectPath,
    testFile: opts.testFile,
    testNamePattern: opts.testNamePattern,
    env: opts.env,
    language: runner.language,
  });

  return { result, runner };
}

/**
 * Run tests for a resolved Grove project and show results in the Grove Tests channel.
 */
export async function runGroveTestsForResolvedProject(
  resolved: ResolvedProject,
  options: {
    testFile?: string;
    testNamePattern?: string;
    label: string;
    uiConnectionString?: string;
  },
): Promise<void> {
  const { resolveTestEnv } = await import("./test-env");
  const env = await resolveTestEnv(resolved.project, options.uiConnectionString);

  const usingUiConnection =
    resolved.project.supportsEnvInjection && !!options.uiConnectionString;

  const outcome = await executeTests(resolved.project.rootPath, {
    testFile: options.testFile,
    testNamePattern: options.testNamePattern,
    env,
    language: resolved.project.language,
  });
  if (!outcome) {
    return;
  }

  let sanitizedOutput = outcome.result.output ?? "";
  const uiConnectionString = options.uiConnectionString;
  if (uiConnectionString && sanitizedOutput.includes(uiConnectionString)) {
    const masked = maskConnectionString(uiConnectionString);
    sanitizedOutput = sanitizedOutput.replaceAll(uiConnectionString, masked);
    getTestOutputChannel().warn(
      "Connection string was detected in test output and has been masked.",
    );
  }

  const extraLines = usingUiConnection
    ? ["MongoDB: Using Grove extension connection"]
    : undefined;

  displayTestResults(
    sanitizedOutput,
    outcome.result,
    options.label,
    extraLines,
  );
}

/**
 * Write test results to the "Grove Tests" output channel and show a
 * pass/fail notification.
 */
export function displayTestResults(
  output: string,
  result: {
    success: boolean;
    passed?: number;
    failed?: number;
    skipped?: number;
    total?: number;
    duration: number;
  },
  label: string,
  extraLines?: string[],
): void {
  const ch = getTestOutputChannel();
  ch.clear();
  ch.appendLine("=== Grove Test Results ===");
  ch.appendLine(`Test: ${label}`);
  ch.appendLine(`Duration: ${result.duration}ms`);
  ch.appendLine(`Success: ${result.success}`);
  if (result.total != null && result.total > 0) {
    ch.appendLine(
      `Summary: ${result.passed ?? 0} passed, ${result.failed ?? 0} failed, ${result.skipped ?? 0} skipped (${result.total} total)`,
    );
  }
  if (extraLines) {
    for (const line of extraLines) {
      ch.appendLine(line);
    }
  }
  ch.appendLine("");
  ch.appendLine(output);

  if (result.success) {
    const msg =
      result.total != null && result.total > 0
        ? `Tests passed: ${result.passed ?? 0}/${result.total}`
        : `Tests completed successfully`;
    vscode.window.showInformationMessage(msg);
  } else {
    const msg =
      result.total != null && result.total > 0
        ? `Tests failed: ${result.failed ?? 0}/${result.total}`
        : `Test runner failed. Check output for details.`;
    vscode.window.showErrorMessage(msg, "Show Output").then((action) => {
      if (action === "Show Output") {
        ch.show();
      }
    });
  }
}
