/**
 * Snippet CodeLens Module
 *
 * Registers CodeLens providers for Bluehawk :snippet-start: tags,
 * with "Find References" (search panel) and "Peek" (peek view) actions.
 */

import * as vscode from "vscode";
import { SnippetCodeLensProvider } from "./SnippetCodeLensProvider";
import { openSnippetSearch } from "./reference-searcher";
import { findSnippetReferencesWithRipgrep } from "./ripgrep-searcher";

// Module-level provider instance
let snippetCodeLensProvider: SnippetCodeLensProvider;

/**
 * Register snippet CodeLens providers and commands.
 */
export function registerSnippetCodeLens(
  context: vscode.ExtensionContext,
): void {
  snippetCodeLensProvider = new SnippetCodeLensProvider();

  // Register for common code file languages
  const selectors: vscode.DocumentSelector = [
    { language: "javascript", scheme: "file" },
    { language: "typescript", scheme: "file" },
    { language: "javascriptreact", scheme: "file" },
    { language: "typescriptreact", scheme: "file" },
    { language: "python", scheme: "file" },
    { language: "java", scheme: "file" },
    { language: "csharp", scheme: "file" },
    { language: "cpp", scheme: "file" },
    { language: "c", scheme: "file" },
    { language: "go", scheme: "file" },
    { language: "rust", scheme: "file" },
    { language: "ruby", scheme: "file" },
    { language: "php", scheme: "file" },
    { language: "swift", scheme: "file" },
    { language: "kotlin", scheme: "file" },
    { language: "scala", scheme: "file" },
    { language: "shellscript", scheme: "file" },
    { language: "yaml", scheme: "file" },
    { language: "json", scheme: "file" },
  ];

  // Register CodeLens provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      selectors,
      snippetCodeLensProvider,
    ),
  );

  // Register find references command - opens VS Code's search panel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.findSnippetReferences",
      async (_uri: vscode.Uri, snippetName: string, _line: number) => {
        await openSnippetSearch(snippetName);
      },
    ),
  );

  // Register peek command - uses ripgrep to find references and shows in peek view
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.peekSnippetReferences",
      async (uri: vscode.Uri | undefined, snippetName: string, line: number) => {
        await peekSnippetReferences(uri, snippetName, line);
      },
    ),
  );

  // Invalidate instance cache when a file is edited so counts refresh
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0) {
        snippetCodeLensProvider.invalidateDocument(e.document.uri);
      }
    }),
  );
}

/**
 * Find snippet references using ripgrep and show in QuickPick.
 */
async function peekSnippetReferences(
  uri: vscode.Uri | undefined,
  snippetName: string,
  _line: number,
): Promise<void> {
  const references = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Finding references to "${snippetName}"...`,
      cancellable: false,
    },
    async () => {
      return await findSnippetReferencesWithRipgrep(snippetName, uri);
    },
  );

  if (references.length === 0) {
    vscode.window.showInformationMessage(
      `No RST files reference snippet "${snippetName}"`,
    );
    return;
  }

  // Get workspace folder for relative path calculation
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  // Create QuickPick items with formatted paths
  interface ReferenceQuickPickItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
    line: number;
    column: number;
  }

  const items: ReferenceQuickPickItem[] = references.map((ref) => {
    const fullPath = ref.uri.fsPath;
    const relativePath = fullPath.startsWith(workspaceFolder)
      ? fullPath.slice(workspaceFolder.length + 1)
      : fullPath;

    // Split into filename and directory
    const parts = relativePath.split("/");
    const fileName = parts.pop() ?? relativePath;
    const directory = parts.join("/");

    return {
      label: `$(file) ${fileName}`,
      description: `line ${ref.line + 1}`,
      detail: `$(folder) ${directory}`,
      uri: ref.uri,
      line: ref.line,
      column: ref.column,
    };
  });

  // Show QuickPick
  const selected = await vscode.window.showQuickPick(items, {
    title: `References to "${snippetName}" (${references.length} found)`,
    placeHolder: "Select a reference to open",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    // Open the file and go to the line
    const doc = await vscode.workspace.openTextDocument(selected.uri);
    const editor = await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(selected.line, selected.column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter,
    );
  }
}

export { SnippetCodeLensProvider } from "./SnippetCodeLensProvider";
export { parseSnippetBlocks, mightContainSnippets } from "./snippet-parser";
export { openSnippetSearch } from "./reference-searcher";
export {
  findSnippetReferencesWithRipgrep,
  clearReferenceCache,
} from "./ripgrep-searcher";
