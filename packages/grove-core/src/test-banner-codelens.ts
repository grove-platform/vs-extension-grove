/**
 * "No test found" banner CodeLens provider.
 *
 * Emits a single CodeLens at line 0 of a Grove source file when:
 *   - the file lives under the project's `examples/` directory, and
 *   - no test file matching the language's naming convention exists
 *     anywhere under the project root.
 *
 * Any code under `examples/` is expected to be referenced by the docs,
 * so any uncovered source file is a candidate for /grove-test — this
 * intentionally does NOT require `:snippet-start:` tags, since suites
 * like mongosh ship untagged examples.
 */

import * as vscode from "vscode";
import * as path from "path";
import { findProjectForFile, type GroveLanguage } from "@grove/shared";
import { getCachedProjects } from "./project-cache";
import { parseSnippetBlocks } from "./snippet-codelens/snippet-parser";
import {
  resolveClaudeRoot,
  writeHandoff,
  type TestFromSourceContext,
} from "./handoff/writer";

/**
 * Glob patterns to search for a matching test file per language.
 * Passed through `vscode.workspace.findFiles` against the project root.
 * The `{base}` placeholder is substituted with the source file's basename
 * (without extension) before the search runs.
 */
const TEST_FILE_GLOBS: Record<GroveLanguage, string[]> = {
  nodejs: ["**/{base}.test.{js,ts,mjs,cjs}", "**/{base}.spec.{js,ts,mjs,cjs}"],
  mongosh: ["**/{base}.test.{js,mjs}", "**/{base}.spec.{js,mjs}"],
  python: ["**/test_{base}.py", "**/{base}_test.py"],
  go: ["**/{base}_test.go"],
  java: ["**/{base}Test.java", "**/{base}Tests.java"],
  csharp: ["**/{base}Tests.cs", "**/{base}Test.cs"],
};

/** Extensions we consider as code sources worth banner-checking. */
const SOURCE_EXTENSIONS = new Set([
  ".js", ".ts", ".mjs", ".cjs",
  ".py", ".go", ".java", ".cs", ".sh",
]);

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isInExamplesDir(
  sourceAbsPath: string,
  projectRootAbsPath: string,
): boolean {
  const rel = path.relative(projectRootAbsPath, sourceAbsPath);
  const head = rel.split(path.sep)[0];
  return head === "examples";
}

async function findMatchingTestFile(
  projectRootAbsPath: string,
  language: GroveLanguage,
  sourceBasename: string,
): Promise<vscode.Uri | undefined> {
  const patterns = TEST_FILE_GLOBS[language];
  for (const template of patterns) {
    const pattern = template.replaceAll("{base}", sourceBasename);
    const matches = await vscode.workspace.findFiles(
      new vscode.RelativePattern(projectRootAbsPath, pattern),
      null,
      1,
    );
    if (matches.length > 0) return matches[0];
  }
  return undefined;
}

export class TestBannerCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (!isSourceFile(document.uri.fsPath)) return [];

    const projects = await getCachedProjects();
    const project = findProjectForFile(document.uri.fsPath, projects);
    if (!project || !project.language) return [];

    if (!isInExamplesDir(document.uri.fsPath, project.rootPath)) return [];

    const sourceBasename = path.basename(
      document.uri.fsPath,
      path.extname(document.uri.fsPath),
    );

    const existingTest = await findMatchingTestFile(
      project.rootPath,
      project.language,
      sourceBasename,
    );
    if (existingTest) return [];

    // Best-effort snippet-name capture for the handoff — `[]` is fine when
    // the source has no Bluehawk tags (e.g., mongosh files).
    const snippetNames = parseSnippetBlocks(document).map((b) => b.name);

    const bannerRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0),
    );
    return [
      new vscode.CodeLens(bannerRange, {
        title: `$(warning) No test found — $(sparkle) Add test`,
        command: "grove.testFromSource",
        arguments: [
          document.uri,
          project.rootPath,
          project.language,
          snippetNames,
        ],
        tooltip: `Hand off to /grove-test for ${project.displayName}`,
      }),
    ];
  }
}

/**
 * Register the test-banner CodeLens provider, the handoff command, and a
 * FileSystemWatcher on likely test-file locations so the banner clears as
 * soon as the writer creates the test (and reappears if they delete it).
 */
export function registerTestBannerCodeLens(
  context: vscode.ExtensionContext,
): void {
  const provider = new TestBannerCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.testFromSource",
      async (
        sourceUri: vscode.Uri,
        projectRoot: string,
        language: GroveLanguage,
        snippetNames: string[],
      ) => {
        await testFromSource(sourceUri, projectRoot, language, snippetNames);
      },
    ),
  );

  // Refresh on test file create/delete across likely test naming patterns.
  // Using a broad glob keeps the watcher count small; the provider itself
  // re-runs findFiles to determine whether the banner should still show.
  const testFileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/{test_*,*_test,*.test,*.spec,*Test,*Tests}.{js,ts,mjs,cjs,py,go,java,cs}",
  );
  testFileWatcher.onDidCreate(() => provider.refresh());
  testFileWatcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(testFileWatcher);
}

async function testFromSource(
  sourceUri: vscode.Uri,
  projectRoot: string,
  language: GroveLanguage,
  snippetNames: string[],
): Promise<void> {
  const claudeRoot = await resolveClaudeRoot();
  if (!claudeRoot) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }

  const context: TestFromSourceContext = {
    sourceFile: path.relative(claudeRoot, sourceUri.fsPath),
    projectPath: path.relative(claudeRoot, projectRoot),
    language,
    snippetNames,
  };

  try {
    await writeHandoff(
      "grove-test",
      "untested-source",
      context,
      claudeRoot,
    );

    let primaryEditorOpened = false;
    try {
      await vscode.commands.executeCommand(
        "claude-vscode.primaryEditor.open",
        undefined,
        "/grove-test",
      );
      primaryEditorOpened = true;
    } catch {
      try {
        await vscode.commands.executeCommand("claude-vscode.sidebar.open");
      } catch {
        // Claude Code extension not available — skip focus entirely.
      }
    }

    const sourceBase = path.basename(sourceUri.fsPath);
    vscode.window.showInformationMessage(
      primaryEditorOpened
        ? `Grove handoff ready. Press Enter in Claude Code to add a test for "${sourceBase}".`
        : `Grove handoff ready. Type /grove-test in Claude Code to add a test for "${sourceBase}".`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to write Grove handoff: ${err}`);
  }
}
