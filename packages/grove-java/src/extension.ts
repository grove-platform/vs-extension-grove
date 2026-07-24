import * as vscode from "vscode";
import { runJavaTests, detectJavaProject } from "./test-runner";
import { isRunnableJavaTestFile } from "./test-file";
import { type GroveCoreApi } from "@grove/shared";

function getConfiguredMavenPath(): string | undefined {
  return (
    vscode.workspace
      .getConfiguration("grove")
      .get<string>("java.mavenPath")
      ?.trim() || undefined
  );
}

function getConfiguredTimeoutMs(
  setting: "java.testTimeoutSeconds" | "java.utilitiesTimeoutSeconds",
  defaultSeconds: number,
  maxSeconds: number,
): number {
  const seconds = vscode.workspace
    .getConfiguration("grove")
    .get<number>(setting, defaultSeconds);
  const clamped = Math.min(Math.max(seconds, 30), maxSeconds);
  return clamped * 1000;
}

function shouldSkipUtilitiesBuild(): boolean {
  return vscode.workspace
    .getConfiguration("grove")
    .get<boolean>("java.skipUtilitiesBuild", false);
}

function getWorkspaceRoots(): string[] | undefined {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
}

function runJavaWithConfiguredMaven(
  extensionVersion: string,
  options: Parameters<typeof runJavaTests>[0],
): ReturnType<typeof runJavaTests> {
  return runJavaTests({
    ...options,
    extensionVersion,
    workspaceRoots: options.workspaceRoots ?? getWorkspaceRoots(),
    testTimeout:
      options.testTimeout ??
      getConfiguredTimeoutMs("java.testTimeoutSeconds", 300, 300),
    utilitiesTimeout:
      options.utilitiesTimeout ??
      getConfiguredTimeoutMs("java.utilitiesTimeoutSeconds", 180, 300),
    fallbackMavenPath: options.fallbackMavenPath ?? getConfiguredMavenPath(),
    skipUtilitiesBuild:
      options.skipUtilitiesBuild ?? shouldSkipUtilitiesBuild(),
  });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove for Java extension activating...");

  const extensionVersion = context.extension.packageJSON.version ?? "unknown";
  const runTestsForProject = (options: Parameters<typeof runJavaTests>[0]) =>
    runJavaWithConfiguredMaven(extensionVersion, options);

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
    language: "java",
    name: "Java",
    run: runTestsForProject,
    detect: detectJavaProject,
    isRunnableTestFile: isRunnableJavaTestFile,
    runnableTestFileMessage:
      "Open a Java test file (for example TutorialTests.java under src/test/java) before running this command.",
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.java.runTests", () =>
      coreApi.runGroveTests({ language: "java" }),
    ),

    vscode.commands.registerCommand("grove.java.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      await coreApi.runGroveTests({
        language: "java",
        activeFilePath: editor.document.uri.fsPath,
        documentScheme: editor.document.uri.scheme,
        testFileScope: true,
      });
    }),
  );

  console.log("Grove for Java extension activated");
}

export function deactivate() {
  // Cleanup if needed
}
