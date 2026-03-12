/**
 * Test Hover Provider
 *
 * Shows detailed test information when hovering over test blocks.
 * Displays last run time, pass/fail status, duration, and error messages.
 */

import * as vscode from "vscode";
import { testResultStore, type TestResult } from "./TestResultStore";
import {
  parseTestBlocks,
  isTestFile,
  buildTestNamePattern,
  type TestBlock,
} from "./test-parser";

export class TestHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    // Only process test files
    if (!isTestFile(document)) {
      return undefined;
    }

    // Find the test block at the hover position
    const blocks = parseTestBlocks(document);
    const block = blocks.find((b) => b.line === position.line);

    if (!block) {
      return undefined;
    }

    const testNamePattern = buildTestNamePattern(block);
    const result = testResultStore.get(document.uri, testNamePattern);

    // Create hover content
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // Test name header
    const typeLabel = block.type === "describe" ? "Test Suite" : "Test";
    md.appendMarkdown(`### ${typeLabel}: ${block.name}\n\n`);

    if (result) {
      // Show last run results
      const icon = result.passed ? "✅" : "❌";
      const status = result.passed ? "**Passed**" : "**Failed**";

      md.appendMarkdown(`${icon} ${status}\n\n`);
      md.appendMarkdown(`| | |\n|---|---|\n`);
      md.appendMarkdown(`| **Duration** | ${result.duration}ms |\n`);
      md.appendMarkdown(
        `| **Last Run** | ${formatTimeAgo(result.timestamp)} |\n`,
      );

      if (result.passCount !== undefined || result.failCount !== undefined) {
        const pass = result.passCount ?? 0;
        const fail = result.failCount ?? 0;
        const total = pass + fail;
        md.appendMarkdown(`| **Tests** | ${pass}/${total} passed |\n`);
      }

      if (result.errorMessage) {
        md.appendMarkdown(
          `\n---\n\n**Error:**\n\`\`\`\n${truncate(result.errorMessage, 500)}\n\`\`\`\n`,
        );
      }

      md.appendMarkdown(`\n---\n\n`);
    } else {
      md.appendMarkdown(`*No test results yet*\n\n---\n\n`);
    }

    // Add run command link
    // Note: $(icon) codicons don't work in Markdown links, so we use Unicode symbols
    const runArgs = encodeURIComponent(
      JSON.stringify([document.uri, testNamePattern, block.name, block.type]),
    );
    md.appendMarkdown(
      `[▶ Run](command:grove.runTestBlock?${runArgs} "Run this test")`,
    );

    if (block.type !== "describe") {
      md.appendMarkdown(
        ` | [🔧 Debug](command:grove.debugTestBlock?${runArgs} "Debug this test")`,
      );
    }

    return new vscode.Hover(md, block.range);
  }
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

/**
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}
