/**
 * Snippet Reference Searcher
 *
 * Opens VS Code's search panel to find references to Bluehawk snippets.
 */

import * as vscode from "vscode";

/**
 * Open VS Code's search panel with a query for the snippet.
 *
 * This uses the stable workbench.action.findInFiles command to trigger
 * VS Code's native search (powered by ripgrep).
 */
export async function openSnippetSearch(snippetName: string): Promise<void> {
  // Search for both patterns:
  // - :snippet: snippet-name (option style)
  // - .snippet.snippet-name. (extracted file style)
  const searchQuery = `${snippetName}`;

  await vscode.commands.executeCommand("workbench.action.findInFiles", {
    query: searchQuery,
    filesToInclude: "**/*.{rst,txt}",
    triggerSearch: true,
    isRegex: false,
    isCaseSensitive: true,
  });
}
