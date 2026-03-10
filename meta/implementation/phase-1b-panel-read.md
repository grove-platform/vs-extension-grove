# Phase 1b: Grove Panel + Read Tools

**Goal**: Create the Grove Panel webview in the sidebar and implement the `grove_read_file` MCP tool with security constraints.

**Validates**: Webview ↔ Extension messaging works, AI can read project files safely.

**Depends on**: Phase 1a completed.

---

## Prerequisites

- Phase 1a complete and passing all tests
- Understanding of VS Code Webview API

---

## Task 1: Register Grove Panel in Extension

### 1.1 Update packages/grove-core/package.json

Add view container and view contributions:

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "grove",
          "title": "Grove",
          "icon": "$(tree)"
        }
      ]
    },
    "views": {
      "grove": [
        {
          "type": "webview",
          "id": "grove.panel",
          "name": "Grove"
        }
      ]
    },
    "commands": [
      {
        "command": "grove.copyMcpConfig",
        "title": "Grove: Copy MCP Configuration"
      },
      {
        "command": "grove.refreshPanel",
        "title": "Grove: Refresh Panel"
      }
    ]
  }
}
```

### 1.2 Create packages/grove-core/src/panel/GrovePanel.ts

```typescript
import * as vscode from "vscode";
import type { GroveStatus, GroveProject } from "@grove/shared";

export class GrovePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grove.panel";

  private _view?: vscode.WebviewView;
  private _status: GroveStatus | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _getStatus: () => Promise<GroveStatus>
  ) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "refresh":
          await this.refresh();
          break;
        case "copyMcpConfig":
          vscode.commands.executeCommand("grove.copyMcpConfig");
          break;
        case "runTests":
          // Will be implemented in Phase 1c
          vscode.window.showInformationMessage("Test runner not yet implemented");
          break;
      }
    });

    // Initial refresh
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this._view) return;

    this._status = await this._getStatus();
    this._view.webview.postMessage({
      command: "updateStatus",
      status: this._status,
    });
  }

  private _getHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Grove</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-textLink-foreground);
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }
    .status-icon {
      width: 16px;
      text-align: center;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .setup-wizard {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      padding: 12px;
      margin-bottom: 16px;
    }
    .setup-wizard h3 {
      margin: 0 0 8px 0;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div id="loading">Loading Grove status...</div>
  <div id="content" class="hidden"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentStatus = null;

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'updateStatus':
          currentStatus = message.status;
          render();
          break;
      }
    });

    function render() {
      const loading = document.getElementById('loading');
      const content = document.getElementById('content');

      if (!currentStatus) {
        loading.classList.remove('hidden');
        content.classList.add('hidden');
        return;
      }

      loading.classList.add('hidden');
      content.classList.remove('hidden');

      let html = '';

      // Show setup wizard if no projects found
      if (!currentStatus.hasProject) {
        html += \`
          <div class="setup-wizard">
            <h3>No Grove Project Detected</h3>
            <p>Create a snip.js file to get started, or open a folder containing one.</p>
          </div>
        \`;
      } else {
        // Project status section
        html += \`
          <div class="section">
            <div class="section-title">Projects</div>
            \${currentStatus.projects.map(p => \`
              <div class="status-row">
                <span class="status-icon">\${p.hasValidConfig ? '✓' : '!'}</span>
                <span>\${p.relativePath || 'Root'}</span>
                <span>(\${p.language || 'unknown'})</span>
              </div>
            \`).join('')}
          </div>
        \`;

        // MongoDB connection status
        html += \`
          <div class="section">
            <div class="section-title">MongoDB</div>
            <div class="status-row">
              <span class="status-icon">\${currentStatus.mongoConnection.connected ? '✓' : '○'}</span>
              <span>\${currentStatus.mongoConnection.connected ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        \`;

        // Actions
        html += \`
          <div class="section">
            <div class="section-title">Actions</div>
            <div class="actions">
              <button onclick="runTests()">Run Tests</button>
              <button onclick="refresh()">Refresh</button>
            </div>
          </div>
        \`;
      }

      // Always show MCP setup option
      html += \`
        <div class="section">
          <div class="section-title">AI Integration</div>
          <button onclick="copyMcpConfig()" style="width: 100%;">
            Copy MCP Config for Augment
          </button>
        </div>
      \`;

      content.innerHTML = html;
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function copyMcpConfig() {
      vscode.postMessage({ command: 'copyMcpConfig' });
    }

    function runTests() {
      vscode.postMessage({ command: 'runTests' });
    }

    // Request initial status
    refresh();
  </script>
</body>
</html>\`;
  }
}
```

### 1.3 Update packages/grove-core/src/extension.ts

Add panel registration to the activate function:

```typescript
import * as vscode from "vscode";
import { detectGroveProjects } from "@grove/shared";
import type { GroveStatus } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";
import { GrovePanelProvider } from "./panel/GrovePanel";

let statusBarItem: vscode.StatusBarItem;
let currentStatus: GroveStatus | null = null;

async function getStatus(): Promise<GroveStatus> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection: { connected: false, clusterType: "unknown" },
    };
  }

  const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);

  currentStatus = {
    hasProject: projects.length > 0,
    activeProject: projects[0] ?? null,
    projects,
    mongoConnection: { connected: false, clusterType: "unknown" },
  };

  return currentStatus;
}

export async function activate(context: vscode.ExtensionContext) {
  // Register Grove Panel
  const panelProvider = new GrovePanelProvider(context.extensionUri, getStatus);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GrovePanelProvider.viewType,
      panelProvider,
    ),
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.refreshPanel", () => {
      panelProvider.refresh();
    }),
  );

  // ... rest of existing activation code (status bar, MCP server, etc.)
}
```

---

## Task 2: Implement grove_read_file MCP Tool

### 2.1 Add tool to packages/grove-mcp-server/src/index.ts

Update the ListToolsRequestSchema handler to include the new tool:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "grove_get_status",
      description:
        "Get Grove project status including detected projects and MongoDB connection state",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "grove_read_file",
      description:
        "Read a file from the Grove project. Returns file contents with size limits enforced.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to file from project root",
          },
          projectPath: {
            type: "string",
            description:
              "Optional: Project root path if multiple projects exist",
          },
        },
        required: ["path"],
      },
    },
  ],
}));
```

### 2.2 Create packages/grove-mcp-server/src/tools/read-file.ts

```typescript
import * as fs from "fs/promises";
import * as path from "path";

