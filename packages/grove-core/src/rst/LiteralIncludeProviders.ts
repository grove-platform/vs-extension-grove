/**
 * Grove RST literalinclude Providers
 *
 * Provides code lenses, go-to-definition, and document links
 * for literalinclude directives in RST files.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  parseLiteralIncludes,
  findLiteralIncludeAtPosition,
} from "./literalinclude-parser";
import { resolveLiteralIncludePath } from "./path-resolver";

/**
 * Get the workspace root for the current document.
 */
function getWorkspaceRoot(document: vscode.TextDocument): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder?.uri.fsPath;
}

interface TestFileResult {
  testFilePath: string;
  snippetName: string;
}

/**
 * Resolve a snippet file path to its original test file in code-example-tests/.
 *
 * Grove's snip.js generates snippets from:
 *   code-example-tests/{lang}/driver/examples/... -> content/code-examples/tested/{lang}/driver/...
 *
 * Each docs project symlinks to the shared snippets:
 *   content/manual/v8.0/source/code-examples/tested -> ../../../../code-examples/tested
 *
 * So the resolved path may look like:
 *   .../content/manual/v8.0/source/code-examples/tested/javascript/driver/time-series/sample-app.snippet.example.js
 *
 * We need to transform to:
 *   code-example-tests/javascript/driver/examples/time-series/sample-app.js
 *
 * Returns undefined if the path doesn't match the pattern.
 */
function resolveTestFilePath(
  resolvedSnippetPath: string,
  workspaceRoot?: string,
): TestFileResult | undefined {
  if (!workspaceRoot) {
    return undefined;
  }

  const filename = path.basename(resolvedSnippetPath);

  // Check for .snippet. pattern in filename
  // Pattern: filename.snippet.snippetname.ext -> filename.ext
  // Capture the snippet name in group 2
  const snippetPattern = /^(.+)\.snippet\.([^.]+)(\.[^.]+)$/;
  const snippetMatch = filename.match(snippetPattern);

  if (!snippetMatch) {
    return undefined;
  }

  const snippetName = snippetMatch[2]; // e.g., "create-db"

  // Check if this is in code-examples/tested/ (may be accessed through symlink)
  // Match /code-examples/tested/ anywhere in the path
  const testedMatch = resolvedSnippetPath.match(
    /[/\\]code-examples[/\\]tested[/\\](.+)$/,
  );
  if (!testedMatch) {
    return undefined;
  }

  // testedMatch[1] is like: javascript/driver/time-series/sample-app.snippet.example.js
  const testedRelPath = testedMatch[1];

  // Parse the path to insert "examples" after "{lang}/driver/"
  // Pattern: {lang}/driver/{rest} -> {lang}/driver/examples/{rest}
  const driverMatch = testedRelPath.match(/^([^/\\]+[/\\]driver)[/\\](.+)$/);
  if (!driverMatch) {
    return undefined;
  }

  const langDriver = driverMatch[1]; // e.g., "javascript/driver"
  const restOfPath = driverMatch[2]; // e.g., "time-series/sample-app.snippet.example.js"

  // Reconstruct with original filename (without .snippet.name)
  const dir = path.dirname(restOfPath);
  const originalFilename = `${snippetMatch[1]}${snippetMatch[3]}`;

  const testFilePath = path.join(
    workspaceRoot,
    "code-example-tests",
    langDriver,
    "examples",
    dir,
    originalFilename,
  );

  return { testFilePath, snippetName };
}

/**
 * Code lens provider for literalinclude directives.
 * Shows "view" and optionally "test" links above each directive.
 */
export class LiteralIncludeCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const refs = parseLiteralIncludes(document);
    const lenses: vscode.CodeLens[] = [];
    const workspaceRoot = getWorkspaceRoot(document);

    for (const ref of refs) {
      const resolved = await resolveLiteralIncludePath(
        document.uri.fsPath,
        ref.targetPath,
        workspaceRoot,
      );

      // Position the lens on the literalinclude directive line itself
      // This makes the lens appear directly above the directive with minimal gap
      const directiveLine = ref.range.start.line;
      const lensRange = new vscode.Range(
        new vscode.Position(directiveLine, 0),
        new vscode.Position(directiveLine, 0),
      );

      if (resolved.exists) {
        // "view" lens - opens file in side-by-side editor
        lenses.push(
          new vscode.CodeLens(lensRange, {
            title: "📄 view",
            command: "grove.literalinclude.view",
            arguments: [resolved.absolutePath, ref.snippetName, ref.startAfter],
          }),
        );

        // Check if this is a Grove code example snippet (has .snippet. in filename)
        // The test file is in code-example-tests/{lang}/driver/examples/...
        const testFileResult = resolveTestFilePath(
          resolved.absolutePath,
          workspaceRoot,
        );
        if (testFileResult && fs.existsSync(testFileResult.testFilePath)) {
          lenses.push(
            new vscode.CodeLens(lensRange, {
              title: `🧪 test: ${testFileResult.snippetName}`,
              command: "grove.literalinclude.view",
              arguments: [testFileResult.testFilePath, ref.snippetName],
            }),
          );
        }
      } else {
        // Show error lens for missing files
        lenses.push(
          new vscode.CodeLens(lensRange, {
            title: `⚠️ ${resolved.error || "File not found"}`,
            command: "",
          }),
        );
      }
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}

