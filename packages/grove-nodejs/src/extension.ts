import * as vscode from "vscode";
import { runJestTests, detectJestProject } from "./test-runner";
import { isRunnableNodeTestFile } from "./test-file";
import { type GroveCoreApi } from "@grove/shared";

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

  if (!coreApi?.registerTestRunner || !coreApi.runGroveTests) {
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
    isRunnableTestFile: isRunnableNodeTestFile,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.nodejs.runTests", () =>
      coreApi.runGroveTests({ language: "nodejs" }),
    ),

    vscode.commands.registerCommand("grove.nodejs.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      await coreApi.runGroveTests({
        language: "nodejs",
        activeFilePath: editor.document.uri.fsPath,
        documentScheme: editor.document.uri.scheme,
        testFileScope: true,
      });
    }),
  );

  console.log("Grove for Node.js extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