const MAX_FILE_SIZE = 100 * 1024; // 100KB limit

/**
 * Handle grove_read_file tool invocation.
 * Security: Validates path is within workspace boundaries.
 */
export async function handleReadFile(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const filePath = args.path as string;
  const projectPath = (args.projectPath as string) || "";

  if (!workspacePath) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "GROVE_WORKSPACE environment variable not set.",
        },
      ],
    };
  }

  if (!filePath) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Missing required parameter: path",
        },
      ],
    };
  }

  // Resolve absolute path
  const basePath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;
  const absolutePath = path.resolve(basePath, filePath);

  // Security: Ensure path is within workspace
  if (!absolutePath.startsWith(workspacePath)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Path traversal denied: ${filePath} is outside workspace boundaries.`,
        },
      ],
    };
  }

  try {
    // Check file size before reading
    const stats = await fs.stat(absolutePath);

    if (stats.size > MAX_FILE_SIZE) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `File too large: ${stats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit. Use a text editor to view this file.`,
          },
        ],
      };
    }

    const content = await fs.readFile(absolutePath, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `File not found: ${filePath}`,
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
```

### 2.3 Update packages/grove-mcp-server/src/index.ts CallToolRequestSchema handler

```typescript
import { handleGetStatus } from "./tools/get-status";
import { handleReadFile } from "./tools/read-file";

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "grove_get_status":
      return handleGetStatus(args || {});
    case "grove_read_file":
      return handleReadFile(args || {});
    default:
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
  }
});
```

---

## Task 3: Add Security Utilities

### 3.1 Create packages/shared/src/security.ts

```typescript
import * as path from "path";

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export function isPathWithinBoundary(
  resolvedPath: string,
  basePath: string,
): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedBase = path.normalize(basePath);

  return (
    normalizedResolved.startsWith(normalizedBase + path.sep) ||
    normalizedResolved === normalizedBase
  );
}

/**
 * Sanitize a relative path by removing dangerous components.
 */
export function sanitizePath(relativePath: string): string {
  // Remove null bytes
  let sanitized = relativePath.replace(/\0/g, "");

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove leading slashes (prevent absolute paths)
  sanitized = sanitized.replace(/^\/+/, "");

  return sanitized;
}
```

### 3.2 Update packages/shared/src/index.ts

```typescript
export * from "./types";
export * from "./project-detection";
export * from "./security";
```

---

## Task 4: Testing

### 4.1 Create packages/grove-mcp-server/src/**tests**/read-file.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleReadFile } from "../tools/read-file";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("grove_read_file tool", () => {
  let tempDir: string;
  const originalEnv = process.env.GROVE_WORKSPACE;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
    process.env.GROVE_WORKSPACE = tempDir;
  });

  afterEach(async () => {
    process.env.GROVE_WORKSPACE = originalEnv;
    await fs.rm(tempDir, { recursive: true });
  });

  it("should read a file within workspace", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "Hello, Grove!");
    const result = await handleReadFile({ path: "test.txt" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Hello, Grove!");
  });

  it("should reject path traversal attempts", async () => {
    const result = await handleReadFile({ path: "../../../etc/passwd" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path traversal denied");
  });

  it("should reject files over 100KB", async () => {
    const largeContent = "x".repeat(101 * 1024);
    await fs.writeFile(path.join(tempDir, "large.txt"), largeContent);
    const result = await handleReadFile({ path: "large.txt" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File too large");
  });

  it("should return error for non-existent files", async () => {
    const result = await handleReadFile({ path: "nonexistent.txt" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File not found");
  });

  it("should support projectPath parameter", async () => {
    await fs.mkdir(path.join(tempDir, "subproject"));
    await fs.writeFile(
      path.join(tempDir, "subproject", "file.txt"),
      "In subproject",
    );
    const result = await handleReadFile({
      path: "file.txt",
      projectPath: "subproject",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("In subproject");
  });
});
```

### 4.2 Create packages/shared/src/**tests**/security.test.ts

```typescript
import { describe, it, expect } from "vitest";
import { isPathWithinBoundary, sanitizePath } from "../security";

describe("isPathWithinBoundary", () => {
  it("should allow paths within boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/project/file.txt", "/home/user/project"),
    ).toBe(true);
  });

  it("should reject paths outside boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/other/file.txt", "/home/user/project"),
    ).toBe(false);
  });

  it("should reject path traversal", () => {
    expect(
      isPathWithinBoundary(
        "/home/user/project/../other/file.txt",
        "/home/user/project",
      ),
    ).toBe(false);
  });

  it("should allow the boundary path itself", () => {
    expect(
      isPathWithinBoundary("/home/user/project", "/home/user/project"),
    ).toBe(true);
  });
});

