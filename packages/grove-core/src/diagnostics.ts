/**
 * Grove Diagnostics
 *
 * Provides inline diagnostics for Grove-related issues:
 * - Missing symlinks in docs projects
 * - Invalid Bluehawk markup (future)
 * - Broken literalinclude references (future)
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import type { GroveProject } from "@grove/shared";

let diagnosticCollection: vscode.DiagnosticCollection;

/**
 * Initialize the diagnostic collection.
 * Call this from extension activation.
 */
export function initDiagnostics(
  context: vscode.ExtensionContext,
): vscode.DiagnosticCollection {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("grove");
  context.subscriptions.push(diagnosticCollection);
  return diagnosticCollection;
}

/**
 * Check for missing symlinks in a Grove project.
 * Docs projects should have a symlink at source/code-examples/tested
 * pointing to the code-example-tests output.
 */
export async function checkSymlinks(
  project: GroveProject,
  workspacePath: string,
): Promise<vscode.Diagnostic[]> {
  const diagnostics: vscode.Diagnostic[] = [];

  // Common symlink locations to check
  const symlinkPaths = [
    "source/code-examples/tested",
    "content/code-examples/tested",
  ];

  for (const symlinkRelPath of symlinkPaths) {
    const symlinkPath = path.join(workspacePath, symlinkRelPath);

    try {
      const stats = await fs.lstat(symlinkPath);

      if (stats.isSymbolicLink()) {
        // Verify the symlink target exists
        try {
          await fs.access(symlinkPath);
        } catch {
          // Broken symlink
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 0),
              `Broken symlink: ${symlinkRelPath} points to a non-existent target`,
              vscode.DiagnosticSeverity.Error,
            ),
          );
        }
      }
    } catch {
      // Path doesn't exist - this is not necessarily an error
      // Only report if this looks like a docs project
      const isDocsProject = await looksLikeDocsProject(workspacePath);
      if (isDocsProject) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `Missing symlink: ${symlinkRelPath}. Run "Grove: Create Symlink" to create it.`,
            vscode.DiagnosticSeverity.Warning,
          ),
        );
      }
    }
  }

  return diagnostics;
}

/**
 * Check if a workspace looks like a MongoDB docs project.
 * Exported for testing.
 */
export async function looksLikeDocsProject(
  workspacePath: string,
): Promise<boolean> {
  const docIndicators = ["snooty.toml", "source/conf.py", "source/index.txt"];

  for (const indicator of docIndicators) {
    try {
      await fs.access(path.join(workspacePath, indicator));
      return true;
    } catch {
      // File doesn't exist
    }
  }

  return false;
}

/**
 * Refresh diagnostics for a project.
 */
export async function refreshDiagnostics(
  project: GroveProject,
  workspacePath: string,
): Promise<void> {
  if (!diagnosticCollection) {
    return;
  }

  // Clear existing diagnostics for this project
  const snipUri = vscode.Uri.file(path.join(project.rootPath, "snip.js"));
  diagnosticCollection.delete(snipUri);

  // Check for issues
  const symlinkDiagnostics = await checkSymlinks(project, workspacePath);

  // Set diagnostics on the snip.js file
  if (symlinkDiagnostics.length > 0) {
    diagnosticCollection.set(snipUri, symlinkDiagnostics);
  }
}

/**
 * Refresh diagnostics for all projects.
 */
export async function refreshAllDiagnostics(
  projects: GroveProject[],
  workspacePath: string,
): Promise<void> {
  diagnosticCollection?.clear();

  for (const project of projects) {
    await refreshDiagnostics(project, workspacePath);
  }
}
