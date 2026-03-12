/**
 * Test File Parser
 *
 * Parses JavaScript/TypeScript test files to extract describe/it/test blocks
 * for CodeLens positioning.
 */

import * as vscode from "vscode";

export interface TestBlock {
  /** Type of test block */
  type: "describe" | "it" | "test";
  /** Test name/description */
  name: string;
  /** Line number (0-indexed) */
  line: number;
  /** Character position of the block start */
  character: number;
  /** Full range of the test block declaration line */
  range: vscode.Range;
  /** Parent describe block name (for nested tests) */
  parentDescribe?: string;
}

/**
 * Parse test blocks from a document.
 * Supports Jest, Mocha, and Vitest style test files.
 * Uses line-by-line parsing to avoid character offset issues with line endings.
 */
export function parseTestBlocks(document: vscode.TextDocument): TestBlock[] {
  const blocks: TestBlock[] = [];

  // Pattern to match describe/it/test blocks
  // Supports: describe, it, test, describe.only, it.only, test.only, describe.skip, etc.
  const testPattern =
    /^(\s*)(describe|it|test)(?:\.only|\.skip)?\s*\(\s*(['"`])(.+?)\3/;

  // First pass: find all describe blocks to build context for nesting
  const describeBlocks: { name: string; line: number; indent: number }[] = [];

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const lineText = document.lineAt(lineNum).text;
    const match = lineText.match(testPattern);

    if (match && match[2] === "describe") {
      describeBlocks.push({
        name: match[4],
        line: lineNum,
        indent: match[1].length,
      });
    }
  }

  // Second pass: parse all test blocks with parent context
  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    const match = line.text.match(testPattern);

    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const type = match[2] as TestBlock["type"];
    const name = match[4];

    // Find parent describe based on indentation
    let parentDescribe: string | undefined;
    if (type !== "describe") {
      // Find the closest describe with less indentation that appears before this line
      for (let i = describeBlocks.length - 1; i >= 0; i--) {
        const desc = describeBlocks[i];
        if (desc.line < lineNum && desc.indent < indent) {
          parentDescribe = desc.name;
          break;
        }
      }
    }

    blocks.push({
      type,
      name,
      line: lineNum,
      character: indent,
      range: new vscode.Range(
        new vscode.Position(lineNum, 0),
        new vscode.Position(lineNum, line.text.length),
      ),
      parentDescribe,
    });
  }

  return blocks;
}

/**
 * Check if a document is a test file based on filename patterns.
 */
export function isTestFile(document: vscode.TextDocument): boolean {
  const fileName = document.fileName;

  // Common test file patterns
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_test\.[jt]sx?$/,
    /Test\.[jt]sx?$/,
    /tests?\/.*\.[jt]sx?$/,
    /__tests__\/.*\.[jt]sx?$/,
  ];

  return testPatterns.some((pattern) => pattern.test(fileName));
}

/**
 * Build the test name pattern for Jest/Mocha --testNamePattern.
 * Combines parent describe with test name for accurate matching.
 */
export function buildTestNamePattern(block: TestBlock): string {
  if (block.parentDescribe) {
    // Escape special regex characters
    const escapedParent = escapeRegex(block.parentDescribe);
    const escapedName = escapeRegex(block.name);
    return `${escapedParent}.*${escapedName}`;
  }
  return escapeRegex(block.name);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