describe("sanitizePath", () => {
  it("should remove null bytes", () => {
    expect(sanitizePath("file\0.txt")).toBe("file.txt");
  });

  it("should normalize backslashes", () => {
    expect(sanitizePath("dir\\file.txt")).toBe("dir/file.txt");
  });

  it("should remove leading slashes", () => {
    expect(sanitizePath("/etc/passwd")).toBe("etc/passwd");
  });
});
```

---

## Acceptance Criteria

Phase 1b is complete when:

- [ ] Grove icon appears in Activity Bar when workspace contains snip.js
- [ ] Clicking Grove icon opens sidebar panel showing project status
- [ ] Panel shows "No Grove Project Detected" when no snip.js exists
- [ ] Panel shows project list with language detection when projects exist
- [ ] "Copy MCP Config for Augment" button copies valid JSON to clipboard
- [ ] Calling `grove_read_file` via MCP returns file contents
- [ ] Path traversal attempts are rejected with clear error
- [ ] Files over 100KB are rejected with clear error
- [ ] All unit tests pass (`pnpm test`)

---

## Security Checklist

- [ ] All file paths validated to be within workspace boundaries
- [ ] File size checked before reading (100KB limit)
- [ ] Path sanitization removes null bytes and normalizes separators
- [ ] Webview Content Security Policy restricts resource loading
- [ ] No eval() or dynamic script injection in webview
