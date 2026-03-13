# Phase 1: Dead Code & Cleanup

## Goal

Remove dead exports, empty directories, and stale debug logging. Zero behavioral change — only deletions and trivial edits.

## Prerequisites

- None. This is the first phase.

## Tasks

### 1.1 Remove empty `commands/` directory

Delete `packages/grove-core/src/commands/`. It is an empty directory with no files.

### 1.2 Remove `clearDiagnostics()` export

**File:** `packages/grove-core/src/diagnostics.ts`

Delete the `clearDiagnostics` function (and its JSDoc comment). It is exported but never imported or called anywhere in the codebase.

```ts
// DELETE this entire block at the bottom of the file:
/**
 * Clear all diagnostics.
 */
export function clearDiagnostics(): void {
  diagnosticCollection?.clear();
}
```

### 1.3 Remove `disposeLanguageStatus()` export

**File:** `packages/grove-core/src/language-status.ts`

Delete the `disposeLanguageStatus` function. It is exported but never called — not even in `deactivate()`. The language status item is already disposed via `context.subscriptions.push(languageStatusItem)` in `initLanguageStatus`.

```ts
// DELETE this entire block at the bottom of the file:
/**
 * Dispose of the language status item.
 */
export function disposeLanguageStatus(): void {
  languageStatusItem?.dispose();
  languageStatusItem = undefined;
}
```

### 1.4 Remove debug `console.log` from LiteralIncludeProviders

**File:** `packages/grove-core/src/rst/LiteralIncludeProviders.ts`

In the `provideCodeLenses` method of `LiteralIncludeCodeLensProvider`, delete the debug log statement:

```ts
// DELETE this line (inside the for-of loop, after computing directiveLine):
console.log(
  `[Grove Debug] Lens for "${ref.targetPath}" at line ${directiveLine} (0-indexed), editor line ${directiveLine + 1}`,
);
```

### 1.5 Remove `console.log` from test-runner-api

**File:** `packages/grove-core/src/test-runner-api.ts`

In the `registerTestRunner` function, delete the `console.log` call. This will be replaced by proper logging in Phase 3. For now, just remove it.

```ts
// In registerTestRunner(), DELETE these lines:
console.log(
  `Grove: Registered test runner "${runner.name}" for ${runner.language}`,
);
```

The function body should be just `registeredRunners.set(runner.language, runner);`.

## Validation

1. Run `pnpm build` from the repo root. It must succeed with no errors.
2. Run `pnpm test` from the repo root (or within each package). All existing tests must pass.
3. Verify `packages/grove-core/src/commands/` no longer exists.
4. Grep the codebase for `clearDiagnostics`, `disposeLanguageStatus`, `[Grove Debug]` — none should appear in source files (test files are fine if they reference these, but they shouldn't since nothing tests them).
