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
  writeHandoff,
  type SetupFromMissingEnvContext,
  type TestFailureContext,
} from "../handoff/writer";
import type { GroveLanguage } from "@grove/shared";

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
        _blockType: string,
      ) => {
        await diagnoseTestBlock(uri, testNamePattern, testName);
      },
    ),
  );

  // Register setup-from-missing-env command (fires from the file-level
  // "No .env detected" banner lens at line 0).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.setupFromMissingEnv",
      async (
        testUri: vscode.Uri,
        projectRoot: string,
        language: GroveLanguage,
        supportsEnvInjection: boolean,
      ) => {
        await setupFromMissingEnv(
          testUri,
          projectRoot,
          language,
          supportsEnvInjection,
        );
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

  // Refresh lenses when an .env file appears or is deleted anywhere in the
  // workspace, so the banner clears as soon as the writer creates it (and
  // re-appears if they delete it).
  const envWatcher = vscode.workspace.createFileSystemWatcher("**/.env");
  envWatcher.onDidCreate(() => codeLensProvider.refresh());
  envWatcher.onDidDelete(() => codeLensProvider.refresh());
  context.subscriptions.push(envWatcher);
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

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }

  const testFileRel = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  const projectPathRel = path.relative(
    workspaceFolder.uri.fsPath,
    resolved.project.rootPath,
  );

  const context: TestFailureContext = {
    testFile: testFileRel,
    testName,
    testNamePattern,
    line: result.line,
    errorMessage: result.errorMessage,
    duration: result.duration,
    projectPath: projectPathRel,
  };

  try {
    const handoffUri = await writeHandoff("grove-run", "test-failure", context);
    if (!handoffUri) return;

    // Open Claude Code with "/grove-run" pre-filled. The extension's
    // primaryEditor.open accepts (sessionId?, prompt?) — confirmed from
    // the URI handler route in its source — so the writer just presses
    // Enter. Fall back to sidebar.open if the command isn't available.
    let primaryEditorOpened = false;
    try {
      await vscode.commands.executeCommand(
        "claude-vscode.primaryEditor.open",
        undefined,
        "/grove-run",
      );
      primaryEditorOpened = true;
    } catch {
      try {
        await vscode.commands.executeCommand("claude-vscode.sidebar.open");
      } catch {
        // Claude Code extension not available — skip focus entirely.
      }
    }

    vscode.window.showInformationMessage(
      primaryEditorOpened
        ? `Grove handoff ready. Press Enter in Claude Code to diagnose "${testName}".`
        : `Grove handoff ready. Type /grove-run in Claude Code to diagnose "${testName}".`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to write Grove handoff: ${err}`);
  }
}

async function setupFromMissingEnv(
  testUri: vscode.Uri,
  projectRoot: string,
  language: GroveLanguage,
  supportsEnvInjection: boolean,
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }

  const setupContext: SetupFromMissingEnvContext = {
    projectPath: path.relative(workspaceFolder.uri.fsPath, projectRoot),
    language,
    testFile: path.relative(workspaceFolder.uri.fsPath, testUri.fsPath),
    supportsEnvInjection,
  };

  try {
    const handoffUri = await writeHandoff(
      "grove-setup",
      "missing-env",
      setupContext,
    );
    if (!handoffUri) return;

    let primaryEditorOpened = false;
    try {
      await vscode.commands.executeCommand(
        "claude-vscode.primaryEditor.open",
        undefined,
        "/grove-setup",
      );
      primaryEditorOpened = true;
    } catch {
      try {
        await vscode.commands.executeCommand("claude-vscode.sidebar.open");
      } catch {
        // Claude Code extension not available — skip focus entirely.
      }
    }

    vscode.window.showInformationMessage(
      primaryEditorOpened
        ? `Grove handoff ready. Press Enter in Claude Code to set up .env for ${language}.`
        : `Grove handoff ready. Type /grove-setup in Claude Code to set up .env for ${language}.`,
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
