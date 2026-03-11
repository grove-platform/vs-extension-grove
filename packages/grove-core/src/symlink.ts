/**
 * Grove Symlink Management
 *
 * Provides symlink detection and creation for Grove documentation projects.
 * Docs projects need a symlink from source/code-examples/tested to the
 * code-example-tests output directory.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { validateWorkspacePath } from "@grove/shared";

export interface SymlinkStatus {
  exists: boolean;
  isValid: boolean;
  path: string;
  target?: string;
  error?: string;
}

/**
 * Check if a symlink exists and is valid.
 */
export async function checkSymlinkStatus(
  symlinkPath: string,
): Promise<SymlinkStatus> {
  try {
    const stats = await fs.lstat(symlinkPath);

    if (!stats.isSymbolicLink()) {
      return {
        exists: true,
        isValid: false,
        path: symlinkPath,
        error: "Path exists but is not a symlink",
      };
    }

    // Read the symlink target
    const target = await fs.readlink(symlinkPath);

    // Check if target exists
    try {
      await fs.access(symlinkPath);
      return {
        exists: true,
        isValid: true,
        path: symlinkPath,
        target,
      };
    } catch {
      return {
        exists: true,
        isValid: false,
        path: symlinkPath,
        target,
        error: "Symlink target does not exist",
      };
    }
  } catch {
    return {
      exists: false,
      isValid: false,
      path: symlinkPath,
    };
  }
}

/**
 * Create a symlink for a docs project.
 * Validates paths and creates necessary parent directories.
 */
export async function createSymlink(
  symlinkPath: string,
  targetPath: string,
  workspacePath: string,
): Promise<void> {
  // Validate both paths are within workspace
  if (!validateWorkspacePath(symlinkPath, workspacePath)) {
    throw new Error("Symlink path must be within the workspace");
  }

  if (!validateWorkspacePath(targetPath, workspacePath)) {
    throw new Error("Target path must be within the workspace");
  }

  // Verify target exists
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  // Create parent directories if needed
  const symlinkDir = path.dirname(symlinkPath);
  await fs.mkdir(symlinkDir, { recursive: true });

  // Create the symlink (relative path for portability)
  const relativeTarget = path.relative(symlinkDir, targetPath);
  await fs.symlink(relativeTarget, symlinkPath);
}

/**
 * Register the symlink creation command.
 */
export function registerSymlinkCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.createSymlink", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;

      // Ask for the symlink path
      const symlinkRelPath = await vscode.window.showInputBox({
        title: "Grove: Create Symlink",
        prompt: "Enter the relative path for the symlink",
        value: "source/code-examples/tested",
        validateInput: (value) => {
          if (!value) return "Path is required";
          if (path.isAbsolute(value)) return "Path must be relative";
          return undefined;
        },
      });

      if (!symlinkRelPath) {
        return; // User cancelled
      }

      // Ask for the target path
      const targetRelPath = await vscode.window.showInputBox({
        title: "Grove: Create Symlink",
        prompt: "Enter the relative path to the target directory",
        value: "../code-example-tests/content/code-examples/tested",
        validateInput: (value) => {
          if (!value) return "Path is required";
          return undefined;
        },
      });

      if (!targetRelPath) {
        return; // User cancelled
      }

      const symlinkPath = path.join(workspacePath, symlinkRelPath);
      const targetPath = path.resolve(path.dirname(symlinkPath), targetRelPath);

      try {
        await createSymlink(symlinkPath, targetPath, workspacePath);
        vscode.window.showInformationMessage(
          `Created symlink: ${symlinkRelPath} → ${targetRelPath}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create symlink: ${message}`);
      }
    }),
  );
}

