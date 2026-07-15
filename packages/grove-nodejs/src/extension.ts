import * as vscode from "vscode";
import * as path from "path";
import { runJestTests, detectJestProject } from "./test-runner";
import { isRunnableNodeTestFile } from "./test-file";
import {
  detectGroveProjects,
  findProjectForFile,
  profile,
  type GroveCoreApi,
  isPathWithinBoundary,
} from "@grove/shared";

function getWorkspaceRoot(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath || "";
}

function requireTrustedWorkspace(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showErrorMessage(
    "Grove Node.js tests cannot run in an untrusted workspace. Trust this workspace first.",
  );
  return false;
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
  if (workspaceRoot && (await detectJestProject(workspaceRoot))) {
    return workspaceRoot;
  }

  return undefined;
}

function isFileInsideProject(projectPath: string, filePath: string): boolean {
  return isPathWithinBoundary(path.resolve(filePath), path.resolve(projectPath));
}

async function showTestResult(
  result: Awaited<ReturnType<typeof runJestTests>>,
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
      ? "Jest failed to run. Check output for details."
      : `Tests failed: ${result.failed}/${result.total}`;

  const action = await vscode.window.showErrorMessage(message, "Show Output");
  if (action === "Show Output") {
    outputChannel.show();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Node.js extension activating...");

  const extensionVersion = context.extension.packageJSON.version ?? "unknown";
  const runTestsForProject = (options: Parameters<typeof runJestTests>[0]) =>
    runJestTests({ ...options, extensionVersion });

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
    language: "nodejs",
    name: "Jest",
    run: runTestsForProject,
    detect: detectJestProject,
  });

  const outputChannel = vscode.window.createOutputChannel("Grove Node.js Tests");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.nodejs.runTests", async () => {
      if (!requireTrustedWorkspace()) {
        return;
      }

      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = await resolveProjectPathForRunAll(activeFile);

      if (!projectPath) {
        vscode.window.showErrorMessage(
          "No Grove Node.js project found. Open a file inside a Grove project and try again.",
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running Jest tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("NodeJS.runJestTests", () =>
            runTestsForProject({ projectPath }),
          );
          await showTestResult(result, outputChannel, "=== Jest Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.nodejs.runTestFile", async () => {
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
        !isRunnableNodeTestFile(filePath, editor.document.uri.scheme)
      ) {
        vscode.window.showWarningMessage(
          "Open a Node.js test file (for example foo.test.js) before running this command.",
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

      if (!isFileInsideProject(projectPath, filePath)) {
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
          const result = await profile("NodeJS.runJestTestFile", () =>
            runTestsForProject({ projectPath, testFile }),
          );
          await showTestResult(
            result,
            outputChannel,
            `=== Jest Test Results: ${testFile} ===`,
          );
        },
      );
    }),
  );

  console.log("Grove for Node.js extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
