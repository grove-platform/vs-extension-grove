/**
 * Grove RST Directive Parser
 *
 * Generic parser for RST directives that reference files:
 * - literalinclude:: - includes code with syntax highlighting
 * - include:: - includes RST content
 * - io-code-block (input/output) - includes input/output examples
 */

import * as vscode from "vscode";

/** Types of directives that reference files (or, for code-block, inline code). */
export type DirectiveType =
  | "literalinclude"
  | "include"
  | "input"
  | "output"
  | "code-block";

export interface DirectiveRef {
  /** Type of directive */
  type: DirectiveType;
  /** Position of the directive in the RST file */
  range: vscode.Range;
  /** The range of just the file path (or language arg, for code-block) */
  pathRange: vscode.Range;
  /** Referenced file path (as written in RST). Empty string for code-block. */
  targetPath: string;
  /** Whether this directive may need symlink resolution (code-examples) */
  needsSymlinkResolution: boolean;
  /** Whether this is an extract include (YAML-based, not file-based) */
  isExtract?: boolean;
  /** :snippet: value if present (literalinclude only) */
  snippetName?: string;
  /** :start-after: value if present */
  startAfter?: string;
  /** :end-before: value if present */
  endBefore?: string;
  /** :lines: value if present */
  lines?: string;
  /** :language: value if present (for literalinclude/io-code-block) or
   *  positional arg (for code-block). */
  language?: string;
  /** Inline code content, populated only for code-block directives. */
  code?: string;
}

/**
 * Parse all file-referencing directives from an RST document.
 */
