# Phase 2: Extract Shared Utilities

## Goal

Eliminate duplicated helper functions by extracting them into shared modules. Two specific duplications are addressed: `formatTimeAgo()` and the workspace-boundary check in `path-resolver.ts`.

## Prerequisites

- Phase 1 complete (dead code removed).

## Tasks

### 2.1 Extract `formatTimeAgo` and `truncate` into a test-codelens utility module

**Problem:** `formatTimeAgo()` is defined identically in both:

- `packages/grove-core/src/test-codelens/TestHoverProvider.ts` (lines 100–109)
- `packages/grove-core/src/test-codelens/TestDecorations.ts` (lines 155–164)

`truncate()` is only in `TestHoverProvider.ts` but logically belongs with shared formatting helpers.

**Action:**

1. **Create** `packages/grove-core/src/test-codelens/utils.ts` with these contents:

```ts
/**
 * Format a timestamp as a relative time string.
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return "1 hour ago";
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}
```

2. **Edit** `packages/grove-core/src/test-codelens/TestHoverProvider.ts`:
   - Add `import { formatTimeAgo, truncate } from "./utils";` to the imports.
   - Delete the local `formatTimeAgo` function (lines 97–109).
   - Delete the local `truncate` function (lines 114–118).

3. **Edit** `packages/grove-core/src/test-codelens/TestDecorations.ts`:
   - Add `import { formatTimeAgo } from "./utils";` to the imports.
   - Delete the local `formatTimeAgo` function (lines 145–157).

### 2.2 Use `@grove/shared` for path boundary check in path-resolver

**Problem:** `packages/grove-core/src/rst/path-resolver.ts` re-implements the same `path.normalize` + `startsWith` boundary check that `isPathWithinBoundary()` in `@grove/shared` provides.

**Current code in `checkPathExists`** (path-resolver.ts):

```ts
function checkPathExists(
  absolutePath: string,
  workspaceRoot?: string,
): ResolvedPath {
  // Security: Ensure path is within workspace
  if (workspaceRoot) {
    const normalizedPath = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(workspaceRoot);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return {
        absolutePath,
        exists: false,
        error: "Path is outside workspace boundaries",
      };
    }
  }

  const exists = fs.existsSync(absolutePath);
  return {
    absolutePath,
    exists,
    error: exists ? undefined : `File not found: ${absolutePath}`,
  };
}
```

**Action:**

1. Add this import to the top of `packages/grove-core/src/rst/path-resolver.ts`:

   ```ts
   import { isPathWithinBoundary } from "@grove/shared";
   ```

2. Replace the inline boundary check in `checkPathExists` with a call to `isPathWithinBoundary`:

   ```ts
   function checkPathExists(
     absolutePath: string,
     workspaceRoot?: string,
   ): ResolvedPath {
     if (workspaceRoot && !isPathWithinBoundary(absolutePath, workspaceRoot)) {
       return {
         absolutePath,
         exists: false,
         error: "Path is outside workspace boundaries",
       };
     }

     const exists = fs.existsSync(absolutePath);
     return {
       absolutePath,
       exists,
       error: exists ? undefined : `File not found: ${absolutePath}`,
     };
   }
   ```

This also removes `isPathWithinBoundary` from the "dead code" category — it now has a real consumer.

## Validation

1. Run `pnpm build` from the repo root. Must succeed.
2. Run `pnpm test` from the repo root. All tests must pass.
3. Grep for `function formatTimeAgo` in `packages/grove-core/src/` — should appear only in `test-codelens/utils.ts`.
4. Grep for `normalizedPath.startsWith(normalizedRoot)` in `packages/grove-core/src/rst/path-resolver.ts` — should no longer appear.
