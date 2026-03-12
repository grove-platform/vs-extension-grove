/**
 * Test CodeLens Provider
 *
 * Provides CodeLens actions (Run, Debug) above describe/it/test blocks
 * in JavaScript/TypeScript test files.
 */

import * as vscode from "vscode";
import {
  parseTestBlocks,
  isTestFile,
  buildTestNamePattern,
  type TestBlock,
} from "./test-parser";

/** Tracks the state of a running test */
interface RunningTest {
  uri: string;
  testNamePattern: string;
}

export class TestCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Currently running test (if any) */
  private runningTest: RunningTest | null = null;

  /**
   * Mark a test as running and refresh lenses to show spinner.
   */
  setRunning(uri: vscode.Uri, testNamePattern: string): void {
    this.runningTest = { uri: uri.toString(), testNamePattern };
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Clear running state and refresh lenses.
   */
  clearRunning(): void {
    this.runningTest = null;
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Check if a specific test is currently running.
   */
  private isRunning(uri: vscode.Uri, testNamePattern: string): boolean {
    return (
      this.runningTest?.uri === uri.toString() &&
      this.runningTest?.testNamePattern === testNamePattern
    );
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    // Only provide lenses for test files
    if (!isTestFile(document)) {
      return [];
    }

    const blocks = parseTestBlocks(document);
    const lenses: vscode.CodeLens[] = [];

    for (const block of blocks) {
      const lensRange = new vscode.Range(
        new vscode.Position(block.line, 0),
        new vscode.Position(block.line, 0),
      );

      const testNamePattern = buildTestNamePattern(block);
      const isRunning = this.isRunning(document.uri, testNamePattern);

      if (isRunning) {
        // Show spinning indicator while running
        lenses.push(
          new vscode.CodeLens(lensRange, {
            title: `$(sync~spin) Running...`,
            command: "",
            tooltip: `Running ${block.type}: "${block.name}"`,
          }),
        );
      } else {
        // Run lens
        lenses.push(
          new vscode.CodeLens(lensRange, {
            title: `$(play) Run`,
            command: "grove.runTestBlock",
            arguments: [document.uri, testNamePattern, block.name, block.type],
            tooltip: `Run ${block.type}: "${block.name}"`,
          }),
        );

        // Run with debug lens (only for it/test blocks, not describe)
        if (block.type !== "describe") {
          lenses.push(
            new vscode.CodeLens(lensRange, {
              title: `$(debug) Debug`,
              command: "grove.debugTestBlock",
              arguments: [
                document.uri,
                testNamePattern,
                block.name,
                block.type,
              ],
              tooltip: `Debug ${block.type}: "${block.name}"`,
            }),
          );
        }

        // For describe blocks, add "Run All" to be more explicit
        if (block.type === "describe") {
          lenses.push(
            new vscode.CodeLens(lensRange, {
              title: `$(run-all) Run All`,
              command: "grove.runTestBlock",
              arguments: [
                document.uri,
                testNamePattern,
                block.name,
                block.type,
              ],
              tooltip: `Run all tests in "${block.name}"`,
            }),
          );
        }
      }
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
