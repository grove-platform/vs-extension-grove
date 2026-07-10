import * as vscode from "vscode";
import * as path from "path";
import { runCSharpTests, detectCSharpProject } from "./test-runner";
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

function getConfiguredDotnetPath(): string | undefined {
  const fromDotnetExt = vscode.workspace
    .getConfiguration("dotnet")
    .get<string>("dotnetPath")
    ?.trim();
  return fromDotnetExt || undefined;
}

function runCSharpWithConfiguredDotnet(
  options: Parameters<typeof runCSharpTests>[0],
): ReturnType<typeof runCSharpTests> {
  return runCSharpTests({
    ...options,
    fallbackDotnetPath:
      options.fallbackDotnetPath ?? getConfiguredDotnetPath(),
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
    vscode.window.showInformationMessage(
      `Tests passed: ${result.passed}/${result.total}`,
    );
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
    run: runCSharpWithConfiguredDotnet,
    detect: detectCSharpProject,
  });

  const outputChannel = vscode.window.createOutputChannel("Grove C# Tests");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.csharp.runTests", async () => {
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
          title: "Running C# tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("CSharp.runCSharpTests", () =>
            runCSharpWithConfiguredDotnet({ projectPath }),
          );
          showTestResult(result, outputChannel, "=== C# Test Results ===");
        },
      );
    }),

    vscode.commands.registerCommand("grove.csharp.runTestFile", async () => {
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
          const result = await profile("CSharp.runCSharpTestFile", () =>
            runCSharpWithConfiguredDotnet({ projectPath, testFile }),
          );
          showTestResult(
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
