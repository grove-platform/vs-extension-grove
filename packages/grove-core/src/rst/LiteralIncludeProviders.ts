/**
 * Grove RST Directive Providers
 *
 * Provides code lenses, go-to-definition, and document links
 * for file-referencing directives in RST files:
 * - literalinclude:: - code examples with syntax highlighting
 * - include:: - RST content inclusion
 * - io-code-block (input/output) - input/output examples
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  parseDirectives,
  findDirectiveAtPosition,
  type DirectiveRef,
} from "./directive-parser";
import { resolveDirectivePath } from "./path-resolver";
import { resolveExtract } from "./extract-resolver";
import { profile, profileSync } from "@grove/shared";
import {
  writeHandoff,
  type MigrateFromRstContext,
} from "../handoff/writer";

/**
 * File extensions we recognise as code we can migrate into the Grove suite.
 * RST/YAML/plain-text targets are out of scope.
 */
const CODE_FILE_EXTENSIONS = new Set([
  ".py", ".js", ".ts", ".mjs", ".cjs",
  ".go", ".java", ".cs", ".sh",
]);

/** Map file extensions to the language value /grove-migrate expects. */
const EXT_TO_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".sh": "mongosh",
};

function isMigratableCodeFile(absolutePath: string): boolean {
  return CODE_FILE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase());
}

function inferLanguage(absolutePath: string): string | undefined {
  return EXT_TO_LANGUAGE[path.extname(absolutePath).toLowerCase()];
}

/**
 * Get the workspace root for the current document.
 */
function getWorkspaceRoot(document: vscode.TextDocument): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder?.uri.fsPath;
}

interface SourceFileResult {
  sourceFilePath: string;
  snippetName: string;
}

interface TestFileResult {
  testFilePath: string;
  snippetName: string;
}

/**
 * Resolve a snippet file path to its original source file in code-example-tests/examples/.
 *
 * Grove's snip.js generates snippets from:
 *   code-example-tests/{lang}/{product}/examples/... -> content/code-examples/tested/{lang}/{product}/...
 *
 * Each docs project symlinks to the shared snippets:
 *   content/manual/v8.0/source/code-examples/tested -> ../../../../code-examples/tested
 *
 * So the resolved path may look like:
 *   .../content/manual/v8.0/source/code-examples/tested/javascript/driver/time-series/sample-app.snippet.example.js
 *   .../content/code-examples/tested/python/pymongo/aggregation/pipelines/filter_tutorial.snippet.sort.py
 *
 * We need to transform to:
 *   code-example-tests/javascript/driver/examples/time-series/sample-app.js
 *   code-example-tests/python/pymongo/examples/aggregation/pipelines/filter_tutorial.py
 *
 * Returns undefined if the path doesn't match the pattern.
 */
function resolveSourceFilePath(
  resolvedSnippetPath: string,
  workspaceRoot?: string,
): SourceFileResult | undefined {
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
  // or: python/pymongo/aggregation/pipelines/filter_tutorial.snippet.sort.py
  const testedRelPath = testedMatch[1];

  // Parse the path to insert "examples" after "{lang}/{product}/"
  // Pattern: {lang}/{product}/{rest} -> {lang}/{product}/examples/{rest}
  // Supports: javascript/driver, python/pymongo, command-line/mongosh, etc.
  const projectMatch = testedRelPath.match(/^([^/\\]+[/\\][^/\\]+)[/\\](.+)$/);
  if (!projectMatch) {
    return undefined;
  }

  const langProduct = projectMatch[1]; // e.g., "javascript/driver", "python/pymongo"
  const restOfPath = projectMatch[2]; // e.g., "time-series/sample-app.snippet.example.js"

  // Reconstruct with original filename (without .snippet.name)
  const dir = path.dirname(restOfPath);
  const originalFilename = `${snippetMatch[1]}${snippetMatch[3]}`;

  const sourceFilePath = path.join(
    workspaceRoot,
    "code-example-tests",
    langProduct,
    "examples",
    dir,
    originalFilename,
  );

  return { sourceFilePath, snippetName };
}

