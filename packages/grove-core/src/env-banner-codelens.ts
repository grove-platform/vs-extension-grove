/**
 * "No .env detected" banner CodeLens provider.
 *
 * Emits a single CodeLens at line 0 of any Grove test file whose owning
 * project has no `.env` file. Catches writers mid-action (they opened a
 * test to run it) and hands off to `/grove-setup`.
 *
 * This is a separate provider from TestCodeLensProvider (which only
 * registers for JS/TS and emits Jest-style Run/Debug lenses) because the
 * env banner applies to every Grove language suite: Python, Java, C#,
 * Go, and mongosh.
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { findProjectForFile, type GroveLanguage } from "@grove/shared";
import { getCachedProjects } from "./project-cache";
import {
  resolveClaudeRoot,
  writeHandoff,
  type SetupFromMissingEnvContext,
} from "./handoff/writer";

/**
 * Heuristics to identify test files across every Grove language suite.
 * Errs on the side of inclusion — false positives just show one extra
 * lens on a non-test file, no functional harm.
 */
function isLikelyTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  const posix = filePath.replaceAll("\\", "/");
  return (
    /\.(test|spec)\.[jt]sx?$/.test(base) ||      // JS/TS: foo.test.js, foo.spec.ts
    /^test_.+\.py$/.test(base) ||                 // Python pytest: test_foo.py
    /_test\.(py|go)$/.test(base) ||               // Python/Go: foo_test.py, foo_test.go
    /Test\.java$/.test(base) ||                   // Java JUnit: FooTest.java
    /Tests?\.cs$/.test(base) ||                   // C# NUnit/xUnit: FooTests.cs
    /\/tests?\//.test(posix) ||                   // any file under /tests/ or /test/
    /\/__tests__\//.test(posix) ||                // Jest convention
    /\/tests_package\//.test(posix)               // mongosh tests_package convention
  );
}

async function projectHasEnv(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectRoot, ".env"));
    return true;
  } catch {
    return false;
  }
}

export class EnvBannerCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (!isLikelyTestFile(document.uri.fsPath)) return [];

    const projects = await getCachedProjects();
    const project = findProjectForFile(document.uri.fsPath, projects);
    if (!project || !project.language) return [];

    if (await projectHasEnv(project.rootPath)) return [];

    const bannerRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0),
    );
    return [
      new vscode.CodeLens(bannerRange, {
        title: `$(warning) No .env detected — $(sparkle) Set up Grove`,
        command: "grove.setupFromMissingEnv",
        arguments: [
          document.uri,
          project.rootPath,
          project.language,
          project.supportsEnvInjection,
        ],
        tooltip: `Hand off to /grove-setup for ${project.displayName}`,
      }),
    ];
  }
}

/**
 * Register the env-banner CodeLens provider, the handoff command it
 * invokes, and the `**​/.env` watcher that refreshes lenses on create/
 * delete so the banner clears the moment the writer creates `.env`.
 */
export function registerEnvBannerCodeLens(
  context: vscode.ExtensionContext,
): void {
  const provider = new EnvBannerCodeLensProvider();

  // Match any file on disk; the provider filters internally via
  // isLikelyTestFile and project-membership.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.setupFromMissingEnv",
      async (
        testUri: vscode.Uri,
        projectRoot: string,
        language: GroveLanguage,
        supportsEnvInjection: boolean,
      ) => {
        await setupFromMissingEnv(
          testUri,
          projectRoot,
          language,
          supportsEnvInjection,
        );
      },
    ),
  );

  // Refresh on .env create/delete so the banner clears immediately when
  // the writer fixes the issue (and reappears if they remove .env).
  const envWatcher = vscode.workspace.createFileSystemWatcher("**/.env");
  envWatcher.onDidCreate(() => provider.refresh());
  envWatcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(envWatcher);
}

async function setupFromMissingEnv(
  testUri: vscode.Uri,
  projectRoot: string,
  language: GroveLanguage,
  supportsEnvInjection: boolean,
): Promise<void> {
  const claudeRoot = await resolveClaudeRoot();
  if (!claudeRoot) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }

  const setupContext: SetupFromMissingEnvContext = {
    projectPath: path.relative(claudeRoot, projectRoot),
    language,
    testFile: path.relative(claudeRoot, testUri.fsPath),
    supportsEnvInjection,
  };

  try {
    await writeHandoff("grove-setup", "missing-env", setupContext, claudeRoot);

    let primaryEditorOpened = false;
    try {
      await vscode.commands.executeCommand(
        "claude-vscode.primaryEditor.open",
        undefined,
        "/grove-setup",
      );
      primaryEditorOpened = true;
    } catch {
      try {
        await vscode.commands.executeCommand("claude-vscode.sidebar.open");
      } catch {
        // Claude Code extension not available — skip focus entirely.
      }
    }

    vscode.window.showInformationMessage(
      primaryEditorOpened
        ? `Grove handoff ready. Press Enter in Claude Code to set up .env for ${language}.`
        : `Grove handoff ready. Type /grove-setup in Claude Code to set up .env for ${language}.`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to write Grove handoff: ${err}`);
  }
}
