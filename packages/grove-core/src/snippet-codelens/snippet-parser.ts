/**
 * Bluehawk Snippet Parser
 *
 * Parses code files to extract :snippet-start: tags for CodeLens positioning.
 * Supports various comment styles (JS, Python, etc.)
 */

import * as vscode from "vscode";

export interface SnippetBlock {
  /** Name of the snippet */
  name: string;
  /** Line number of :snippet-start: (0-indexed) */
  line: number;
  /** Full range of the snippet-start line */
  range: vscode.Range;
  /** The file path containing this snippet */
  filePath: string;
}

/**
 * Pattern to match :snippet-start: in various comment styles.
 * Supports:
 * - // :snippet-start: name (JS, TS, C, etc.)
 * - # :snippet-start: name (Python, Shell, YAML)
 * - /* :snippet-start: name (C-style block)
 * - -- :snippet-start: name (SQL, Lua)
 * - <!-- :snippet-start: name --> (HTML, XML)
 */
const SNIPPET_START_PATTERN = /(?:\/\/|#|\/\*|--|<!--)\s*:snippet-start:\s*(\S+)/;

/**
 * Check if a file might contain Bluehawk snippets.
 * Quick check before full parsing.
 */
export function mightContainSnippets(document: vscode.TextDocument): boolean {
  // Check file extension - skip binary/non-code files
  const ext = document.uri.fsPath.split(".").pop()?.toLowerCase();
  const skipExtensions = ["png", "jpg", "gif", "svg", "ico", "woff", "ttf", "pdf", "zip"];
  if (ext && skipExtensions.includes(ext)) {
    return false;
  }

  // Quick text check
  const text = document.getText();
  return text.includes(":snippet-start:");
}

/**
 * Parse all :snippet-start: blocks from a document.
 * Uses line-by-line parsing for accurate line numbers.
 */
export function parseSnippetBlocks(document: vscode.TextDocument): SnippetBlock[] {
  const blocks: SnippetBlock[] = [];

  if (!mightContainSnippets(document)) {
    return blocks;
  }

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    const match = line.text.match(SNIPPET_START_PATTERN);

    if (match) {
      const snippetName = match[1];

      blocks.push({
        name: snippetName,
        line: lineNum,
        range: new vscode.Range(
          new vscode.Position(lineNum, 0),
          new vscode.Position(lineNum, line.text.length),
        ),
        filePath: document.uri.fsPath,
      });
    }
  }

  return blocks;
}

/**
 * Get all snippet names from a file path (without opening in editor).
 * Used for searching references.
 */
export async function getSnippetNamesFromFile(
  filePath: string,
): Promise<string[]> {
  try {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const blocks = parseSnippetBlocks(document);
    return blocks.map((b) => b.name);
  } catch {
    return [];
  }
}

