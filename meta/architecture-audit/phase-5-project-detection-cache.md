# Phase 5: Project Detection Cache

## Goal

Stop calling `detectGroveProjects()` on every test run and status refresh. Cache the result at activation, expose a getter, and invalidate with a `FileSystemWatcher` on `**/snip.js`.

## Prerequisites

- Phase 4 complete (`resolveProject()` exists in `test-execution.ts` and calls `detectGroveProjects` — this phase will redirect it to the cache).

## Context

`detectGroveProjects()` walks the file tree (up to 5 levels) looking for `snip.js` files, reads and parses each one, and detects languages by reading `package.json`, `pom.xml`, etc. It is synchronous-looking but fully async I/O bound. It is called from:

| Call site                               | File                            | Line(s) |
| --------------------------------------- | ------------------------------- | ------- |
| `activate → detectProjectsWithProgress` | `extension.ts`                  | ~118    |
| `getStatus()`                           | `extension.ts`                  | ~93     |
| `grove.runTests` command                | `extension.ts`                  | ~288    |
| `runTestBlock`                          | `test-codelens/index.ts`        | ~106    |
| `test-runner.ts` (grove-nodejs)         | `grove-nodejs/src/extension.ts` | ~40     |

After Phase 4, the `grove.runTests` and `runTestBlock` sites will both go through `resolveProject()` in `test-execution.ts`, which also calls `detectGroveProjects`. The goal is to funnel all of these through a single cached accessor.

## Tasks

### 5.1 Create a project-cache module

**Create** `packages/grove-core/src/project-cache.ts`:

```ts
import * as vscode from "vscode";
import { detectGroveProjects } from "@grove/shared";
import type { GroveProject } from "@grove/shared";
import { getLogChannel } from "./logger";

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

  cachedProjects = await detectGroveProjects(workspaceRoot);
  getLogChannel().info(
    `Project cache populated: ${cachedProjects.length} project(s)`,
  );
  return cachedProjects;
}

/**
 * Force-invalidate the cache (e.g., on snip.js change or manual refresh).
 */
export function invalidate(): void {
  cachedProjects = undefined;
  getLogChannel().debug("Project cache invalidated");
}
```

### 5.2 Wire up during activation

**File:** `packages/grove-core/src/extension.ts`

1. Add import:

   ```ts
   import {
     initProjectCache,
     getCachedProjects,
     invalidate as invalidateProjectCache,
   } from "./project-cache";
   ```

2. In `activate()`, after `initLogger(context)`, add:

   ```ts
   const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;
   if (workspaceRoot) {
     initProjectCache(context, workspaceRoot);
   }
   ```

3. Replace the body of `detectProjectsWithProgress()` to use the cache:

   ```ts
   async function detectProjectsWithProgress(
     workspacePath: string,
   ): Promise<GroveProject[]> {
     return vscode.window.withProgress(
       {
         location: vscode.ProgressLocation.Window,
         title: "Grove: Detecting projects...",
       },
       async (progress) => {
         progress.report({ increment: 0 });
         const projects = await getCachedProjects();
         progress.report({ increment: 100 });
         return projects;
       },
     );
   }
   ```

4. In `getStatus()`, replace:

   ```ts
   const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);
   ```

   with:

   ```ts
   const projects = await getCachedProjects();
   ```

5. In the `grove.refreshPanel` command, add `invalidateProjectCache()` before `panelProvider.refresh()` so a manual refresh forces re-detection.

6. Remove the direct import of `detectGroveProjects` from `@grove/shared` if no other usage remains in this file. (The import of `findProjectForFile` may still be needed depending on Phase 4 outcome.)

### 5.3 Update test-execution.ts to use the cache

**File:** `packages/grove-core/src/test-execution.ts` (created in Phase 4)

Replace:

```ts
import { detectGroveProjects, findProjectForFile } from "@grove/shared";
```

with:

```ts
import { findProjectForFile } from "@grove/shared";
import { getCachedProjects } from "./project-cache";
```

And in `resolveProject()`, replace:

```ts
const projects = await detectGroveProjects(workspaceRoot);
```

with:

```ts
const projects = await getCachedProjects();
```

### 5.4 Remove detectGroveProjects from grove-core imports

After all refactoring, grep for `detectGroveProjects` in `packages/grove-core/src/`. It should only appear in `project-cache.ts`. All other files should go through `getCachedProjects()`.

The `@grove/shared` package still exports `detectGroveProjects` for external consumers like `grove-nodejs`. Do NOT remove it from the shared package.

## Validation

1. `pnpm build` must succeed.
2. `pnpm test` must pass.
3. Grep for `detectGroveProjects` in `packages/grove-core/src/` (excluding `project-cache.ts`) — should return zero results.
4. Grep for `getCachedProjects` — should appear in `project-cache.ts` (definition), `extension.ts`, and `test-execution.ts`.
