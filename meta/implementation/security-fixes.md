# Security Fixes

**Goal**: Address the security issues identified in the pre-marketplace audit. All five items are
hardening changes with no user-visible behavior changes.

**Validates**: Extension is safe to distribute via the VS Code Marketplace to a broader audience.

**Depends on**: None — these are self-contained fixes.

---

## Background

A security audit (March 2026) identified the following issues in priority order:

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | Bluehawk command injection via `exec` string interpolation | Medium | `grove-core/src/preview/bluehawk-runner.ts` |
| 2 | Test runner `shell: true` enables shell injection | Medium | `grove-nodejs/src/test-runner.ts` |
| 3 | Panel XSS via `innerHTML` with unsanitized data | Medium | `grove-core/src/panel/GrovePanel.ts` |
| 4 | Webviews use `script-src 'unsafe-inline'` CSP | Low | `GrovePanel.ts`, `feedback/webview-html.ts` |
| 5 | Ripgrep pattern passed without `--fixed-strings` | Low | `grove-core/src/snippet-codelens/ripgrep-searcher.ts` |

---

## Task 1: Fix Bluehawk Command Injection

**File**: `packages/grove-core/src/preview/bluehawk-runner.ts`

**Problem**: The current code builds a shell command string by interpolating `bluehawk` (from the
user-configurable `grove.bluehawkPath` setting) and `filePath` (the active editor path) into a
backtick template, then passes it to `exec`. A malicious `.vscode/settings.json` committed in a
repo could set `grove.bluehawkPath` to an arbitrary command.

```ts
// BEFORE — vulnerable
await execAsync(`${bluehawk} snip -o "${tempDir}" "${filePath}"`, { ... });
```

**Fix**: Split `getBluehawkCommand()` into separate binary + args, then use `execFile` (or `spawn`)
with an array of arguments. `execFile` never invokes a shell, so metacharacters in any argument are
treated as literals.

### 1.1 Update `getBluehawkCommand` return type

Change the function to return `{ bin: string; baseArgs: string[] }` so callers receive a binary
path and any pre-configured arguments separately from the file-specific arguments.

```ts
// AFTER
function getBluehawkCommand(): { bin: string; baseArgs: string[] } {
  const config = vscode.workspace.getConfiguration("grove");
  const customPath = config.get<string>("bluehawkPath", "").trim();
  if (customPath.length > 0) {
    return { bin: customPath, baseArgs: [] };
  }
  // Default: run bluehawk via npx
  return { bin: "npx", baseArgs: ["bluehawk"] };
}
```

### 1.2 Replace `execAsync` with `execFileAsync`

```ts
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

// In runBluehawkDryRun:
const { bin, baseArgs } = getBluehawkCommand();
await execFileAsync(bin, [...baseArgs, "snip", "-o", tempDir, filePath], {
  cwd: workingDir,
  timeout: 30000,
});
```

### 1.3 Update ENOENT error check

The "not found" error message may differ between `exec` and `execFile`. Verify the error check
still matches and update the string if needed.

### 1.4 Tests

- Existing tests should continue to pass.
- Add a test case: a `bluehawkPath` containing spaces (e.g., `/usr/local/my bluehawk/bin`) is
  passed as a single argument, not split by the shell.

---

## Task 2: Remove `shell: true` from Test Runner

**File**: `packages/grove-nodejs/src/test-runner.ts`

**Problem**: `spawn("npm", args, { shell: true })` hands the args array back to the shell as a
concatenated string. If `testFile` contained shell metacharacters they would be interpreted.

```ts
// BEFORE — vulnerable
const proc = spawn("npm", args, {
  cwd: projectPath,
  env: { ...process.env, CI: "true", ...env },
  shell: true,
});
```

**Fix**: Remove `shell: true`. On macOS and Linux, `spawn("npm", args)` resolves `npm` on `PATH`
directly. For Windows compatibility, resolve the binary name explicitly.

### 2.1 Remove `shell: true` and handle Windows

```ts
// AFTER
const isWindows = process.platform === "win32";
const npmBin = isWindows ? "npm.cmd" : "npm";

const proc = spawn(npmBin, args, {
  cwd: projectPath,
  env: { ...process.env, CI: "true", ...env },
  // shell: true removed
});
```

### 2.2 Tests

- Run the existing test suite on macOS (and Windows if available) to confirm `npm test` still
  executes correctly.
- Confirm the timeout + SIGTERM path still works without a shell intermediary.

---

## Task 3: Fix XSS in Grove Panel via `innerHTML`

**File**: `packages/grove-core/src/panel/GrovePanel.ts`

**Problem**: The `render()` function builds an HTML string by concatenating status fields
(`p.relativePath`, `p.language`, `clusterType`) and assigns it via `content.innerHTML`. The CSP
allows `'unsafe-inline'` scripts, so any injected `<script>` or event handler would execute. A
Grove project with a path containing HTML (e.g., from a maliciously named directory) would trigger
XSS inside the webview.

