# Phase 6: Lazy / Deferred Activation

## Goal

Reduce `activate()` wall-clock time by deferring expensive work that is not needed until the user actually interacts with a feature. The MongoDB driver, RST `literalinclude` resolution, and Bluehawk preview spawning are the primary targets.

## Prerequisites

- Phases 1–5 complete (logger, project cache, and test-execution consolidation are in place).

## Context

During activation (`extension.ts` `activate()`), the extension currently performs these operations synchronously/sequentially:

1. Creates output channels (fast — already addressed in Phase 3)
2. Registers the Grove panel webview (fast)
3. Detects projects — walks the file tree (addressed in Phase 5 via caching)
4. Initializes diagnostics (fast)
5. Refreshes diagnostics — **reads and parses RST files** for all projects (slow if many files)
6. Initializes language status (fast)
7. Registers symlink command (fast)
8. **Constructs `MongoConnectionManager`** (fast) and calls `reconnect()` (network I/O)
9. Registers `registerLiteralIncludeProviders` — sets up DefinitionProvider, DocumentLinkProvider, CodeLens (medium)
10. Registers test CodeLens (medium)
11. Registers snippet CodeLens (medium)
12. Registers Bluehawk preview provider and commands (fast)

The `MongoConnectionManager.reconnect()` is already fire-and-forget (uses `.then()`), which is good. The main bottleneck is step 5 (refreshing diagnostics for every detected project on startup).

## Tasks

### 6.1 Defer initial diagnostics refresh

**File:** `packages/grove-core/src/extension.ts`

Currently, during activation:

```ts
// Refresh diagnostics for all detected projects
if (workspaceFolders && status.projects.length > 0) {
  await refreshAllDiagnostics(status.projects, workspaceFolders[0].uri.fsPath);
}
```

This `await` blocks the activation function. Change it to fire-and-forget:

```ts
// Refresh diagnostics asynchronously — don't block activation
if (workspaceFolders && status.projects.length > 0) {
  refreshAllDiagnostics(status.projects, workspaceFolders[0].uri.fsPath).catch(
    (err) => {
      outputChannel.error("Failed to refresh diagnostics on startup", err);
    },
  );
}
```

### 6.2 Defer CodeLens provider registration

Test CodeLens, snippet CodeLens, and literalinclude providers register `DocumentSelector`-based providers that VS Code eagerly invokes when matching files are open. The registration itself is cheap, but the logic they trigger on first resolve is not.

This step is **optional** — only pursue if activation time is measurably slow. The registrations themselves are inexpensive (just `vscode.languages.registerCodeLensProvider` calls). The actual computation happens lazily when VS Code requests lenses. No change is needed unless profiling confirms otherwise.

If profiling does show these are slow, consider wrapping them in a `setTimeout(() => { ... }, 0)` to yield back to the event loop and let VS Code finish activation before processing:

```ts
// Let activation complete before registering heavy providers
setTimeout(() => {
  registerLiteralIncludeProviders(context);
  registerTestCodeLens(context);
  registerSnippetCodeLens(context);
  outputChannel.info("Registered CodeLens and literalinclude providers");
}, 0);
```

**Trade-off:** CodeLens won't appear until the next editor event after the timeout fires — an imperceptible delay in practice.

### 6.3 Verify MongoDB lazy loading is already in place

**File:** `packages/grove-core/src/mongo/connection.ts`

The `MongoConnectionManager` already lazy-loads the `mongodb` package via dynamic `import()` inside its `connect()` method (not at module scope). Verify this by checking:

1. The top-level imports do NOT include `import { MongoClient } from "mongodb"`.
2. The `mongodb` driver is loaded only inside a method body via `const { MongoClient } = await import("mongodb")` or equivalent.

If this is already the case, no change needed. Document it as confirmed.

### 6.4 Ensure deactivate() cleans up

**File:** `packages/grove-core/src/extension.ts`

The current `deactivate()` function is empty:

```ts
export function deactivate() {
  // Extension cleanup (if needed in the future)
}
```

With the project cache watcher (Phase 5) and the logger channels (Phase 3), cleanup is handled via `context.subscriptions`. Verify that all disposables created in `activate()` are pushed to `context.subscriptions`. If they are, `deactivate()` can stay empty — VS Code disposes subscriptions automatically.

Check these specifically:

- `watcher` in `project-cache.ts` → pushed to `context.subscriptions` in `initProjectCache()` ✓ (Phase 5)
- `_logChannel` and `_testChannel` in `logger.ts` → pushed in `initLogger()` ✓ (Phase 3)
- `MongoConnectionManager` → does it have a `dispose()` or `close()` method? If so, wrap and push:
  ```ts
  context.subscriptions.push({ dispose: () => mongoConnectionManager.close() });
  ```

## Validation

1. `pnpm build` must succeed.
2. `pnpm test` must pass.
3. Open the extension in the Extension Development Host. Open the "Output" panel, select "Grove". Verify activation completes quickly and diagnostics populate shortly after.
4. Verify MongoDB features still work by running the `grove.connectMongo` command.
5. Verify test CodeLens appears when opening a test file.
6. Verify `literalinclude` definition navigation works in RST files.
