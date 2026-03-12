/**
 * Test Result Store
 *
 * Stores test results keyed by file URI and test name pattern.
 * Used for decorations and hover information.
 */

import * as vscode from "vscode";

export interface TestResult {
  /** Whether the test passed */
  passed: boolean;
  /** Test duration in milliseconds */
  duration: number;
  /** When the test was run */
  timestamp: Date;
  /** Number of passing assertions/tests (for describe blocks) */
  passCount?: number;
  /** Number of failing assertions/tests (for describe blocks) */
  failCount?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** The line number of the test in the file */
  line: number;
}

/**
 * Generates a unique key for a test result.
 */
function makeKey(uri: vscode.Uri, testNamePattern: string): string {
  return `${uri.toString()}::${testNamePattern}`;
}

/**
 * Store for test results.
 * Results are stored in memory and cleared when VS Code restarts.
 */
class TestResultStoreImpl {
  private results = new Map<string, TestResult>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  /** Event fired when results change for a file */
  readonly onDidChange = this._onDidChange.event;

  /**
   * Store a test result.
   */
  set(
    uri: vscode.Uri,
    testNamePattern: string,
    result: Omit<TestResult, "timestamp">,
  ): void {
    const key = makeKey(uri, testNamePattern);
    this.results.set(key, {
      ...result,
      timestamp: new Date(),
    });
    this._onDidChange.fire(uri);
  }

  /**
   * Get a test result.
   */
  get(uri: vscode.Uri, testNamePattern: string): TestResult | undefined {
    const key = makeKey(uri, testNamePattern);
    return this.results.get(key);
  }

  /**
   * Get all test results for a file.
   */
  getForFile(uri: vscode.Uri): Map<string, TestResult> {
    const prefix = `${uri.toString()}::`;
    const fileResults = new Map<string, TestResult>();

    for (const [key, result] of this.results.entries()) {
      if (key.startsWith(prefix)) {
        const testNamePattern = key.slice(prefix.length);
        fileResults.set(testNamePattern, result);
      }
    }

    return fileResults;
  }

  /**
   * Clear all results for a file.
   */
  clearFile(uri: vscode.Uri): void {
    const prefix = `${uri.toString()}::`;
    for (const key of this.results.keys()) {
      if (key.startsWith(prefix)) {
        this.results.delete(key);
      }
    }
    this._onDidChange.fire(uri);
  }

  /**
   * Clear all stored results.
   */
  clearAll(): void {
    this.results.clear();
  }

  /**
   * Get count of stored results.
   */
  get size(): number {
    return this.results.size;
  }
}

/** Singleton instance of the test result store */
export const testResultStore = new TestResultStoreImpl();

