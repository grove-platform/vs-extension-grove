/**
 * Test Decorations
 *
 * Provides visual feedback for test pass/fail status using VS Code decorations.
 * Shows colored backgrounds and gutter icons for test blocks.
 */

import * as vscode from "vscode";
import { testResultStore, type TestResult } from "./TestResultStore";
import { parseTestBlocks, isTestFile, buildTestNamePattern } from "./test-parser";

let passDecorationType: vscode.TextEditorDecorationType;
let failDecorationType: vscode.TextEditorDecorationType;

/**
 * Initialize decoration types.
 * Call this once during extension activation.
 */
export function initTestDecorations(context: vscode.ExtensionContext): void {
  // Create decoration for passing tests
  passDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("testing.passBorder"),
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor("testing.iconPassed"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    light: {
      backgroundColor: "rgba(40, 167, 69, 0.12)",
    },
    dark: {
      backgroundColor: "rgba(40, 167, 69, 0.15)",
    },
  });

  // Create decoration for failing tests
  failDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("testing.failBorder"),
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor("testing.iconFailed"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    light: {
      backgroundColor: "rgba(220, 53, 69, 0.12)",
    },
    dark: {
      backgroundColor: "rgba(220, 53, 69, 0.15)",
    },
  });

  context.subscriptions.push(passDecorationType, failDecorationType);

  // Update decorations when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorationsForEditor(editor);
      }
    }),
  );

  // Update decorations when test results change
  context.subscriptions.push(
    testResultStore.onDidChange((uri) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.toString() === uri.toString()) {
        updateDecorationsForEditor(editor);
      }
    }),
  );

  // Update decorations for current editor
  if (vscode.window.activeTextEditor) {
    updateDecorationsForEditor(vscode.window.activeTextEditor);
  }
}

/**
 * Update decorations for a specific editor based on stored test results.
 */
export function updateDecorationsForEditor(
  editor: vscode.TextEditor,
): void {
  const document = editor.document;

  // Only process test files
  if (!isTestFile(document)) {
    editor.setDecorations(passDecorationType, []);
    editor.setDecorations(failDecorationType, []);
    return;
  }

  const blocks = parseTestBlocks(document);
  const passRanges: vscode.DecorationOptions[] = [];
  const failRanges: vscode.DecorationOptions[] = [];

  for (const block of blocks) {
    const testNamePattern = buildTestNamePattern(block);
    const result = testResultStore.get(document.uri, testNamePattern);

    if (!result) {
      continue;
    }

    const range = new vscode.Range(
      new vscode.Position(block.line, 0),
      new vscode.Position(block.line, document.lineAt(block.line).text.length),
    );

    const decoration: vscode.DecorationOptions = {
      range,
      hoverMessage: createHoverMessage(result, block.name),
    };

    if (result.passed) {
      passRanges.push(decoration);
    } else {
      failRanges.push(decoration);
    }
  }

  editor.setDecorations(passDecorationType, passRanges);
  editor.setDecorations(failDecorationType, failRanges);
}

/**
 * Create a hover message for a decoration.
 */
function createHoverMessage(result: TestResult, testName: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  const icon = result.passed ? "✅" : "❌";
  const status = result.passed ? "Passed" : "Failed";

  md.appendMarkdown(`**${icon} ${status}**\n\n`);
  md.appendMarkdown(`**Duration:** ${result.duration}ms\n\n`);
  md.appendMarkdown(`**Last Run:** ${formatTimeAgo(result.timestamp)}`);

  if (result.errorMessage) {
    md.appendMarkdown(`\n\n---\n\n\`\`\`\n${result.errorMessage}\n\`\`\``);
  }

  return md;
}

/**
 * Format a timestamp as a relative time string.
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return "1 hour ago";
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

