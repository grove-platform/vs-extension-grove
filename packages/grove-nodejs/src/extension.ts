import * as vscode from "vscode";
import * as path from "path";
import { runJestTests, detectJestProject } from "./test-runner";
import {
  detectGroveProjects,
  findProjectForFile,
  profile,
} from "@grove/shared";

// Type definition for grove-core API
interface GroveCoreApi {
  registerTestRunner(runner: {
    language: string;
    name: string;
    run: (options: {
      projectPath: string;
      testFile?: string;
      timeout?: number;
      testNamePattern?: string;
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

/**
 * Find the Grove project that contains a file, or fall back to workspace root.
 */
async function findProjectPathForFile(filePath: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return "";

  const projects = await detectGroveProjects(workspaceRoot);
  const project = findProjectForFile(filePath, projects);

  return project?.rootPath || workspaceRoot;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Node.js extension activating...");

  // Get grove-core extension
  const groveCore =
    vscode.extensions.getExtension<GroveCoreApi>("mongodb.grove-core");

  if (!groveCore) {
    vscode.window.showErrorMessage(
      "Grove Core extension not found. Please install it first.",
    );
    return;
  }

  // Ensure grove-core is activated and get its API
  const coreApi = await groveCore.activate();

  if (!coreApi?.registerTestRunner) {
    vscode.window.showErrorMessage(
      "Grove Core API not available. Please update Grove Core.",
    );
    return;
  }

  // Register Jest test runner with grove-core
  coreApi.registerTestRunner({
    language: "nodejs",
    name: "Jest",
    run: runJestTests,
    detect: detectJestProject,
  });

  // Create output channel for test results
  const outputChannel = vscode.window.createOutputChannel(
    "Grove Node.js Tests",
  );

  // Register language-specific commands
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.nodejs.runTests", async () => {
      // Determine project path from active file or workspace root
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
          title: "Running Jest tests...",
          cancellable: false,
        },
        async () => {
          const result = await profile("NodeJS.runJestTests", () =>
            runJestTests({ projectPath }),
          );

          // Log output to channel
          if (result.output) {
            outputChannel.clear();
            outputChannel.appendLine(`=== Jest Test Results ===`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            outputChannel.appendLine(`Success: ${result.success}`);
            outputChannel.appendLine(``);
            outputChannel.appendLine(result.output);
          }

          if (result.success) {
            vscode.window.showInformationMessage(
              `Tests passed: ${result.passed}/${result.total}`,
            );
          } else {
            const message =
              result.total === 0
                ? `Jest failed to run. Check output for details.`
                : `Tests failed: ${result.failed}/${result.total}`;

            const action = await vscode.window.showErrorMessage(
              message,
              "Show Output",
            );
            if (action === "Show Output") {
              outputChannel.show();
            }
          }
        },
      );
    }),

    vscode.commands.registerCommand("grove.nodejs.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      const filePath = editor.document.uri.fsPath;

      // Find the Grove project containing this file
      const projectPath = await findProjectPathForFile(filePath);
      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Make test file path relative to the project root (not workspace root)
      const testFile = path.relative(projectPath, filePath);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running tests for ${testFile}...`,
          cancellable: false,
        },
        async () => {
          const result = await profile("NodeJS.runJestTestFile", () =>
            runJestTests({ projectPath, testFile }),
          );

          // Log output to channel
          if (result.output) {
            outputChannel.clear();
            outputChannel.appendLine(`=== Jest Test Results: ${testFile} ===`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            outputChannel.appendLine(`Success: ${result.success}`);
            outputChannel.appendLine(``);
            outputChannel.appendLine(result.output);
          }

          if (result.success) {
            vscode.window.showInformationMessage(
              `Tests passed: ${result.passed}/${result.total}`,
            );
          } else {
            const message =
              result.total === 0
                ? `Jest failed to run. Check output for details.`
                : `Tests failed: ${result.failed}/${result.total}`;

            const action = await vscode.window.showErrorMessage(
              message,
              "Show Output",
            );
            if (action === "Show Output") {
              outputChannel.show();
            }
          }
        },
      );
    }),
  );

  console.log("Grove for Node.js extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