```ts
// BEFORE — vulnerable
content.innerHTML = html;
// ...
'<span>' + (p.relativePath || 'Root') + '</span>'
```

**Fix**: Either (a) HTML-escape all interpolated values before building the string, or (b)
use the DOM API to create elements and set values via `textContent`.

### 3.1 Add an `escapeHtml` helper to the webview script

Add a small helper inside the `<script>` block (in the `_getHtml()` string) that escapes the five
dangerous HTML characters:

```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 3.2 Wrap all interpolated values

Wrap every user-supplied value in `escapeHtml()` before concatenation:

```js
// AFTER
'<span>' + escapeHtml(p.relativePath || 'Root') + '</span>'
'<span>(' + escapeHtml(p.language || 'unknown') + ')</span>'
'Connected (' + escapeHtml(clusterType) + ')'
```

### 3.3 Tests

- Add a test where a project has a `relativePath` containing `<script>alert(1)</script>`. Confirm
  the value is rendered as literal text, not executed.
- Check that the panel still renders correctly for normal values.

---

## Task 4: Replace `'unsafe-inline'` CSP with Nonces

**Files**:
- `packages/grove-core/src/panel/GrovePanel.ts`
- `packages/grove-core/src/feedback/webview-html.ts`
- `packages/grove-core/src/feedback/FeedbackPanel.ts` (where the HTML is assembled)

**Problem**: Both webviews use `script-src 'unsafe-inline'`, which allows any inline `<script>` to
run. This negates most of the protection that CSP is intended to provide.

**Fix**: Generate a per-render nonce and use it on the `<script>` tag. VS Code's webview `cspSource`
covers extension-local resources.

### 4.1 Add a nonce generator

Add a shared helper (e.g., in `grove-core/src/panel/nonce.ts`):

```ts
import { randomBytes } from "crypto";

export function getNonce(): string {
  return randomBytes(16).toString("base64");
}
```

### 4.2 Update Grove Panel CSP

In `GrovePanel.ts`, generate a nonce in `_getHtml()` and thread it through:

```ts
private _getHtml(): string {
  const nonce = getNonce();
  return `<!DOCTYPE html>
  ...
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  ...
  <script nonce="${nonce}">
    ...
  </script>`;
}
```

### 4.3 Update Feedback Webview CSP

Apply the same nonce pattern to `webview-html.ts`. Since the HTML is generated by a standalone
function (not a class method), add a `nonce` parameter:

```ts
export function getWebviewHtml(nonce: string): string {
  return `...
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  ...
  <script nonce="${nonce}">${getScript()}</script>`;
}
```

Call it from `FeedbackPanel.ts`:
```ts
import { getNonce } from "../panel/nonce";
// ...
webview.html = getWebviewHtml(getNonce());
```

### 4.4 Tests

- Confirm both webviews load and function correctly after the change.
- Confirm a `<script>` tag without a matching nonce is blocked by the browser (can be verified via
  the VS Code developer tools console).

---

## Task 5: Add `--fixed-strings` to Ripgrep

**File**: `packages/grove-core/src/snippet-codelens/ripgrep-searcher.ts`

**Problem**: The `snippetName` extracted from Bluehawk `:snippet-start:` markers is passed directly
as a ripgrep regex pattern. A snippet name with regex metacharacters (e.g., `my.snippet+name`)
would produce unintended matches.

```ts
// BEFORE
const args = [
  "--json",
  "--glob", "content/**/source/**/*.rst",
  "--ignore-case",
  pattern,          // treated as regex
];
```

**Fix**: Add the `--fixed-strings` flag (`-F`) so the pattern is treated as a literal string. The
post-search filter that checks for `:snippet: name` already does exact matching, so this doesn't
change result quality.

```ts
// AFTER
const args = [
  "--json",
  "--fixed-strings",   // treat pattern as literal, not regex
  "--glob", "content/**/source/**/*.rst",
  "--glob", "content/**/source/**/*.txt",
  "--ignore-case",
  pattern,
];
```

### 5.1 Tests

- Add a test where `snippetName` is `my.snippet` (contains a regex `.`) and confirm the search
  does not match `my_snippet` or other unintended strings.

---

## Completion Checklist

- [ ] Task 1: `execFile` in bluehawk-runner — no shell interpolation
- [ ] Task 2: `shell: true` removed from test-runner
- [ ] Task 3: `escapeHtml` applied to all `innerHTML` interpolation in GrovePanel
- [ ] Task 4: Nonce-based CSP in both webviews
- [ ] Task 5: `--fixed-strings` flag in ripgrep-searcher
- [ ] All existing tests pass
- [ ] New tests added for each fix (see per-task test notes above)
- [ ] Extension packages and loads without errors (`pnpm build && pnpm package`)
