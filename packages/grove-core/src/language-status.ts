/**
 * Grove Language Status Item
 *
 * Shows per-file Grove status in the VS Code editor.
 * The status item appears in the editor's language status area
 * and shows which Grove project the current file belongs to.
 */

import * as vscode from "vscode";
import { findProjectForFile } from "@grove/shared";
import type { GroveProject } from "@grove/shared";

let languageStatusItem: vscode.LanguageStatusItem | undefined;

/**
 * Initialize the language status item.
 * Call this from extension activation.
 */
export function initLanguageStatus(
  context: vscode.ExtensionContext,
): vscode.LanguageStatusItem {
  languageStatusItem = vscode.languages.createLanguageStatusItem(
    "grove.status",
    { pattern: "**/*" }, // Apply to all files
  );

  languageStatusItem.name = "Grove Project";
  languageStatusItem.text = "$(tree) Grove";
  languageStatusItem.detail = "No Grove project";
  languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;

  // Add a command to open the Grove panel
  languageStatusItem.command = {
    title: "Open Grove Panel",
    command: "workbench.view.extension.grove",
  };

  context.subscriptions.push(languageStatusItem);

  return languageStatusItem;
}

/**
 * Update the language status based on the current active editor.
 */
export function updateLanguageStatus(
  projects: GroveProject[],
  activeFile: string | undefined,
): void {
  if (!languageStatusItem) {
    return;
  }

  if (!activeFile || projects.length === 0) {
    languageStatusItem.text = "$(tree) Grove";
    languageStatusItem.detail = "No Grove project";
    languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;
    return;
  }

  const project = findProjectForFile(activeFile, projects);

  if (project) {
    const langIcon = getLanguageIcon(project.language);
    const langName = project.language ?? "unknown";

    languageStatusItem.text = `${langIcon} ${project.relativePath || "root"}`;
    languageStatusItem.detail = `Grove project (${langName})`;
    languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;
  } else {
    languageStatusItem.text = "$(tree) Grove";
    languageStatusItem.detail = "Not in a Grove project";
    languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;
  }
}

/**
 * Get an icon for the language.
 */
function getLanguageIcon(language: string | null): string {
  switch (language) {
    case "nodejs":
      return "$(symbol-method)"; // JS-like icon
    case "python":
      return "$(symbol-namespace)"; // Python-like icon
    case "go":
      return "$(symbol-interface)"; // Go-like icon
    case "java":
      return "$(symbol-class)"; // Java-like icon
    case "csharp":
      return "$(symbol-struct)"; // C#-like icon
    case "mongosh":
      return "$(terminal)"; // Shell icon
    default:
      return "$(tree)";
  }
}

/**
 * Register event handlers for updating the language status.
 * Call this from extension activation.
 */
export function registerLanguageStatusHandlers(
  context: vscode.ExtensionContext,
  getProjects: () => GroveProject[],
): void {
  // Update on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateLanguageStatus(getProjects(), editor?.document.uri.fsPath);
    }),
  );

  // Initial update
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(getProjects(), activeEditor.document.uri.fsPath);
  }
}