export function parseDirectives(document: vscode.TextDocument): DirectiveRef[] {
  const refs: DirectiveRef[] = [];

  // Pattern for literalinclude:: and include::
  const simpleDirectivePattern =
    /^(\s*)\.\.\s+(literalinclude|include)::\s+(.+?)\s*$/;

  // Pattern for io-code-block's input/output sub-directives
  // Format: .. input:: /path/to/file or .. output:: /path/to/file
  const ioDirectivePattern = /^(\s+)\.\.\s+(input|output)::\s+(.+?)\s*$/;

  // Pattern for code-block:: with a language positional arg.
  // Omits code-block directives without a language (rare and not migratable).
  const codeBlockPattern = /^(\s*)\.\.\s+code-block::\s+([a-zA-Z0-9_+.#-]+)\s*$/;

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    const text = line.text;

    // Try simple directives first (literalinclude, include)
    let match = text.match(simpleDirectivePattern);
    if (match) {
      const ref = parseSimpleDirective(
        document,
        lineNum,
        match[1],
        match[2] as "literalinclude" | "include",
        match[3],
      );
      refs.push(ref);
      continue;
    }

    // Try io-code-block input/output
    match = text.match(ioDirectivePattern);
    if (match) {
      const ref = parseIoDirective(
        document,
        lineNum,
        match[2] as "input" | "output",
        match[3],
      );
      refs.push(ref);
      continue;
    }

    // Try code-block
    match = text.match(codeBlockPattern);
    if (match) {
      const ref = parseCodeBlockDirective(document, lineNum, match[1], match[2]);
      refs.push(ref);
    }
  }

  return refs;
}

/**
 * Parse a code-block:: directive and extract its indented content block.
 *
 * RST content blocks start after optional blank lines and are indented
 * relative to the directive line. This captures consecutive content lines
 * and stops at the first non-blank line indented less than the content.
 */
function parseCodeBlockDirective(
  document: vscode.TextDocument,
  lineNum: number,
  indent: string,
  language: string,
): DirectiveRef {
  const line = document.lineAt(lineNum);
  const langStartChar = line.text.indexOf(language);
  const pathRange = new vscode.Range(
    new vscode.Position(lineNum, langStartChar),
    new vscode.Position(lineNum, langStartChar + language.length),
  );

  // Find where content starts (skip directive options and surrounding blanks).
  let contentLineNum = lineNum + 1;
  while (contentLineNum < document.lineCount) {
    const candidate = document.lineAt(contentLineNum).text;
    const trimmed = candidate.trim();
    if (trimmed === "") {
      contentLineNum++;
      continue;
    }

    const leading = candidate.length - candidate.trimStart().length;
    const isOption =
      leading > indent.length && /^:[a-zA-Z0-9_-]+:\s*/.test(trimmed);
    if (isOption) {
      contentLineNum++;
      continue;
    }

    break;
  }

  const codeLines: string[] = [];
  let lastContentLineNum = lineNum;
  let stripAmount: number | undefined;
  if (contentLineNum < document.lineCount) {
    const firstContent = document.lineAt(contentLineNum).text;
    const firstLeading = firstContent.length - firstContent.trimStart().length;
    if (firstLeading > indent.length) {
      stripAmount = firstLeading;
    }
  }

  while (contentLineNum < document.lineCount) {
    const rawText = document.lineAt(contentLineNum).text;
    const trimmed = rawText.trim();

    if (trimmed === "") {
      codeLines.push("");
      contentLineNum++;
      continue;
    }

    const leading = rawText.length - rawText.trimStart().length;
    if (stripAmount === undefined || leading < stripAmount) {
      break;
    }

    codeLines.push(rawText.slice(Math.min(leading, stripAmount)));
    lastContentLineNum = contentLineNum;
    contentLineNum++;
  }

  // Drop trailing blank lines from the captured content.
  while (codeLines.length > 0 && codeLines[codeLines.length - 1] === "") {
    codeLines.pop();
  }

  const blockEndLine = document.lineAt(lastContentLineNum);
  return {
    type: "code-block",
    range: new vscode.Range(
      new vscode.Position(lineNum, 0),
      new vscode.Position(lastContentLineNum, blockEndLine.text.length),
    ),
    pathRange,
    targetPath: "",
    needsSymlinkResolution: false,
    language,
    code: codeLines.join("\n"),
  };
}

/**
 * Parse a simple directive (literalinclude or include).
 */
function parseSimpleDirective(
  document: vscode.TextDocument,
  lineNum: number,
  indent: string,
  type: "literalinclude" | "include",
  targetPath: string,
): DirectiveRef {
  const line = document.lineAt(lineNum);
  targetPath = targetPath.trim();

  const pathStartChar = line.text.indexOf(targetPath);
  const pathStart = new vscode.Position(lineNum, pathStartChar);
  const pathEnd = new vscode.Position(
    lineNum,
    pathStartChar + targetPath.length,
  );

  const ref: DirectiveRef = {
    type,
    range: new vscode.Range(
      new vscode.Position(lineNum, 0),
      new vscode.Position(lineNum, line.text.length),
    ),
    pathRange: new vscode.Range(pathStart, pathEnd),
    targetPath,
    // include:: never needs symlink resolution, literalinclude:: does
    needsSymlinkResolution: type === "literalinclude",
    // Detect extract paths - these resolve to YAML refs, not files
    isExtract: targetPath.includes("/extracts/"),
  };

  // Parse options on following lines
  const optionIndent = indent + "   ";
  let nextLineNum = lineNum + 1;

  while (nextLineNum < document.lineCount) {
    const nextLine = document.lineAt(nextLineNum).text;

    if (!nextLine.startsWith(optionIndent) || !nextLine.includes(":")) {
      if (nextLine.trim() === "" || nextLine.startsWith(indent + "   ")) {
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
      }
    }
    nextLineNum++;
  }

  return ref;
}

/**
 * Parse an io-code-block input/output directive.
 */
function parseIoDirective(
  document: vscode.TextDocument,
  lineNum: number,
  type: "input" | "output",
  targetPath: string,
): DirectiveRef {
  const line = document.lineAt(lineNum);
  targetPath = targetPath.trim();

  const pathStartChar = line.text.indexOf(targetPath);
  const pathStart = new vscode.Position(lineNum, pathStartChar);
  const pathEnd = new vscode.Position(
    lineNum,
    pathStartChar + targetPath.length,
  );

  const ref: DirectiveRef = {
    type,
    range: new vscode.Range(
      new vscode.Position(lineNum, 0),
      new vscode.Position(lineNum, line.text.length),
    ),
    pathRange: new vscode.Range(pathStart, pathEnd),
    targetPath,
    // io-code-block input/output may reference code-examples
    needsSymlinkResolution: true,
  };

  // Parse options on following lines (e.g., :language:)
  let nextLineNum = lineNum + 1;
  while (nextLineNum < document.lineCount) {
    const nextLine = document.lineAt(nextLineNum).text;
    const optionMatch = nextLine.match(/^\s+:([a-z-]+):\s*(.*)$/);
    if (optionMatch) {
      const [, optionName, optionValue] = optionMatch;
      if (optionName === "language") {
        ref.language = optionValue.trim();
      }
      nextLineNum++;
    } else if (nextLine.trim() === "") {
      nextLineNum++;
    } else {
      break;
    }
  }

  return ref;
}

/**
 * Find a directive reference at a specific position.
 */
export function findDirectiveAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): DirectiveRef | undefined {
  const refs = parseDirectives(document);

  for (const ref of refs) {
    if (ref.range.contains(position) || ref.pathRange.contains(position)) {
      return ref;
    }
  }

  return undefined;
}
