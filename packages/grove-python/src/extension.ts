import * as vscode from "vscode";
import * as path from "path";
import { runPytestTests, detectPytestProject } from "./test-runner";
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

function getConfiguredPythonPath(): string | undefined {
  const fromPythonExt = vscode.workspace
    .getConfiguration("python")
    .get<string>("defaultInterpreterPath")
    ?.trim();
  return fromPythonExt || undefined;
}

function runPytestWithConfiguredPython(
  options: Parameters<typeof runPytestTests>[0],
): ReturnType<typeof runPytestTests> {
  return runPytestTests({
    ...options,
    fallbackPythonPath:
      options.fallbackPythonPath ?? getConfiguredPythonPath(),
  });
}

async function findProjectPathForFile(filePath: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return "";

  const projects = await detectGroveProjects(workspaceRoot);
  const project = findProjectForFile(filePath, projects);

  return project?.rootPath || workspaceRoot;
}

function showTestResult(
  result: Awaited<ReturnType<typeof runPytestTests>>,
  outputChannel: vscode.OutputChannel,
  header: string,
): void {
  if (result.output) {
    outputChannel.clear();
    outputChannel.appendLine(header);
    outputChannel.appendLine(`Duration: ${result.duration}ms`);
    outputChannel.appendLine(`Success: ${result.success}`);
    outputChannel.appendLine(``);
    outputChannel.appendLine(result.output);
  }

  if (result.success) {
    vscode.window.showInformationMessage(
      `Tests passed: ${result.passed}/${result.total}`,
    );
    return;
  }

  const message =
    result.total === 0
      ? `Python tests failed to run. Check output for details.`
      : `Tests failed: ${result.failed}/${result.total}`;

  void vscode.window
    .showErrorMessage(message, "Show Output")
    .then((action) => {
      if (action === "Show Output") {
        outputChannel.show();
      }
    });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Python extension activating...");

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
    language: "python",
    name: "Python",
    run: runPytestWithConfiguredPython,
    detect: detectPytestProject,
  });

  const outputChannel = vscode.window.createOutputChannel(
    "Grove Python Tests",
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.python.runTests", async () => {
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
          title: "Running Python tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("Python.runPytestTests", () =>
            runPytestWithConfiguredPython({ projectPath }),
          );
          showTestResult(result, outputChannel, "=== Python Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.python.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      const filePath = editor.document.uri.fsPath;
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
          const result = await profile("Python.runPytestTestFile", () =>
            runPytestWithConfiguredPython({ projectPath, testFile }),
          );
          showTestResult(
            result,
            outputChannel,
            `=== Python Test Results: ${testFile} ===`,
          );
        },
      );
    }),
  );

  console.log("Grove for Python extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
