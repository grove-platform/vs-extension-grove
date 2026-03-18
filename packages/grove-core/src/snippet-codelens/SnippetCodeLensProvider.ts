/**
 * Snippet CodeLens Provider
 *
 * Provides a "{n} references" CodeLens above :snippet-start: tags
 * that shows the reference count and opens a quick pick for navigation.
 */

import * as vscode from "vscode";
import {
  parseSnippetBlocks,
  mightContainSnippets,
  SnippetBlock,
} from "./snippet-parser";
import { findSnippetReferencesWithRipgrep } from "./ripgrep-searcher";
import { profile, profileSync } from "@grove/shared";

export class SnippetCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Map from document URI → resolved reference counts per snippet (null while pending)
  private _pendingResults = new Map<string, number[] | null>();

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (!mightContainSnippets(document)) {
      return [];
    }

    const blocks = profileSync("SnippetCodeLens.parseBlocks", () =>
      parseSnippetBlocks(document),
    );

    if (blocks.length === 0) {
      return [];
    }

    const docKey = document.uri.toString();
    const cached = this._pendingResults.get(docKey);

    // Phase 2: results are ready — return real lenses
    if (cached !== null && cached !== undefined) {
      return this._buildLenses(blocks, cached);
    }

    // Phase 1: no results yet — kick off search and return spinner lenses
    if (!this._pendingResults.has(docKey)) {
      // Mark as in-progress (null = pending)
      this._pendingResults.set(docKey, null);

      // Run searches in background
      profile("SnippetCodeLens.fetchAllReferences", () =>
        Promise.all(
          blocks.map((block) =>
            findSnippetReferencesWithRipgrep(block.name, document.uri).then(
              (refs) => refs.length,
            ),
          ),
        ),
      )
        .then((counts) => {
          this._pendingResults.set(docKey, counts);
          this._onDidChangeCodeLenses.fire();
        })
        .catch(() => {
          // On error, remove key so next render retries
          this._pendingResults.delete(docKey);
          this._onDidChangeCodeLenses.fire();
        });
    }

    // Return spinner placeholder lenses while search runs
    return blocks.map((block) => {
      const lensRange = new vscode.Range(
        new vscode.Position(block.line, 0),
        new vscode.Position(block.line, 0),
      );
      return new vscode.CodeLens(lensRange, {
        title: `$(loading~spin)  searching references...`,
        command: "",
      });
    });
  }

  private _buildLenses(blocks: SnippetBlock[], counts: number[]): vscode.CodeLens[] {
    return blocks.map((block, i) => {
      const refCount = counts[i] ?? 0;
      const lensRange = new vscode.Range(
        new vscode.Position(block.line, 0),
        new vscode.Position(block.line, 0),
      );
      const refLabel = refCount === 1 ? "1 reference" : `${refCount} references`;
      return new vscode.CodeLens(lensRange, {
        title: `$(references)  ${refLabel}`,
        command: "grove.peekSnippetReferences",
        arguments: [undefined, block.name, block.line],
        tooltip: `View ${refLabel} to snippet "${block.name}"`,
      });
    });
  }

  invalidateDocument(uri: vscode.Uri): void {
    this._pendingResults.delete(uri.toString());
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
