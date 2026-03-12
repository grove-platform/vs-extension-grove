/**
 * Grove RST literalinclude Parser
 *
 * Parses RST files to extract literalinclude directives and their options.
 * Used for hover, go-to-definition, and document links.
 */

import * as vscode from "vscode";

export interface LiteralIncludeRef {
  /** Position of the directive in the RST file */
  range: vscode.Range;
  /** The range of just the file path for navigation */
  pathRange: vscode.Range;
  /** Referenced file path (as written in RST) */
  targetPath: string;
  /** :snippet: value if present */
  snippetName?: string;
  /** :start-after: value if present */
  startAfter?: string;
  /** :end-before: value if present */
  endBefore?: string;
  /** :lines: value if present */
  lines?: string;
  /** :language: value if present */
  language?: string;
  /** :emphasize-lines: value if present */
  emphasizeLines?: string;
  /** :dedent: value if present */
  dedent?: number;
}

/**
 * Parse all literalinclude directives from an RST document.
 * Uses line-by-line parsing to avoid character offset issues with line endings.
 */
export function parseLiteralIncludes(
  document: vscode.TextDocument,
): LiteralIncludeRef[] {
  const refs: LiteralIncludeRef[] = [];

  // Match literalinclude directive line
  // Format: .. literalinclude:: path/to/file.ext
  const directivePattern = /^(\s*)\.\.\s+literalinclude::\s+(.+?)\s*$/;

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    const match = line.text.match(directivePattern);

    if (!match) {
      continue;
    }

    const indent = match[1];
    const targetPath = match[2].trim();

    // Calculate path position within the line
    const pathStartChar = line.text.indexOf(targetPath);
    const pathStart = new vscode.Position(lineNum, pathStartChar);
    const pathEnd = new vscode.Position(
      lineNum,
      pathStartChar + targetPath.length,
    );

    const ref: LiteralIncludeRef = {
      range: new vscode.Range(
        new vscode.Position(lineNum, 0),
        new vscode.Position(lineNum, line.text.length),
      ),
      pathRange: new vscode.Range(pathStart, pathEnd),
      targetPath,
    };

    // Parse options on following lines (lines that start with :option:)
    const optionIndent = indent + "   "; // Options are indented 3 spaces more
    let nextLineNum = lineNum + 1;

    while (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;

      // Check if this line is an option line (properly indented with :option: value)
      if (!nextLine.startsWith(optionIndent) || !nextLine.includes(":")) {
        // Not an option line - might be content or end of directive
        if (nextLine.trim() === "" || nextLine.startsWith(indent + "   ")) {
          // Empty line or continued content
          nextLineNum++;
          continue;
        }
        break;
      }

      const optionMatch = nextLine.match(/^\s+:([a-z-]+):\s*(.*)$/);
      if (optionMatch) {
        const [, optionName, optionValue] = optionMatch;
        switch (optionName) {
          case "snippet":
            ref.snippetName = optionValue.trim();
            break;
          case "start-after":
            ref.startAfter = optionValue.trim();
            break;
          case "end-before":
            ref.endBefore = optionValue.trim();
            break;
          case "lines":
            ref.lines = optionValue.trim();
            break;
          case "language":
            ref.language = optionValue.trim();
            break;
          case "emphasize-lines":
            ref.emphasizeLines = optionValue.trim();
            break;
          case "dedent":
            const dedentVal = parseInt(optionValue.trim(), 10);
            if (!isNaN(dedentVal)) {
              ref.dedent = dedentVal;
            }
            break;
        }
      }
      nextLineNum++;
    }

    refs.push(ref);
  }

  return refs;
}

/**
 * Find a literalinclude reference at a specific position.
 */
export function findLiteralIncludeAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): LiteralIncludeRef | undefined {
  const refs = parseLiteralIncludes(document);

  for (const ref of refs) {
    // Check if position is within the directive line or the path specifically
    if (ref.range.contains(position) || ref.pathRange.contains(position)) {
      return ref;
    }
  }

  return undefined;
}
