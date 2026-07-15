import * as vscode from "vscode";
import { runPythonTests, detectPythonProject } from "./test-runner";
import { isRunnablePythonTestFile } from "./test-file";
import { type GroveCoreApi } from "@grove/shared";

function getConfiguredPythonPath(): string | undefined {
  const fromPythonExt = vscode.workspace
    .getConfiguration("python")
    .get<string>("defaultInterpreterPath")
    ?.trim();
  return fromPythonExt || undefined;
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

  if (!coreApi?.registerTestRunner || !coreApi.runGroveTests) {
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
    isRunnableTestFile: isRunnablePythonTestFile,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.python.runTests", () =>
      coreApi.runGroveTests({ language: "python" }),
    ),

    vscode.commands.registerCommand("grove.python.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      await coreApi.runGroveTests({
        language: "python",
        activeFilePath: editor.document.uri.fsPath,
        documentScheme: editor.document.uri.scheme,
        testFileScope: true,
      });
    }),
  );

  console.log("Grove for Python extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
