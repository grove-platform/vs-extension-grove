/**
 * Grove Bluehawk Preview Provider
 *
 * WebviewViewProvider that shows a live preview of Bluehawk snippet output.
 * Updates automatically on file save and provides syntax highlighting.
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  runBluehawkDryRun,
  containsBluehawkDirectives,
  BluehawkResult,
} from "./bluehawk-runner";
import { profile } from "@grove/shared";

export class BluehawkPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grove.bluehawkPreview";

  private _view?: vscode.WebviewView;
  private _currentDocument?: vscode.TextDocument;
  private _updateTimeout?: NodeJS.Timeout;
  private readonly _debounceMs = 500;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "refresh" && this._currentDocument) {
        await this.updatePreview(this._currentDocument);
      }
    });

    // Update when visibility changes
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._currentDocument) {
        this.updatePreview(this._currentDocument);
      }
    });
  }

  /**
   * Update preview for the given document.
   */
  public async updatePreview(document: vscode.TextDocument): Promise<void> {
    if (!this._view) {
      return;
    }

    this._currentDocument = document;

    // Check if file contains Bluehawk directives
    const content = document.getText();
    if (!containsBluehawkDirectives(content)) {
      this._view.webview.postMessage({
        command: "noDirectives",
        fileName: path.basename(document.uri.fsPath),
      });
      return;
    }

    // Show loading state
    this._view.webview.postMessage({
      command: "loading",
      fileName: path.basename(document.uri.fsPath),
    });

    // Run bluehawk
    const result = await profile("Bluehawk.dryRun", () =>
      runBluehawkDryRun(document.uri.fsPath),
    );

    // Send result to webview
    this._view.webview.postMessage({
      command: "preview",
      result,
      fileName: path.basename(document.uri.fsPath),
    });
  }

  /**
   * Update preview with debouncing (for active editing).
   */
  public debouncedUpdate(document: vscode.TextDocument): void {
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
    }

    this._updateTimeout = setTimeout(() => {
      this.updatePreview(document);
    }, this._debounceMs);
  }

  /**
   * Clear the preview pane.
   */
  public clear(): void {
    this._currentDocument = undefined;
    if (this._view) {
      this._view.webview.postMessage({ command: "clear" });
    }
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Bluehawk Preview</title>
  <style>
    body {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-foreground);
      padding: 0;
      margin: 0;
    }
    .header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .file-name {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .snippet {
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 8px;
    }
    .snippet-header {
      padding: 8px 12px;
      background: var(--vscode-editor-lineHighlightBackground);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .snippet-name {
      font-weight: bold;
    }
    .snippet-content {
      padding: 12px;
      background: var(--vscode-editor-background);
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      user-select: none;
      -webkit-user-select: none;
      cursor: default;
    }
    .loading, .empty, .error {
      padding: 20px;
      text-align: center;
    }
    .error {
      color: var(--vscode-errorForeground);
    }
    .removed {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .refresh-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="content">
    <div class="empty">Open a file with Bluehawk directives to see preview</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', event => {
      const message = event.data;
      const content = document.getElementById('content');

      switch (message.command) {
        case 'loading':
          content.innerHTML = '<div class="loading">Loading preview for ' + escapeHtml(message.fileName) + '...</div>';
          break;

        case 'noDirectives':
          content.innerHTML = '<div class="empty">' + escapeHtml(message.fileName) + ' does not contain Bluehawk directives</div>';
          break;

        case 'clear':
          content.innerHTML = '<div class="empty">No file selected</div>';
          break;

        case 'preview':
          renderPreview(message.result, message.fileName);
          break;
      }
    });

    function renderPreview(result, fileName) {
      const content = document.getElementById('content');

      if (!result.success) {
        content.innerHTML = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div><div class="error">' + escapeHtml(result.error) + '</div>';
        return;
      }

      if (result.snippets.length === 0) {
        content.innerHTML = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div><div class="empty">No snippets extracted</div>';
        return;
      }

      let html = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div>';

      for (let i = 0; i < result.snippets.length; i++) {
        const snippet = result.snippets[i];
        const escapedContent = escapeHtml(snippet.content);
        html += '<div class="snippet">';
        html += '<div class="snippet-header"><span class="snippet-name">' + escapeHtml(snippet.name) + '</span></div>';
        html += '<div class="snippet-content">' + escapedContent + '</div>';
        html += '</div>';
      }

      content.innerHTML = html;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }
}
