import * as vscode from "vscode";
import { runCSharpTests, detectCSharpProject } from "./test-runner";
import { isRunnableCSharpTestFile } from "./test-file";
import { type GroveCoreApi } from "@grove/shared";

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

  if (!coreApi?.registerTestRunner || !coreApi.runGroveTests) {
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
    isRunnableTestFile: isRunnableCSharpTestFile,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.csharp.runTests", () =>
      coreApi.runGroveTests({ language: "csharp" }),
    ),

    vscode.commands.registerCommand("grove.csharp.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      await coreApi.runGroveTests({
        language: "csharp",
        activeFilePath: editor.document.uri.fsPath,
        documentScheme: editor.document.uri.scheme,
        testFileScope: true,
      });
    }),
  );

  console.log("Grove for C# extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
