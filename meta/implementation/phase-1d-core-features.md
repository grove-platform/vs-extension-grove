# Phase 1d: Core Feature Parity

**Goal**: Implement grove-core features from the discovery document that were not included in the spec.

## Missing Features

These features were identified in `meta/discovery.md` but not implemented:

| Feature                           | Priority | Complexity |
| --------------------------------- | -------- | ---------- |
| Settings schema                   | High     | Low        |
| Progress indicators               | High     | Low        |
| Diagnostic collection             | High     | Medium     |
| Language status items             | Medium   | Low        |
| Symlink management                | Medium   | Medium     |
| `grove.getDetectedProjects()` API | Medium   | Low        |
| Bluehawk preview pane             | Low      | High       |
| literalinclude pathing            | Low      | High       |
| MongoDB connection + secrets      | Low      | Medium     |

## Implementation Plan

### Task 1: Settings Schema

Add `contributes.configuration` to `packages/grove-core/package.json`:

```json
"configuration": {
  "title": "Grove",
  "properties": {
    "grove.autoDetect": {
      "type": "boolean",
      "default": true,
      "description": "Automatically detect Grove projects on workspace open"
    },
    "grove.bluehawkPath": {
      "type": "string",
      "default": "",
      "description": "Path to bluehawk CLI (uses npx if empty)"
    },
    "grove.showStatusBar": {
      "type": "boolean",
      "default": true,
      "description": "Show Grove status in the status bar"
    }
  }
}
```

### Task 2: Progress Indicators

Wrap long-running operations with `vscode.window.withProgress()`:

```typescript
await vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: "Grove: Detecting projects...",
    cancellable: false,
  },
  async (progress) => {
    progress.report({ increment: 0 });
    const projects = await detectGroveProjects(workspacePath);
    progress.report({ increment: 100 });
    return projects;
  },
);
```

Apply to:

- Project detection in `activate()`
- MCP server startup
- Future: test runs, snip operations

### Task 3: Diagnostic Collection

Create `packages/grove-core/src/diagnostics.ts`:

```typescript
const diagnosticCollection = vscode.languages.createDiagnosticCollection("grove");

// Report missing symlinks
function checkSymlinks(projectPath: string): vscode.Diagnostic[] { ... }

// Report invalid Bluehawk markup (future)
function checkBluehawkSyntax(document: vscode.TextDocument): vscode.Diagnostic[] { ... }
```

Register in `activate()` and refresh on file changes.

### Task 4: Language Status Items

Add per-file Grove status in the editor:

```typescript
const langStatus = vscode.languages.createLanguageStatusItem("grove.status", {
  language: "*",
});
langStatus.text = "$(tree) Grove";
langStatus.detail = "code-example-tests/command-line/mongosh";
```

Update based on active editor's file path.

### Task 5: Symlink Management

Detect missing `content/code-examples/tested` symlink in docs projects:

```typescript
// In project-detection.ts or new symlink.ts
async function checkSymlink(docsProjectPath: string): Promise<SymlinkStatus> {
  const expectedPath = path.join(
    docsProjectPath,
    "source/code-examples/tested",
  );
  // Check if symlink exists and points to valid target
}

// Command: grove.createSymlink
async function createSymlink(
  docsPath: string,
  targetPath: string,
): Promise<void> {
  // Validate paths, create symlink with user confirmation
}
```

### Task 6: Expose `grove.getDetectedProjects()` API

Add to `packages/grove-core/src/extension.ts`:

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // ... existing code ...

  // Expose API for other extensions
  return {
    getDetectedProjects: () => currentStatus?.projects ?? [],
    getActiveProject: () => currentStatus?.activeProject ?? null,
  };
}
```

## Related Phases

- **Phase 1e**: Bluehawk preview, literalinclude pathing, MongoDB connection
  - See `meta/implementation/phase-1e-advanced-features.md`

## Acceptance Criteria

- [ ] Settings appear in VS Code Settings UI under "Grove"
- [ ] Progress notification shows during project detection
- [ ] Diagnostic squiggles appear for missing symlinks
- [ ] Language status shows current Grove project for active file
- [ ] "Grove: Create Symlink" command available in Command Palette
- [ ] Other extensions can call `grove.getDetectedProjects()`

## Files to Create/Modify

| File                                         | Action                           |
| -------------------------------------------- | -------------------------------- |
| `packages/grove-core/package.json`           | Add `configuration`, commands    |
| `packages/grove-core/src/extension.ts`       | Add progress, return API         |
| `packages/grove-core/src/diagnostics.ts`     | New - diagnostic collection      |
| `packages/grove-core/src/language-status.ts` | New - language status item       |
| `packages/grove-core/src/symlink.ts`         | New - symlink detection/creation |
