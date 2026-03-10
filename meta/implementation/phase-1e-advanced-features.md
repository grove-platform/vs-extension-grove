# Phase 1e: Advanced Core Features

**Goal**: Implement Bluehawk preview, literalinclude navigation, and MongoDB connection management.

## Feature 1: Bluehawk Preview Pane

### Overview

Show a live preview of what `bluehawk snip` will extract from source files. Writers can visualize the final output before running the extraction.

### Implementation

#### 1.1 Create BluehawkPreviewProvider

`packages/grove-core/src/preview/BluehawkPreview.ts`:

```typescript
export class BluehawkPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grove.bluehawkPreview";

  async updatePreview(document: vscode.TextDocument): Promise<void> {
    const result = await this.runBluehawkDryRun(document.uri.fsPath);
    this._view?.webview.postMessage({ type: "preview", content: result });
  }

  private async runBluehawkDryRun(filePath: string): Promise<BluehawkResult> {
    // Execute: npx bluehawk snip --dry-run <file>
    // Parse JSON output for snippet boundaries
  }
}
```

#### 1.2 Webview UI

- Split view: source on left, preview on right
- Syntax highlighting matching source language
- Highlight active `:snippet-start:`/`:snippet-end:` blocks
- Show removed (`:remove:`) sections as strikethrough
- Show replaced (`:replace:`) sections with diff highlighting

#### 1.3 Commands

| Command                        | Description                   |
| ------------------------------ | ----------------------------- |
| `grove.openBluehawkPreview`    | Open preview for current file |
| `grove.refreshBluehawkPreview` | Refresh preview               |

#### 1.4 Activation

- Auto-update on document save
- Debounce updates (500ms) during active editing
- Only activate for files containing Bluehawk directives

### Files to Create

| File                             | Purpose          |
| -------------------------------- | ---------------- |
| `src/preview/BluehawkPreview.ts` | Webview provider |
| `src/preview/bluehawk-runner.ts` | CLI wrapper      |
| `src/preview/preview.html`       | Webview template |

---

## Feature 2: literalinclude Pathing

### Overview

Parse RST files to find `literalinclude` directives and provide navigation to referenced source files.

### Implementation

#### 2.1 RST Parser

`packages/grove-core/src/rst/literalinclude-parser.ts`:

```typescript
interface LiteralIncludeRef {
  range: vscode.Range; // Position in RST file
  targetPath: string; // Referenced file path
  snippetName?: string; // :snippet: value if present
  startAfter?: string; // :start-after: value
  endBefore?: string; // :end-before: value
}

export function parseLiteralIncludes(
  document: vscode.TextDocument,
): LiteralIncludeRef[] {
  const pattern = /^\.\.\s+literalinclude::\s+(.+)$/gm;
  // Parse directive and following options (:snippet:, :start-after:, etc.)
}
```

#### 2.2 Hover Provider

```typescript
class LiteralIncludeHoverProvider implements vscode.HoverProvider {
  provideHover(document, position): vscode.Hover {
    // Show: target file path, snippet name, line preview
  }
}
```

#### 2.3 Definition Provider (Click-to-Open)

```typescript
class LiteralIncludeDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document, position): vscode.Location {
    // Navigate to referenced file, optionally to snippet line
  }
}
```

#### 2.4 Document Link Provider

```typescript
class LiteralIncludeLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document): vscode.DocumentLink[] {
    // Make file paths clickable in RST files
  }
}
```

### Path Resolution

Resolve `literalinclude` paths relative to:

1. RST file's directory
2. Sphinx source directory (if `conf.py` found)
3. Symlinked `code-examples/tested` directory

### Files to Create

| File                                 | Purpose                         |
| ------------------------------------ | ------------------------------- |
| `src/rst/literalinclude-parser.ts`   | RST directive parser            |
| `src/rst/LiteralIncludeProviders.ts` | Hover, Definition, DocumentLink |
| `src/rst/path-resolver.ts`           | Resolve paths across symlinks   |

---

## Feature 3: MongoDB Connection + Secrets

### Overview

Securely store MongoDB connection strings and show available sample databases.

### Implementation

#### 3.1 Secure Credential Storage

`packages/grove-core/src/mongo/credentials.ts`:

```typescript
const SECRET_KEY = "grove.mongoConnectionString";

export async function storeConnectionString(
  secrets: vscode.SecretStorage,
  connectionString: string,
): Promise<void> {
  await secrets.store(SECRET_KEY, connectionString);
}

export async function getConnectionString(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}
```

#### 3.2 Connection Manager

`packages/grove-core/src/mongo/connection.ts`:

```typescript
export class MongoConnectionManager {
  private client: MongoClient | null = null;

  async connect(connectionString: string): Promise<void> {
    this.client = new MongoClient(connectionString);
    await this.client.connect();
  }

  async listDatabases(): Promise<string[]> {
    const admin = this.client?.db().admin();
    const result = await admin?.listDatabases();
    return result?.databases.map((db) => db.name) ?? [];
  }

  async getSampleDatabases(): Promise<SampleDatabase[]> {
    // Filter for sample_* databases used in Grove tests
  }
}
```

#### 3.3 Panel Integration

Update `GrovePanelProvider` to show:

- Connection status (connected/disconnected)
- Cluster type (Atlas/local)
- Available sample databases
- "Connect" / "Disconnect" buttons

#### 3.4 Commands

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `grove.connectMongo`    | Prompt for connection string, store securely |
| `grove.disconnectMongo` | Disconnect and clear session                 |
| `grove.showDatabases`   | List available databases                     |

### Dependencies

Add to `packages/grove-core/package.json`:

```json
"dependencies": {
  "mongodb": "^6.0.0"
}
```

### Files to Create/Modify

| File                       | Purpose                |
| -------------------------- | ---------------------- |
| `src/mongo/credentials.ts` | Secure storage wrapper |
| `src/mongo/connection.ts`  | MongoClient wrapper    |
| `src/panel/GrovePanel.ts`  | Add connection UI      |
| `package.json`             | Add mongodb dependency |

---

## Implementation Order

1. **MongoDB Connection** (foundation for panel improvements)
2. **literalinclude Pathing** (independent, high writer value)
3. **Bluehawk Preview** (depends on understanding Bluehawk CLI output)

## Acceptance Criteria

### Bluehawk Preview

- [ ] Preview pane opens from Command Palette
- [ ] Preview updates on file save
- [ ] Snippet boundaries are highlighted
- [ ] `:remove:` blocks shown as strikethrough
- [ ] Preview matches actual `bluehawk snip` output

### literalinclude Pathing

- [ ] Hovering over `literalinclude` path shows target info
- [ ] Ctrl+Click navigates to referenced file
- [ ] Paths resolve correctly across symlinks
- [ ] Works with `:snippet:` option (navigates to snippet start)
- [ ] Broken references show diagnostic warning

### MongoDB Connection

- [ ] Connection string stored securely (not in settings.json)
- [ ] "Connect to MongoDB" command in Command Palette
- [ ] Connection status shown in Grove Panel
- [ ] Sample databases listed when connected
- [ ] Credentials persist across VS Code restarts

## Security Considerations

- **Connection strings**: Always use `context.secrets`, never plain settings
- **Bluehawk CLI**: Validate file paths before execution
- **literalinclude**: Only resolve paths within workspace boundaries
- **MongoDB**: Connection timeout, don't expose credentials in logs