/**
 * Resolve a snippet file path to its actual test file in code-example-tests/tests/.
 *
 * Test files follow patterns like:
 *   - examples/time-series/create-query/create-query-collection.js -> tests/time-series/create-query-collection.test.js
 *   - examples/time-series/sample-app.js -> tests/time-series/sample-app.test.js
 *
 * The function tries multiple possible test file locations and project structures:
 *   - javascript/driver (uses tests/)
 *   - python/pymongo (uses tests_package/)
 *   - command-line/mongosh (uses tests/)
 */
function resolveActualTestFilePath(
  resolvedSnippetPath: string,
  workspaceRoot?: string,
): TestFileResult | undefined {
  if (!workspaceRoot) {
    return undefined;
  }

  const filename = path.basename(resolvedSnippetPath);

  // Check for .snippet. pattern in filename
  const snippetPattern = /^(.+)\.snippet\.([^.]+)(\.[^.]+)$/;
  const snippetMatch = filename.match(snippetPattern);

  if (!snippetMatch) {
    return undefined;
  }

  const snippetName = snippetMatch[2];

  // Check if this is in code-examples/tested/
  const testedMatch = resolvedSnippetPath.match(
    /[/\\]code-examples[/\\]tested[/\\](.+)$/,
  );
  if (!testedMatch) {
    return undefined;
  }

  const testedRelPath = testedMatch[1];

  // Parse the path: {lang}/{product}/{rest}
  // Supports: javascript/driver, python/pymongo, command-line/mongosh, etc.
  const projectMatch = testedRelPath.match(/^([^/\\]+[/\\][^/\\]+)[/\\](.+)$/);
  if (!projectMatch) {
    return undefined;
  }

  const langProduct = projectMatch[1]; // e.g., "javascript/driver", "python/pymongo"
  const restOfPath = projectMatch[2]; // e.g., "time-series/sample-app.snippet.example.js"

  // Get the original filename (without .snippet.name)
  const baseFilename = snippetMatch[1]; // e.g., "sample-app" or "create-query-collection"
  const ext = snippetMatch[3]; // e.g., ".js"

  // Get the directory path
  const dir = path.dirname(restOfPath);

  // Build test filename: add .test before extension
  const testFilename = `${baseFilename}.test${ext}`;

  // Test directory names vary by project
  const testDirNames = ["tests", "tests_package"];

  // Try different possible test file locations
  const possiblePaths: string[] = [];

  for (const testDirName of testDirNames) {
    // 1. Direct mapping: examples/a/b/file.js -> tests/a/b/file.test.js
    possiblePaths.push(
      path.join(
        workspaceRoot,
        "code-example-tests",
        langProduct,
        testDirName,
        dir,
        testFilename,
      ),
    );
    // 2. Flattened: examples/a/b/file.js -> tests/a/file.test.js (one level up)
    possiblePaths.push(
      path.join(
        workspaceRoot,
        "code-example-tests",
        langProduct,
        testDirName,
        path.dirname(dir),
        testFilename,
      ),
    );
    // 3. Top-level of category: examples/a/b/c/file.js -> tests/a/file.test.js
    const topLevelDir = dir.split(path.sep)[0];
    if (topLevelDir && topLevelDir !== ".") {
      possiblePaths.push(
        path.join(
          workspaceRoot,
          "code-example-tests",
          langProduct,
          testDirName,
          topLevelDir,
          testFilename,
        ),
      );
    }
  }

  // Return the first existing path
  for (const testFilePath of possiblePaths) {
    if (fs.existsSync(testFilePath)) {
      return { testFilePath, snippetName };
    }
  }

  // Fallback: search test files for imports that reference the source file.
  // This handles cases where the test file name doesn't match the source file name
  // (e.g., quick-start.test.js imports from quick-start-setup.js).
  const sourceFileResult = resolveSourceFilePath(resolvedSnippetPath, workspaceRoot);
  if (sourceFileResult) {
    const testByImport = findTestByImport(
      sourceFileResult.sourceFilePath,
      workspaceRoot,
      langProduct,
      testDirNames,
    );
    if (testByImport) {
      return { testFilePath: testByImport, snippetName };
    }
  }

  return undefined;
}

/**
 * Cache for import-based test file lookups.
 * Maps source file path -> test file path (or empty string if not found).
 */
const importTestFileCache = new Map<string, string>();

