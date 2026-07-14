import * as vscode from "vscode";
import * as path from "path";
import { runJavaTests, detectJavaProject } from "./test-runner";
import { resolveJavaTestEnv } from "./env";
import { isRunnableJavaTestFile } from "./test-file";
import {
  detectGroveProjects,
  findProjectForFile,
  profile,
} from "@grove/shared";

interface GroveCoreApi {
  registerTestRunner(runner: {
    language: string;
    name: string;
    run: (options: {
      projectPath: string;
      testFile?: string;
      timeout?: number;
      testNamePattern?: string;
      env?: Record<string, string>;
    }) => Promise<{
      success: boolean;
      total?: number;
      passed?: number;
      failed?: number;
      skipped?: number;
      output?: string;
      duration: number;
    }>;
    detect: (projectPath: string) => Promise<boolean>;
  }): void;
}

function getWorkspaceRoot(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath || "";
}

function getConfiguredMavenPath(): string | undefined {
  return (
    vscode.workspace
      .getConfiguration("grove")
      .get<string>("java.mavenPath")
      ?.trim() || undefined
  );
}

function getConfiguredTestTimeoutMs(): number {
  const seconds = vscode.workspace
    .getConfiguration("grove")
    .get<number>("java.testTimeoutSeconds", 300);
  const clamped = Math.min(Math.max(seconds, 30), 300);
  return clamped * 1000;
}

function shouldSkipUtilitiesBuild(): boolean {
  return vscode.workspace
    .getConfiguration("grove")
    .get<boolean>("java.skipUtilitiesBuild", false);
}

function runJavaWithConfiguredMaven(
  options: Parameters<typeof runJavaTests>[0],
): ReturnType<typeof runJavaTests> {
  return runJavaTests({
    ...options,
    timeout: options.timeout ?? getConfiguredTestTimeoutMs(),
    fallbackMavenPath: options.fallbackMavenPath ?? getConfiguredMavenPath(),
    skipUtilitiesBuild:
      options.skipUtilitiesBuild ?? shouldSkipUtilitiesBuild(),
  });
}

async function findProjectPathForFile(filePath: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return "";

  const projects = await detectGroveProjects(workspaceRoot);
  const project = findProjectForFile(filePath, projects);

  return project?.rootPath || workspaceRoot;
}

async function showTestResult(
  result: Awaited<ReturnType<typeof runJavaTests>>,
  outputChannel: vscode.OutputChannel,
  header: string,
): Promise<void> {
  if (result.output) {
    outputChannel.clear();
    outputChannel.appendLine(header);
    outputChannel.appendLine(`Duration: ${result.duration}ms`);
    outputChannel.appendLine(`Success: ${result.success}`);
    outputChannel.appendLine("");
    outputChannel.appendLine(result.output);
  }

  if (result.success) {
    const msg =
      result.total > 0
        ? `Tests passed: ${result.passed}/${result.total}`
        : "Tests completed successfully";
    vscode.window.showInformationMessage(msg);
    return;
  }

  const message =
    result.total === 0
      ? "Java tests failed to run. Check output for details."
      : `Tests failed: ${result.failed}/${result.total}`;

  const action = await vscode.window.showErrorMessage(message, "Show Output");
  if (action === "Show Output") {
    outputChannel.show();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Java extension activating...");

  const groveCore =
    vscode.extensions.getExtension<GroveCoreApi>(
      "GrovePlatform.grove-platform-core",
    );

  if (!groveCore) {
    vscode.window.showErrorMessage(
      "Grove Core extension not found. Please install it first.",
    );
    return;
  }

  const coreApi = await groveCore.activate();

  if (!coreApi?.registerTestRunner) {
    vscode.window.showErrorMessage(
      "Grove Core API not available. Please update Grove Core.",
    );
    return;
  }

  coreApi.registerTestRunner({
    language: "java",
    name: "JUnit (Maven)",
    run: runJavaWithConfiguredMaven,
    detect: detectJavaProject,
  });

  const outputChannel = vscode.window.createOutputChannel("Grove Java Tests");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.java.runTests", async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = activeFile
        ? await findProjectPathForFile(activeFile)
        : getWorkspaceRoot();

      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running Java tests...",
          cancellable: false,
        },
        async () => {
          const env = await resolveJavaTestEnv(projectPath);
          const result = await profile("Java.runJavaTests", () =>
            runJavaWithConfiguredMaven({ projectPath, env }),
          );
          await showTestResult(result, outputChannel, "=== Java Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.java.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      if (
        !isRunnableJavaTestFile(filePath, editor.document.uri.scheme)
      ) {
        vscode.window.showWarningMessage(
          "Open a Java test file (for example TutorialTests.java under src/test/java) before running this command.",
        );
        return;
      }

      const projectPath = await findProjectPathForFile(filePath);
      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const testFile = path.relative(projectPath, filePath);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running tests for ${testFile}...`,
          cancellable: false,
        },
        async () => {
          const env = await resolveJavaTestEnv(projectPath);
          const result = await profile("Java.runJavaTestFile", () =>
            runJavaWithConfiguredMaven({ projectPath, testFile, env }),
          );
          await showTestResult(
            result,
            outputChannel,
            `=== Java Test Results: ${testFile} ===`,
          );
        },
      );
    }),
  );

  console.log("Grove for Java extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
