import * as vscode from "vscode";
import * as path from "path";
import { runCSharpTests, detectCSharpProject } from "./test-runner";
import { isRunnableCSharpTestFile } from "./test-file";
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

function getConfiguredDotnetPath(): string | undefined {
  const fromDotnetExt = vscode.workspace
    .getConfiguration("dotnet")
    .get<string>("dotnetPath")
    ?.trim();
  return fromDotnetExt || undefined;
}

function getConfiguredTestTimeoutMs(): number {
  const seconds = vscode.workspace
    .getConfiguration("grove")
    .get<number>("csharp.testTimeoutSeconds", 300);
  const clamped = Math.min(Math.max(seconds, 30), 300);
  return clamped * 1000;
}

function requireTrustedWorkspace(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showErrorMessage(
    "Grove C# tests cannot run in an untrusted workspace. Trust this workspace first.",
  );
  return false;
}

function runCSharpWithConfiguredDotnet(
  extensionVersion: string,
  options: Parameters<typeof runCSharpTests>[0],
): ReturnType<typeof runCSharpTests> {
  return runCSharpTests({
    ...options,
    extensionVersion,
    timeout: options.timeout ?? getConfiguredTestTimeoutMs(),
    fallbackDotnetPath:
      options.fallbackDotnetPath ?? getConfiguredDotnetPath(),
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
  if (workspaceRoot && (await detectCSharpProject(workspaceRoot))) {
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
  result: Awaited<ReturnType<typeof runCSharpTests>>,
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
        : `Tests completed successfully`;
    vscode.window.showInformationMessage(msg);
    return;
  }

  const message =
    result.total === 0
      ? `C# tests failed to run. Check output for details.`
      : `Tests failed: ${result.failed}/${result.total}`;

  const action = await vscode.window.showErrorMessage(message, "Show Output");
  if (action === "Show Output") {
    outputChannel.show();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for C# extension activating...");

  const extensionVersion = context.extension.packageJSON.version ?? "unknown";
  const runTestsForProject = (options: Parameters<typeof runCSharpTests>[0]) =>
    runCSharpWithConfiguredDotnet(extensionVersion, options);

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
    language: "csharp",
    name: "C#",
    run: runTestsForProject,
    detect: detectCSharpProject,
  });

  const outputChannel = vscode.window.createOutputChannel("Grove C# Tests");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.csharp.runTests", async () => {
      if (!requireTrustedWorkspace()) {
        return;
      }

      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = await resolveProjectPathForRunAll(activeFile);

      if (!projectPath) {
        vscode.window.showErrorMessage(
          "No Grove C# project found. Open a file inside a Grove project and try again.",
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running C# tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("CSharp.runCSharpTests", () =>
            runTestsForProject({ projectPath }),
          );
          await showTestResult(result, outputChannel, "=== C# Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.csharp.runTestFile", async () => {
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
        !isRunnableCSharpTestFile(filePath, editor.document.uri.scheme)
      ) {
        vscode.window.showWarningMessage(
          "Open a C# test file (for example InsertTests.cs) before running this command.",
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
          const result = await profile("CSharp.runCSharpTestFile", () =>
            runTestsForProject({ projectPath, testFile }),
          );
          await showTestResult(
            result,
            outputChannel,
            `=== C# Test Results: ${testFile} ===`,
          );
        },
      );
    }),
  );

  console.log("Grove for C# extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