/**
 * Find a test file that imports a given source file by scanning import statements.
 *
 * When the test filename doesn't match the source filename (e.g., quick-start.test.js
 * imports quick-start-setup.js), we fall back to reading test files and checking
 * their imports/requires for references to the source file.
 */
function findTestByImport(
  sourceFilePath: string,
  workspaceRoot: string,
  langProduct: string,
  testDirNames: string[],
): string | undefined {
  const cacheKey = sourceFilePath;
  const cached = importTestFileCache.get(cacheKey);
  if (cached !== undefined) {
    return cached || undefined;
  }

  // Build the relative path from {lang}/{product}/ to the source file
  // e.g., "examples/time-series/quick-start/quick-start-setup.js"
  const projectRoot = path.join(workspaceRoot, "code-example-tests", langProduct);
  const sourceRelPath = path.relative(projectRoot, sourceFilePath);

  // Build search strings from the source file's relative path.
  // Normalize to forward slashes for matching.
  const sourceRelForward = sourceRelPath.replace(/\\/g, "/");
  // Strip extension for matching (imports often omit it)
  const sourceRelNoExt = sourceRelForward.replace(/\.[^.]+$/, "");
  // Dot-separated path for Python imports (examples.module.name)
  const sourceDotPath = sourceRelNoExt.replace(/\//g, ".");
  // Path without "examples/" prefix for mongosh-style string references
  // (e.g., outputFromExampleFiles(["aggregation/expressions/convert/load-data.js"]))
  const sourceWithoutExamples = sourceRelForward.replace(/^examples\//, "");

  for (const testDirName of testDirNames) {
    const testsDir = path.join(projectRoot, testDirName);
    if (!fs.existsSync(testsDir)) {
      continue;
    }

    const testFiles = collectFiles(testsDir);
    for (const testFile of testFiles) {
      let content: string;
      try {
        content = fs.readFileSync(testFile, "utf-8");
      } catch {
        continue;
      }

      // Check if any import/require/string reference points to the source file.
      // Covers patterns like:
      //   import { fn } from '../../examples/time-series/quick-start/quick-start-setup.js'
      //   require("../../examples/time-series/quick-start/quick-start-setup")
      //   import examples.timeseries.ts_quick_start as alias  (Python)
      //   "driver-examples/examples/time-series/quick-start/quick-start-setup"  (Go)
      //   outputFromExampleFiles(["time-series/quick-start/quick-start-setup.js"])  (mongosh)
      if (
        content.includes(sourceRelForward) ||
        content.includes(sourceRelNoExt) ||
        content.includes(sourceDotPath) ||
        content.includes(sourceWithoutExamples)
      ) {
        importTestFileCache.set(cacheKey, testFile);
        return testFile;
      }
    }
  }

  importTestFileCache.set(cacheKey, "");
  return undefined;
}

/**
 * Recursively collect all files in a directory.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Get display label for directive type.
 */
function getDirectiveLabel(ref: DirectiveRef): string {
  switch (ref.type) {
    case "literalinclude":
      return "📄 view";
    case "include":
      return "📄 view";
    case "input":
      return "📥 input";
    case "output":
      return "📤 output";
    default:
      return "📄 view";
  }
}

/**
 * Code lens provider for file-referencing RST directives.
 * Shows "view" and optionally "test" links above each directive.
 */
export class RstDirectiveCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const refs = profileSync("RstCodeLens.parseDirectives", () =>
      parseDirectives(document),
    );
    const lenses: vscode.CodeLens[] = [];
    const workspaceRoot = getWorkspaceRoot(document);

    for (const ref of refs) {
      // Position the lens on the directive line itself
      const directiveLine = ref.range.start.line;
      const lensRange = new vscode.Range(
        new vscode.Position(directiveLine, 0),
        new vscode.Position(directiveLine, 0),
      );

      // Handle extract includes differently - they resolve to YAML refs
      if (ref.isExtract) {
        const resolution = await profile("RstCodeLens.resolveExtract", () =>
          resolveExtract(document.uri.fsPath, ref.targetPath),
        );

        if (resolution.exists) {
          // Create CodeLens that links to YAML file
          lenses.push(
            new vscode.CodeLens(lensRange, {
              title: "📋 extract",
              command: "grove.openFileAtLine",
              arguments: [resolution.yamlFilePath, resolution.lineNumber],
              tooltip: `Go to ref: ${resolution.refName} in ${path.basename(resolution.yamlFilePath)}`,
            }),
          );
        } else {
          // Show error lens for missing extract
          lenses.push(
            new vscode.CodeLens(lensRange, {
              title: `⚠️ Extract not found: ${resolution.refName}`,
              command: "",
            }),
          );
        }
        continue; // Skip normal file handling
      }

      const resolved = await profile("RstCodeLens.resolvePath", () =>
        resolveDirectivePath(
          document.uri.fsPath,
          ref.targetPath,
          workspaceRoot,
          {
            resolveSymlinks: ref.needsSymlinkResolution,
          },
        ),
      );

      if (resolved.exists) {
        // "view" lens - opens file in side-by-side editor
        lenses.push(
          new vscode.CodeLens(lensRange, {
            title: getDirectiveLabel(ref),
            command: "grove.literalinclude.view",
            arguments: [resolved.absolutePath, ref.snippetName, ref.startAfter],
          }),
        );

        // Check if this is a Grove code example snippet (has .snippet. in filename)
        // Only show source/test links for literalinclude and io-code-block (not include)
        if (ref.type !== "include") {
          // "source" lens - links to the Bluehawk source file with markup tags
          const sourceFileResult = resolveSourceFilePath(
            resolved.absolutePath,
            workspaceRoot,
          );
          const hasSourceFile =
            !!sourceFileResult && fs.existsSync(sourceFileResult.sourceFilePath);
          if (hasSourceFile && sourceFileResult) {
            lenses.push(
              new vscode.CodeLens(lensRange, {
                title: `📄 source`,
                command: "grove.literalinclude.view",
                arguments: [sourceFileResult.sourceFilePath, ref.snippetName],
              }),
            );
          }

          // "test" lens - links to the actual test file that runs the code
          const testFileResult = resolveActualTestFilePath(
            resolved.absolutePath,
            workspaceRoot,
          );
          const hasTestFile =
            !!testFileResult && fs.existsSync(testFileResult.testFilePath);
          if (hasTestFile && testFileResult) {
            lenses.push(
              new vscode.CodeLens(lensRange, {
                title: `🧪 test`,
                command: "grove.literalinclude.view",
                arguments: [testFileResult.testFilePath, ref.snippetName],
              }),
            );
          }

          // "Migrate to Grove" lens - shown when the directive targets a real
          // code file that isn't yet wired into the Grove-tested tree (no
          // Bluehawk source, no test). Signals the writer can hand this
          // example off to /grove-migrate.
          if (
            !hasSourceFile &&
            !hasTestFile &&
            isMigratableCodeFile(resolved.absolutePath)
          ) {
            lenses.push(
              new vscode.CodeLens(lensRange, {
                title: `$(sparkle) Migrate to Grove`,
                command: "grove.migrateDirective",
                arguments: [
                  document.uri,
                  directiveLine,
                  ref.targetPath,
                  resolved.absolutePath,
                  ref.snippetName,
                  ref.language ?? inferLanguage(resolved.absolutePath),
                  ref.type,
                ],
                tooltip: `Hand off ${path.basename(resolved.absolutePath)} to /grove-migrate`,
              }),
            );
          }
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
 * Definition provider for file-referencing RST directives.
 * Enables Ctrl+Click to navigate to the referenced file.
 */
export class RstDirectiveDefinitionProvider
  implements vscode.DefinitionProvider
{
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    const ref = findDirectiveAtPosition(document, position);
    if (!ref) {
      return undefined;
    }

    // Handle extract includes - navigate to YAML source
    if (ref.isExtract) {
      const resolution = await profile("RstDefinition.resolveExtract", () =>
        resolveExtract(document.uri.fsPath, ref.targetPath),
      );
      if (resolution.exists) {
        return new vscode.Location(
          vscode.Uri.file(resolution.yamlFilePath),
          new vscode.Position(resolution.lineNumber - 1, 0),
        );
      }
      return undefined;
    }

    const workspaceRoot = getWorkspaceRoot(document);
    const resolved = await profile("RstDefinition.resolvePath", () =>
      resolveDirectivePath(document.uri.fsPath, ref.targetPath, workspaceRoot, {
        resolveSymlinks: ref.needsSymlinkResolution,
      }),
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
 * Document link provider for file-referencing RST directives.
 * Makes file paths clickable in RST files.
 */
export class RstDirectiveLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentLink[]> {
    const refs = profileSync("RstLinks.parseDirectives", () =>
      parseDirectives(document),
    );
    const links: vscode.DocumentLink[] = [];
    const workspaceRoot = getWorkspaceRoot(document);

    for (const ref of refs) {
      // Handle extract includes - link to YAML source
      if (ref.isExtract) {
        const resolution = await profile("RstLinks.resolveExtract", () =>
          resolveExtract(document.uri.fsPath, ref.targetPath),
        );

        if (resolution.exists) {
          // Create URI with line number fragment for navigation
          const uri = vscode.Uri.file(resolution.yamlFilePath).with({
            fragment: `L${resolution.lineNumber}`,
          });
          const link = new vscode.DocumentLink(ref.pathRange, uri);
          link.tooltip = `Go to ref: ${resolution.refName} in ${path.basename(resolution.yamlFilePath)}`;
          links.push(link);
        } else {
          const link = new vscode.DocumentLink(ref.pathRange);
          link.tooltip = resolution.error || "Extract not found";
          links.push(link);
        }
        continue;
      }

      const resolved = await profile("RstLinks.resolvePath", () =>
        resolveDirectivePath(
          document.uri.fsPath,
          ref.targetPath,
          workspaceRoot,
          {
            resolveSymlinks: ref.needsSymlinkResolution,
          },
        ),
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
 * Register all RST directive providers and commands.
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

  // Register command for code lens action (used by all directive types)
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

  // Register command for opening file at specific line (used by extract CodeLens)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.openFileAtLine",
      async (filePath: string, lineNumber: number) => {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        });
        const position = new vscode.Position(lineNumber - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );
      },
    ),
  );

  // Register command for "Migrate to Grove" CodeLens on untested literalinclude
  // directives. Writes a handoff payload and hands off to /grove-migrate.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.migrateDirective",
      async (
        rstUri: vscode.Uri,
        rstLine: number,
        targetPath: string,
        absolutePath: string,
        snippetName: string | undefined,
        language: string | undefined,
        directiveType: "literalinclude" | "input" | "output",
      ) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder is open.");
          return;
        }

        const rstFileRel = path.relative(
          workspaceFolder.uri.fsPath,
          rstUri.fsPath,
        );

        const context: MigrateFromRstContext = {
          targetPath,
          absolutePath,
          snippetName,
          language,
          directiveType,
          rstFile: rstFileRel,
          rstLine,
        };

        try {
          const handoffUri = await writeHandoff(
            "grove-migrate",
            "rst-literalinclude",
            context,
          );
          if (!handoffUri) return;

          let primaryEditorOpened = false;
          try {
            await vscode.commands.executeCommand(
              "claude-vscode.primaryEditor.open",
              undefined,
              "/grove-migrate",
            );
            primaryEditorOpened = true;
          } catch {
            try {
              await vscode.commands.executeCommand(
                "claude-vscode.sidebar.open",
              );
            } catch {
              // Claude Code extension not available — skip focus entirely.
            }
          }

          const fileName = path.basename(absolutePath);
          vscode.window.showInformationMessage(
            primaryEditorOpened
              ? `Grove handoff ready. Press Enter in Claude Code to migrate "${fileName}".`
              : `Grove handoff ready. Type /grove-migrate in Claude Code to migrate "${fileName}".`,
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to write Grove handoff: ${err}`,
          );
        }
      },
    ),
  );

  // Register providers for each selector
  for (const selector of selectors) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        selector,
        new RstDirectiveCodeLensProvider(),
      ),
      vscode.languages.registerDefinitionProvider(
        selector,
        new RstDirectiveDefinitionProvider(),
      ),
      vscode.languages.registerDocumentLinkProvider(
        selector,
        new RstDirectiveLinkProvider(),
      ),
    );
  }
}

// Legacy exports for backward compatibility
export {
  RstDirectiveCodeLensProvider as LiteralIncludeCodeLensProvider,
  RstDirectiveDefinitionProvider as LiteralIncludeDefinitionProvider,
  RstDirectiveLinkProvider as LiteralIncludeLinkProvider,
};
