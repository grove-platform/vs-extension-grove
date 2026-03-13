/**
 * Snippet CodeLens Provider
 *
 * Provides a "{n} references" CodeLens above :snippet-start: tags
 * that shows the reference count and opens a quick pick for navigation.
 */

import * as vscode from "vscode";
import { parseSnippetBlocks, mightContainSnippets } from "./snippet-parser";
import { findSnippetReferencesWithRipgrep } from "./ripgrep-searcher";
import { profile, profileSync } from "@grove/shared";

export class SnippetCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    // Quick check before parsing
    if (!mightContainSnippets(document)) {
      return [];
    }

    const blocks = profileSync("SnippetCodeLens.parseBlocks", () =>
      parseSnippetBlocks(document),
    );
    const lenses: vscode.CodeLens[] = [];

    // Fetch reference counts for all snippets in parallel
    const referenceCounts = await profile(
      "SnippetCodeLens.fetchAllReferences",
      () =>
        Promise.all(
          blocks.map(async (block) => {
            const refs = await findSnippetReferencesWithRipgrep(
              block.name,
              document.uri,
            );
            return refs.length;
          }),
        ),
    );

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const refCount = referenceCounts[i];

      const lensRange = new vscode.Range(
        new vscode.Position(block.line, 0),
        new vscode.Position(block.line, 0),
      );

      // "{n} references" - shows count and opens quick pick
      const refLabel =
        refCount === 1 ? "1 reference" : `${refCount} references`;
      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: `$(references)  ${refLabel}`,
          command: "grove.peekSnippetReferences",
          arguments: [document.uri, block.name, block.line],
          tooltip: `View ${refLabel} to snippet "${block.name}"`,
        }),
      );
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
