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
import {
  resolveProject,
  executeTests,
  displayTestResults,
} from "../test-execution";
import {
  openClaudeWithSkill,
  resolveClaudeRoot,
  writeHandoff,
  type TestFailureContext,
} from "../handoff/writer";

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

  // Register diagnose-with-Claude command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.diagnoseTestBlock",
      async (
        uri: vscode.Uri,
        testNamePattern: string,
        testName: string,
      ) => {
        await diagnoseTestBlock(uri, testNamePattern, testName);
      },
    ),
  );

  // Refresh lenses on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      codeLensProvider.refresh();
    }),
  );

  // Refresh lenses when test results arrive so the "Diagnose with Claude"
  // lens appears immediately after a failing run.
  context.subscriptions.push(
    testResultStore.onDidChange(() => {
      codeLensProvider.refresh();
    }),
  );
}

async function diagnoseTestBlock(
  uri: vscode.Uri,
  testNamePattern: string,
  testName: string,
): Promise<void> {
  const resolved = await resolveProject(uri.fsPath);
  if (!resolved) return;

  const result = testResultStore.get(uri, testNamePattern);
  if (!result) {
    vscode.window.showWarningMessage(
      `No test result found for "${testName}". Run the test first.`,
    );
    return;
  }

  const claudeRoot = await resolveClaudeRoot(uri);
  if (!claudeRoot) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }

  const context: TestFailureContext = {
    testFile: path.relative(claudeRoot, uri.fsPath),
    testName,
    testNamePattern,
    line: result.line,
    errorMessage: result.errorMessage,
    duration: result.duration,
    projectPath: path.relative(claudeRoot, resolved.project.rootPath),
  };

  try {
    await writeHandoff("grove-run", "test-failure", context, claudeRoot);
    const primaryEditorOpened = await openClaudeWithSkill("grove-run");

    vscode.window.showInformationMessage(
      primaryEditorOpened
        ? `Grove handoff ready. Press Enter in Claude Code to diagnose "${testName}".`
        : `Grove handoff ready. Type /grove-run in Claude Code to diagnose "${testName}".`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to write Grove handoff: ${err}`);
  }
}


async function runTestBlock(
  uri: vscode.Uri,
  testNamePattern: string,
  testName: string,
  blockType: string,
  debug: boolean,
): Promise<void> {
  const resolved = await resolveProject(uri.fsPath);
  if (!resolved) return;

  const project = resolved.project;
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
        const relativeTestFile = path.relative(project.rootPath, uri.fsPath);

        const outcome = await executeTests(project.rootPath, {
          testFile: relativeTestFile,
          testNamePattern,
        });
        if (!outcome) return;

        // Find the line number for this test block
        const document = await vscode.workspace.openTextDocument(uri);
        const blocks = parseTestBlocks(document);
        const block = blocks.find(
          (b) => buildTestNamePattern(b) === testNamePattern,
        );

        // Store the test result for decorations and hover
        testResultStore.set(uri, testNamePattern, {
          passed: outcome.result.success,
          duration: outcome.result.duration,
          line: block?.line ?? 0,
          errorMessage: outcome.result.success
            ? undefined
            : extractErrorMessage(outcome.result.output),
        });

        // Update decorations in the active editor
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === uri.toString()) {
          updateDecorationsForEditor(editor);
        }

        displayTestResults(
          outcome.result.output ?? "",
          outcome.result,
          testName,
        );
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
