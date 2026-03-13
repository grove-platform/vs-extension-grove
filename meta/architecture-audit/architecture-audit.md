# Grove Extension — Architecture Audit

## Grove Extension — Architecture Review

Overall the three-package structure (shared → grove-core → grove-nodejs) is clean and well-separated. Below are the specific opportunities I found, ranked by impact.

---

### 1. Duplicated Code

**`formatTimeAgo()` — copy-pasted verbatim in two files**

- TestHoverProvider.ts
- TestDecorations.ts

Both are identical. Extract to a shared utility within the `test-codelens/` module (e.g., a `utils.ts`).

**"Grove Tests" output channel — created fresh on every invocation, in two places**

- extension.ts (`grove.runTests` command)
- index.ts (`runTestBlock`)

Both call `vscode.window.createOutputChannel("Grove Tests")` each time a test runs. VS Code will create a _new_ channel instance every invocation. Create a single shared output channel instance at activation time and pass it to both consumers.

**Path boundary checking — duplicate logic in two packages**

- security.ts (`isPathWithinBoundary` via `path.normalize` + `startsWith`)
- path-resolver.ts (`checkPathExists` does the same normalize-and-startsWith check inline)

path-resolver.ts should import and use `validateWorkspacePath` from `@grove/shared` instead of reimplementing it.

**Redundant `detectGroveProjects` calls — no caching layer**

`detectGroveProjects()` (filesystem scan) is called independently in four places:

- extension.ts — activation
- extension.ts — `getStatus()`
- extension.ts — `grove.runTests` command
- index.ts — `runTestBlock`

Consider a lightweight project cache (invalidated on file-system changes to `snip.js` via a `FileSystemWatcher`) so commands don't re-scan every time.

---

### 2. Dead Code

| Item                      | Location           | Issue                                                                                                        |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `clearDiagnostics()`      | diagnostics.ts     | Exported but never called anywhere                                                                           |
| `disposeLanguageStatus()` | language-status.ts | Exported but never called (not even in `deactivate()`)                                                       |
| `isPathWithinBoundary()`  | security.ts        | Exported from `@grove/shared` but only used in its own test file — no consumer in grove-core or grove-nodejs |
| `sanitizePath()`          | security.ts        | Same — exported but unused outside tests                                                                     |
| `commands/` directory     | commands/          | Empty directory — should be removed                                                                          |
| `deactivate()`            | extension.ts       | Empty function with a "future" comment — fine as a placeholder but worth noting                              |

---

### 3. Debug Logging Left In

LiteralIncludeProviders.ts has a `console.log` with a `[Grove Debug]` prefix that should be removed or converted to the `outputChannel.debug()` pattern used elsewhere.

---

### 4. Inconsistent Logging

The codebase has two logging patterns:

- `outputChannel.info(...)` / `outputChannel.warn(...)` via the `LogOutputChannel` in extension.ts (correct)
- `console.log(...)` in test-runner-api.ts and LiteralIncludeProviders.ts (inconsistent)

The `outputChannel` is module-scoped in extension.ts and not accessible to other modules. Consider either passing it through a simple module-level setter or creating a tiny logger module so all components can log to the same Grove output channel.

---

### 5. Activation Weight / Lazy Loading (ties to your feature request)

`activate()` in extension.ts is a ~290-line function that synchronously registers _all_ features:

- Diagnostics, language status, symlinks, MongoDB, RST providers, test CodeLens, snippet CodeLens, Bluehawk preview, and the `grove.runTests` command.

**Opportunity**: Gate expensive features behind configuration or workspace detection:

- MongoDB commands/connection manager: only initialize if a Grove project is detected (or defer until first use).
- RST providers: only register when `.rst` / `.txt` files are detected in the workspace.

This would improve cold-start time, especially in large monorepo workspaces.

---

### 6. Minor Structural Notes

- **`grove.runTests` (extension.ts) and `runTestBlock` (test-codelens/index.ts)** share a nearly identical flow: detect project → find runner → run tests → format output → show result notification. The main difference is that `runTestBlock` also stores results for decorations and passes `testNamePattern`. These could share a core helper to reduce the ~50 lines of parallel structure.

- **Test coverage gaps**: No unit tests exist for RST parsing, snippet parsing, Bluehawk runner, MongoDB connection, or the panel webview. The RST parser and snippet parser are pure functions that would be straightforward to test.

---

### Summary

| Category                            | Count           | Severity |
| ----------------------------------- | --------------- | -------- |
| Duplicated logic                    | 4 instances     | Medium   |
| Dead/unused exports                 | 5 items         | Low      |
| Debug logging                       | 2 instances     | Low      |
| Architectural (activation, caching) | 2 opportunities | Medium   |
| Missing test coverage               | ~6 modules      | Medium   |

The codebase is well-organized overall. The highest-leverage improvements would be: (1) introducing a project detection cache, (2) sharing the test output channel and test execution flow, and (3) deferring feature registration for lazy activation.

---

## Implementation Phases

Each phase is a self-contained unit of work with its own markdown file. Phases should be executed in order — later phases depend on earlier ones.

| Phase | File                                                                               | Summary                                                                         |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | [phase-1-dead-code-cleanup.md](phase-1-dead-code-cleanup.md)                       | Remove dead exports, empty directories, and stale debug logging                 |
| 2     | [phase-2-extract-shared-utilities.md](phase-2-extract-shared-utilities.md)         | Extract `formatTimeAgo` / `truncate` and deduplicate path boundary checking     |
| 3     | [phase-3-centralized-logger.md](phase-3-centralized-logger.md)                     | Create a centralized logger module; share a single "Grove Tests" output channel |
| 4     | [phase-4-test-execution-consolidation.md](phase-4-test-execution-consolidation.md) | Extract shared test execution helper from grove.runTests and runTestBlock       |
| 5     | [phase-5-project-detection-cache.md](phase-5-project-detection-cache.md)           | Cache `detectGroveProjects` results with FileSystemWatcher invalidation         |
| 6     | [phase-6-lazy-activation.md](phase-6-lazy-activation.md)                           | Defer expensive work (diagnostics refresh, optional CodeLens deferral)          |
