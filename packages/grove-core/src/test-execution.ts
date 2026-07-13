/**
 * Shared Test Execution Module
 *
 * Provides common test execution helpers used by both grove.runTests
 * and the test CodeLens runTestBlock function.
 */

import * as vscode from "vscode";
import { findProjectForFile } from "@grove/shared";
import type { GroveProject } from "@grove/shared";
import { findTestRunnerForProject, runTests } from "./test-runner-api";
import { getTestOutputChannel } from "./logger";
import { getCachedProjects } from "./project-cache";

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

/**
 * Execute tests and return results along with the runner used.
 * Returns undefined if no runner was found.
 */
export async function executeTests(
  projectPath: string,
  opts: TestRunOptions = {},
) {
  const runner = await findTestRunnerForProject(projectPath);
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
  });

  return { result, runner };
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