/**
 * Definition provider for literalinclude directives.
 * Enables Ctrl+Click to navigate to the referenced file.
 */
export class LiteralIncludeDefinitionProvider
  implements vscode.DefinitionProvider
{
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    const ref = findLiteralIncludeAtPosition(document, position);
    if (!ref) {
      return undefined;
    }

    const workspaceRoot = getWorkspaceRoot(document);
    const resolved = await resolveLiteralIncludePath(
      document.uri.fsPath,
      ref.targetPath,
      workspaceRoot,
    );

    if (!resolved.exists) {
      return undefined;
    }

    const targetUri = vscode.Uri.file(resolved.absolutePath);

    // If there's a snippet name, try to find the snippet start
    if (ref.snippetName) {
      const lineNumber = await findSnippetLine(
        resolved.absolutePath,
        ref.snippetName,
      );
      if (lineNumber !== undefined) {
        return new vscode.Location(
          targetUri,
          new vscode.Position(lineNumber, 0),
        );
      }
    }

    // If there's a start-after marker, find that line
    if (ref.startAfter) {
      const lineNumber = await findMarkerLine(
        resolved.absolutePath,
        ref.startAfter,
      );
      if (lineNumber !== undefined) {
        return new vscode.Location(
          targetUri,
          new vscode.Position(lineNumber, 0),
        );
      }
    }

    // Default to start of file
    return new vscode.Location(targetUri, new vscode.Position(0, 0));
  }
}

/**
 * Document link provider for literalinclude directives.
 * Makes file paths clickable in RST files.
 */
export class LiteralIncludeLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentLink[]> {
    const refs = parseLiteralIncludes(document);
    const links: vscode.DocumentLink[] = [];
    const workspaceRoot = getWorkspaceRoot(document);

    for (const ref of refs) {
      const resolved = await resolveLiteralIncludePath(
        document.uri.fsPath,
        ref.targetPath,
        workspaceRoot,
      );

      if (resolved.exists) {
        const link = new vscode.DocumentLink(
          ref.pathRange,
          vscode.Uri.file(resolved.absolutePath),
        );
        link.tooltip = `Open ${path.basename(resolved.absolutePath)}`;
        links.push(link);
      } else {
        // Still create a link but with no target for visual indication
        const link = new vscode.DocumentLink(ref.pathRange);
        link.tooltip = resolved.error || "File not found";
        links.push(link);
      }
    }

    return links;
  }
}

/**
 * Find the line number where a Bluehawk snippet starts.
 * Looks for :snippet-start: comment markers.
 */
async function findSnippetLine(
  filePath: string,
  snippetName: string,
): Promise<number | undefined> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // Look for Bluehawk snippet markers
    // Formats: :snippet-start: name, // :snippet-start: name, # :snippet-start: name
    const snippetPattern = new RegExp(
      `[:;#/]\\s*:snippet-start:\\s*${escapeRegex(snippetName)}\\s*$`,
    );

    for (let i = 0; i < lines.length; i++) {
      if (snippetPattern.test(lines[i])) {
        return i;
      }
    }
  } catch {
    // Ignore file read errors
  }
  return undefined;
}

/**
 * Find the line number where a marker text appears.
 * Used for :start-after: resolution.
 */
async function findMarkerLine(
  filePath: string,
  marker: string,
): Promise<number | undefined> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) {
        return i + 1; // Return line after the marker
      }
    }
  } catch {
    // Ignore file read errors
  }
  return undefined;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Register all literalinclude providers and commands.
 */
export function registerLiteralIncludeProviders(
  context: vscode.ExtensionContext,
): void {
  const rstSelector: vscode.DocumentSelector = { language: "restructuredtext" };
  const txtSelector: vscode.DocumentSelector = {
    language: "plaintext",
    pattern: "**/*.txt",
  };
  const selectors = [rstSelector, txtSelector];

  // Register command for code lens action
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.literalinclude.view",
      async (filePath: string, snippetName?: string, startAfter?: string) => {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        });

        // Jump to snippet or marker if specified
        if (snippetName) {
          const lineNumber = await findSnippetLine(filePath, snippetName);
          if (lineNumber !== undefined) {
            const position = new vscode.Position(lineNumber, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter,
            );
          }
        } else if (startAfter) {
          const lineNumber = await findMarkerLine(filePath, startAfter);
          if (lineNumber !== undefined) {
            const position = new vscode.Position(lineNumber, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter,
            );
          }
        }
      },
    ),
  );

  // Register providers for each selector
  for (const selector of selectors) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        selector,
        new LiteralIncludeCodeLensProvider(),
      ),
      vscode.languages.registerDefinitionProvider(
        selector,
        new LiteralIncludeDefinitionProvider(),
      ),
      vscode.languages.registerDocumentLinkProvider(
        selector,
        new LiteralIncludeLinkProvider(),
      ),
    );
  }
}
