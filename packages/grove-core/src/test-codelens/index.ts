/**
 * Test CodeLens Module
 *
 * Registers CodeLens providers and commands for running tests
 * directly from describe/it/test blocks in test files.
 */

import * as vscode from "vscode";
import * as path from "path";
import { TestCodeLensProvider } from "./TestCodeLensProvider";
import { TestHoverProvider } from "./TestHoverProvider";
import {
  initTestDecorations,
  updateDecorationsForEditor,
} from "./TestDecorations";
import { testResultStore } from "./TestResultStore";
import { parseTestBlocks, buildTestNamePattern } from "./test-parser";
import { findTestRunnerForProject, runTests } from "../test-runner-api";
import { findProjectForFile, detectGroveProjects } from "@grove/shared";

// Module-level provider instance for access from runTestBlock
let codeLensProvider: TestCodeLensProvider;

/**
 * Register test CodeLens providers and commands.
 */
export function registerTestCodeLens(context: vscode.ExtensionContext): void {
  codeLensProvider = new TestCodeLensProvider();

  // Register for JavaScript and TypeScript files
  const selectors: vscode.DocumentSelector = [
    { language: "javascript", scheme: "file" },
    { language: "typescript", scheme: "file" },
    { language: "javascriptreact", scheme: "file" },
    { language: "typescriptreact", scheme: "file" },
  ];

  // Register CodeLens provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selectors, codeLensProvider),
  );

  // Register Hover provider for test details
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selectors, new TestHoverProvider()),
  );

  // Initialize test decorations (pass/fail highlighting)
  initTestDecorations(context);

  // Register run test block command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.runTestBlock",
      async (
        uri: vscode.Uri,
        testNamePattern: string,
        testName: string,
        blockType: string,
      ) => {
        await runTestBlock(uri, testNamePattern, testName, blockType, false);
      },
    ),
  );

  // Register debug test block command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.debugTestBlock",
      async (
        uri: vscode.Uri,
        testNamePattern: string,
        testName: string,
        blockType: string,
      ) => {
        await runTestBlock(uri, testNamePattern, testName, blockType, true);
      },
    ),
  );

  // Refresh lenses on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      codeLensProvider.refresh();
    }),
  );
}

async function runTestBlock(
  uri: vscode.Uri,
  testNamePattern: string,
  testName: string,
  blockType: string,
  debug: boolean,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const filePath = uri.fsPath;

  // Detect projects and find the one containing this file
  const projects = await detectGroveProjects(workspaceRoot);
  const project = findProjectForFile(filePath, projects);

  if (!project) {
    vscode.window.showErrorMessage(
      "This file is not within a Grove project. Create a snip.js file to define a project.",
    );
    return;
  }

  const runner = await findTestRunnerForProject(project.rootPath);

  if (!runner) {
    vscode.window.showWarningMessage(
      "No test runner found. Install a Grove language extension (e.g., Grove for Node.js).",
    );
    return;
  }

  const testOutputChannel = vscode.window.createOutputChannel("Grove Tests");

  // Build display text
  const displayType = blockType === "describe" ? "suite" : "test";
  const action = debug ? "Debugging" : "Running";

  // Show spinning indicator in CodeLens
  codeLensProvider.setRunning(uri, testNamePattern);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${action} ${displayType}: "${testName}"`,
        cancellable: false,
      },
      async () => {
        // Get relative path for testFile option
        const relativeTestFile = path.relative(project.rootPath, filePath);

        const result = await runTests({
          projectPath: project.rootPath,
          testFile: relativeTestFile,
          testNamePattern,
        });

        // Find the line number for this test block
        const document = await vscode.workspace.openTextDocument(uri);
        const blocks = parseTestBlocks(document);
        const block = blocks.find(
          (b) => buildTestNamePattern(b) === testNamePattern,
        );
        const line = block?.line ?? 0;

        // Store the test result for decorations and hover
        testResultStore.set(uri, testNamePattern, {
          passed: result.success,
          duration: result.duration,
          line,
          errorMessage: result.success
            ? undefined
            : extractErrorMessage(result.output),
        });

        // Update decorations in the active editor
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === uri.toString()) {
          updateDecorationsForEditor(editor);
        }

        // Log output
        if (result.output) {
          testOutputChannel.clear();
          testOutputChannel.appendLine(`=== Grove Test Results ===`);
          testOutputChannel.appendLine(`Test: ${testName}`);
          testOutputChannel.appendLine(`Duration: ${result.duration}ms`);
          testOutputChannel.appendLine(`Success: ${result.success}`);
          testOutputChannel.appendLine(``);
          testOutputChannel.appendLine(result.output);
        }

        if (result.success) {
          vscode.window.showInformationMessage(
            `✓ ${displayType} passed: "${testName}"`,
          );
        } else {
          const action = await vscode.window.showErrorMessage(
            `✗ ${displayType} failed: "${testName}"`,
            "Show Output",
          );
          if (action === "Show Output") {
            testOutputChannel.show();
          }
        }
      },
    );
  } finally {
    // Always clear spinning indicator when done
    codeLensProvider.clearRunning();
  }
}

/**
 * Extract error message from test output.
 */
function extractErrorMessage(output: string | undefined): string | undefined {
  if (!output) return undefined;

  // Look for common error patterns in test output
  const lines = output.split("\n");
  const errorLines: string[] = [];
  let inError = false;

  for (const line of lines) {
    // Jest/Mocha error indicators
    if (
      line.includes("Error:") ||
      line.includes("AssertionError") ||
      line.includes("Expected") ||
      line.includes("✕") ||
      line.includes("failing")
    ) {
      inError = true;
    }

    if (inError) {
      errorLines.push(line);
      // Stop after a reasonable number of lines
      if (errorLines.length >= 10) break;
    }
  }

  return errorLines.length > 0 ? errorLines.join("\n") : undefined;
}

export { TestCodeLensProvider } from "./TestCodeLensProvider";
export { TestHoverProvider } from "./TestHoverProvider";
export { testResultStore, type TestResult } from "./TestResultStore";
export {
  initTestDecorations,
  updateDecorationsForEditor,
} from "./TestDecorations";
export {
  parseTestBlocks,
  isTestFile,
  buildTestNamePattern,
} from "./test-parser";
