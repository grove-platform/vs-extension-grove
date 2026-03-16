/**
 * Feedback Panel
 *
 * Webview panel provider for the feedback form.
 * Handles user input and communication between the webview and extension.
 */

import * as vscode from "vscode";
import type { FeedbackSubmission, FeedbackWebviewMessage, DiagnosticInfo } from "./types";
import { collectDiagnostics } from "./diagnostics-collector";
import { submitFeedback } from "./feedback-submitter";
import { getWebviewHtml } from "./webview-html";

/**
 * Feedback panel webview provider.
 * Implements a singleton pattern to ensure only one panel is open at a time.
 */
export class FeedbackPanel {
  /** The currently active feedback panel, or undefined if none is open. */
  public static currentPanel: FeedbackPanel | undefined;

  /** The webview panel instance. */
  private readonly _panel: vscode.WebviewPanel;

  /** Disposables for cleanup. */
  private _disposables: vscode.Disposable[] = [];

  /** Cached diagnostics. */
  private _diagnostics: DiagnosticInfo | undefined;

  /**
   * Private constructor - use createOrShow to instantiate.
   */
  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
    this._panel = panel;

    // Set initial HTML content
    this._panel.webview.html = getWebviewHtml();

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message: FeedbackWebviewMessage) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables,
    );

    // Clean up when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  /**
   * Create a new feedback panel or show the existing one.
   * @param extensionUri - The URI of the extension directory.
   */
  public static createOrShow(extensionUri: vscode.Uri): void {
    // If panel already exists, reveal it
    if (FeedbackPanel.currentPanel) {
      FeedbackPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      "groveFeedback",
      "Send Feedback",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    FeedbackPanel.currentPanel = new FeedbackPanel(panel, extensionUri);
  }

  /**
   * Handle messages received from the webview.
   */
  private async _handleMessage(message: FeedbackWebviewMessage): Promise<void> {
    switch (message.command) {
      case "submit":
        if (message.data) {
          await this._handleSubmit(message.data);
        }
        break;
      case "getDiagnostics":
        await this._sendDiagnostics();
        break;
      case "cancel":
        this._panel.dispose();
        break;
    }
  }

  /**
   * Handle form submission.
   */
  private async _handleSubmit(data: FeedbackSubmission): Promise<void> {
    // Validate required fields
    if (!data.title?.trim() || !data.description?.trim()) {
      vscode.window.showErrorMessage("Title and description are required");
      return;
    }

    // Attach diagnostics if requested
    if (data.includeDiagnostics) {
      data.diagnostics = this._diagnostics ?? (await collectDiagnostics());
    }

    // Submit feedback (opens browser)
    await submitFeedback(data);

    // Close the panel after successful submission
    this._panel.dispose();
  }

  /**
   * Collect and send diagnostics to the webview.
   */
  private async _sendDiagnostics(): Promise<void> {
    this._diagnostics = await collectDiagnostics();
    await this._panel.webview.postMessage({
      command: "diagnostics",
      data: this._diagnostics,
    });
  }

  /**
   * Dispose of the panel and clean up resources.
   */
  public dispose(): void {
    FeedbackPanel.currentPanel = undefined;

    // Dispose the panel
    this._panel.dispose();

    // Dispose all subscriptions
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

