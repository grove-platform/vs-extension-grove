/**
 * Grove Diagnostic Code Actions
 *
 * Provides VS Code Quick Fix actions for `grove`-sourced diagnostics
 * (missing/broken symlinks today; future: missing .env, missing sample
 * data, etc.). Each action hands off to `/grove-setup` with a trigger
 * that identifies the specific remediation path.
 */

import * as vscode from "vscode";
import * as path from "path";
import { writeHandoff, type SetupFromDiagnosticContext } from "./handoff/writer";

/** Diagnostic codes that produce a Grove Setup Quick Fix. */
const SUPPORTED_CODES: ReadonlySet<SetupFromDiagnosticContext["issue"]> = new Set([
  "missing-symlink",
  "broken-symlink",
]);

function isSupportedIssue(
  code: string | number | { value: string | number } | undefined,
): code is SetupFromDiagnosticContext["issue"] {
  if (typeof code !== "string") return false;
  return SUPPORTED_CODES.has(code as SetupFromDiagnosticContext["issue"]);
}

/** Extract the symlink path from a diagnostic's message ("Missing symlink: <path>. ..."). */
function extractSymlinkPath(message: string): string | undefined {
  const m = message.match(/(?:Missing|Broken) symlink: ([^\s.]+)/);
  return m?.[1];
}

export class GroveCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "grove") continue;
      if (!isSupportedIssue(diagnostic.code)) continue;

      const action = new vscode.CodeAction(
        `✨ Set up Grove`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      action.command = {
        title: "Set up Grove",
        command: "grove.setupFromDiagnostic",
        arguments: [
          document.uri,
          diagnostic.code as SetupFromDiagnosticContext["issue"],
          diagnostic.message,
          extractSymlinkPath(diagnostic.message),
        ],
      };
      actions.push(action);
    }

    return actions;
  }
}

/**
 * Register the CodeActionProvider and the underlying setup-handoff command.
 * Call this once during extension activation.
 */
export function registerGroveCodeActions(
  context: vscode.ExtensionContext,
): void {
  const selector: vscode.DocumentSelector = { pattern: "**/snip.js" };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      selector,
      new GroveCodeActionProvider(),
      {
        providedCodeActionKinds: GroveCodeActionProvider.providedCodeActionKinds,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grove.setupFromDiagnostic",
      async (
        snipUri: vscode.Uri,
        issue: SetupFromDiagnosticContext["issue"],
        message: string,
        symlinkPath: string | undefined,
      ) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder is open.");
          return;
        }

        const snipJsRel = path.relative(
          workspaceFolder.uri.fsPath,
          snipUri.fsPath,
        );
        const projectRoot = path.dirname(snipJsRel);

        const setupContext: SetupFromDiagnosticContext = {
          issue,
          message,
          snipJsPath: snipJsRel,
          projectRoot,
          symlinkPath,
        };

        try {
          const handoffUri = await writeHandoff(
            "grove-setup",
            "diagnostic-symlink",
            setupContext,
          );
          if (!handoffUri) return;

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
              await vscode.commands.executeCommand(
                "claude-vscode.sidebar.open",
              );
            } catch {
              // Claude Code extension not available — skip focus.
            }
          }

          vscode.window.showInformationMessage(
            primaryEditorOpened
              ? `Grove handoff ready. Press Enter in Claude Code to resolve: ${issue}.`
              : `Grove handoff ready. Type /grove-setup in Claude Code to resolve: ${issue}.`,
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to write Grove handoff: ${err}`,
          );
        }
      },
    ),
  );
}