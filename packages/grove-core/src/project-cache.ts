/**
 * Project Detection Cache Module
 *
 * Caches the result of detectGroveProjects() and invalidates
 * when snip.js files are created or deleted.
 */

import * as vscode from "vscode";
import { detectGroveProjects, profile } from "@grove/shared";
import type { GroveProject } from "@grove/shared";
import { getLogChannel, isLoggerInitialized } from "./logger";

let cachedProjects: GroveProject[] | undefined;
let watcher: vscode.FileSystemWatcher | undefined;
let workspaceRoot: string | undefined;

/**
 * Initialize the project cache and set up file-system invalidation.
 * Call once during activation, after `initLogger()`.
 */
export function initProjectCache(
  context: vscode.ExtensionContext,
  wsRoot: string,
): void {
  workspaceRoot = wsRoot;

  // Watch for snip.js create/delete/rename
  watcher = vscode.workspace.createFileSystemWatcher("**/snip.js");
  watcher.onDidCreate(() => invalidate());
  watcher.onDidDelete(() => invalidate());
  context.subscriptions.push(watcher);
}

/**
 * Get detected projects, using a cached result when available.
 * The cache is invalidated automatically when any snip.js file is
 * created or deleted.
 */
export async function getCachedProjects(): Promise<GroveProject[]> {
  if (cachedProjects) {
    return cachedProjects;
  }

  if (!workspaceRoot) {
    return [];
  }

  cachedProjects = await profile("ProjectCache.detectProjects", () =>
    detectGroveProjects(workspaceRoot!),
  );
  if (isLoggerInitialized()) {
    getLogChannel().info(
      `Project cache populated: ${cachedProjects.length} project(s)`,
    );
  }
  return cachedProjects;
}

/**
 * Force-invalidate the cache (e.g., on snip.js change or manual refresh).
 */
export function invalidate(): void {
  cachedProjects = undefined;
  if (isLoggerInitialized()) {
    getLogChannel().debug("Project cache invalidated");
  }
}
