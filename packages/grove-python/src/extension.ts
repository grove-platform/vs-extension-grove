import * as vscode from "vscode";
import * as path from "path";
import { runPythonTests, detectPythonProject } from "./test-runner";
import { isRunnablePythonTestFile } from "./test-file";
import {
  detectGroveProjects,
  findProjectForFile,
  profile,
  type GroveCoreApi,
  isPathWithinRealBoundary,
} from "@grove/shared";

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

function requireTrustedWorkspace(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showErrorMessage(
    "Grove Python tests cannot run in an untrusted workspace. Trust this workspace first.",
  );
  return false;
}

function runPythonWithConfiguredInterpreter(
  extensionVersion: string,
  options: Parameters<typeof runPythonTests>[0],
): ReturnType<typeof runPythonTests> {
  return runPythonTests({
    ...options,
    extensionVersion,
    fallbackPythonPath:
      options.fallbackPythonPath ?? getConfiguredPythonPath(),
  });
}

async function findProjectPathForFile(
  filePath: string,
): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }

  const projects = await detectGroveProjects(workspaceRoot);
  const project = findProjectForFile(filePath, projects);
  return project?.rootPath;
}

async function resolveProjectPathForRunAll(
  activeFile?: string,
): Promise<string | undefined> {
  if (activeFile) {
    const projectPath = await findProjectPathForFile(activeFile);
    if (projectPath) {
      return projectPath;
    }
  }

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot && (await detectPythonProject(workspaceRoot))) {
    return workspaceRoot;
  }

  return undefined;
}

async function isFileInsideProject(
  projectPath: string,
  filePath: string,
): Promise<boolean> {
  return isPathWithinRealBoundary(filePath, projectPath);
}

async function showTestResult(
  result: Awaited<ReturnType<typeof runPythonTests>>,
  outputChannel: vscode.OutputChannel,
  header: string,
): Promise<void> {
  if (result.output) {
    outputChannel.clear();
    outputChannel.appendLine(header);
    outputChannel.appendLine(`Duration: ${result.duration}ms`);
    outputChannel.appendLine(`Success: ${result.success}`);
    outputChannel.appendLine(``);
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
      ? "Python tests failed to run. Check output for details."
      : `Tests failed: ${result.failed}/${result.total}`;

  const action = await vscode.window.showErrorMessage(message, "Show Output");
  if (action === "Show Output") {
    outputChannel.show();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Python extension activating...");

  const extensionVersion = context.extension.packageJSON.version ?? "unknown";
  const runTestsForProject = (options: Parameters<typeof runPythonTests>[0]) =>
    runPythonWithConfiguredInterpreter(extensionVersion, options);

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
    run: runTestsForProject,
    detect: detectPythonProject,
  });

  const outputChannel = vscode.window.createOutputChannel("Grove Python Tests");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.python.runTests", async () => {
      if (!requireTrustedWorkspace()) {
        return;
      }

      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = await resolveProjectPathForRunAll(activeFile);

      if (!projectPath) {
        vscode.window.showErrorMessage(
          "No Grove Python project found. Open a file inside a Grove project and try again.",
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running Python tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("Python.runPythonTests", () =>
            runTestsForProject({ projectPath }),
          );
          await showTestResult(result, outputChannel, "=== Python Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.python.runTestFile", async () => {
      if (!requireTrustedWorkspace()) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      if (
        !isRunnablePythonTestFile(filePath, editor.document.uri.scheme)
      ) {
        vscode.window.showWarningMessage(
          "Open a Python test file (for example test_foo.py) before running this command.",
        );
        return;
      }

      const projectPath = await findProjectPathForFile(filePath);
      if (!projectPath) {
        vscode.window.showErrorMessage(
          "Open a file inside a Grove project to run tests.",
        );
        return;
      }

      if (!(await isFileInsideProject(projectPath, filePath))) {
        vscode.window.showErrorMessage(
          "Test file is outside the Grove project.",
        );
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
          const result = await profile("Python.runPythonTestFile", () =>
            runTestsForProject({ projectPath, testFile }),
          );
          await showTestResult(
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
