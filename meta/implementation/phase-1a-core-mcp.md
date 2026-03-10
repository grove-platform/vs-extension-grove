# Phase 1a: Core Extension + Basic MCP Server

**Goal**: Establish the monorepo structure, create grove-core extension with project detection, and implement a minimal MCP server with `grove_get_status` tool.

**Validates**: MCP integration works end-to-end with Augment Code.

---

## Prerequisites

- Node.js 18+ installed
- pnpm 8+ installed
- VS Code 1.85+ for development

---

## Task 1: Initialize Monorepo Structure

### 1.1 Create pnpm workspace configuration

Create `pnpm-workspace.yaml` in repository root:

```yaml
packages:
  - "packages/*"
```

### 1.2 Create root package.json

Create `package.json` in repository root:

```json
{
  "name": "grove-extension",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "watch": "pnpm -r --parallel watch",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "prettier": "^3.2.0",
    "eslint": "^9.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### 1.3 Create shared TypeScript config

Create `tsconfig.base.json` in repository root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### 1.4 Create directory structure

```
packages/
├── grove-core/
├── grove-mcp-server/
└── shared/
```

---

## Task 2: Create Shared Package

### 2.1 Create packages/shared/package.json

```json
{
  "name": "@grove/shared",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  }
}
```

### 2.2 Create packages/shared/src/types.ts

Define core types used across packages:

```typescript
export interface GroveProject {
  /** Absolute path to the project root (directory containing snip.js) */
  rootPath: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Detected language based on project structure */
  language: GroveLanguage | null;
  /** Whether snip.js was successfully parsed */
  hasValidConfig: boolean;
}

export type GroveLanguage =
  | "nodejs"
  | "python"
  | "go"
  | "java"
  | "csharp"
  | "mongosh";

export interface GroveStatus {
  /** Whether extension detected a valid Grove project */
  hasProject: boolean;
  /** Currently active project (if multiple exist) */
  activeProject: GroveProject | null;
  /** All detected Grove projects in workspace */
  projects: GroveProject[];
  /** MongoDB connection status (placeholder for now) */
  mongoConnection: {
    connected: boolean;
    clusterType: "Atlas" | "local" | "unknown";
  };
}
```

### 2.3 Create packages/shared/src/project-detection.ts

```typescript
import * as path from "path";
import * as fs from "fs/promises";
import { GroveProject, GroveLanguage } from "./types";

/**
 * Detect Grove projects by finding snip.js files.
 * @param workspacePath - Absolute path to workspace root
 * @returns Array of detected Grove projects
 */
export async function detectGroveProjects(
  workspacePath: string,
): Promise<GroveProject[]> {
  // Implementation: recursively find all snip.js files
  // For each snip.js found:
  //   1. Determine project root (parent directory of snip.js)
  //   2. Detect language from project structure
  //   3. Validate snip.js is parseable
  // Return array of GroveProject objects
}

/**
 * Detect language based on project files.
 */
export function detectLanguage(
  projectPath: string,
): Promise<GroveLanguage | null> {
  // Check for:
  // - package.json with jest → nodejs
  // - pyproject.toml or pytest.ini → python
  // - go.mod → go
  // - pom.xml or build.gradle → java
  // - *.csproj → csharp
}

/**
 * Validate snip.js configuration.
 */
export async function validateSnipConfig(snipPath: string): Promise<boolean> {
  // Try to parse snip.js
  // Return true if valid Bluehawk config structure
}
```

### 2.4 Create packages/shared/src/index.ts

```typescript
export * from "./types";
export * from "./project-detection";
```

---

## Task 3: Create MCP Server Package

### 3.1 Create packages/grove-mcp-server/package.json

```json
{
  "name": "@mongodb/grove-mcp",
  "version": "0.0.1",
  "description": "MCP server for Grove documentation testing platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "grove-mcp": "./bin/grove-mcp.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@grove/shared": "workspace:*"
  }
}
```

### 3.2 Create packages/grove-mcp-server/src/index.ts

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleGetStatus } from "./tools/get-status";

const server = new Server(
  { name: "grove", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

// Register tool handlers
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "grove_get_status":
      return handleGetStatus(args);
    default:
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

### 3.3 Create packages/grove-mcp-server/src/tools/get-status.ts

```typescript
import { detectGroveProjects } from "@grove/shared";
import type { GroveStatus } from "@grove/shared";

/**
 * Handle grove_get_status tool invocation.
 * Returns project status WITHOUT sensitive information.
 */
export async function handleGetStatus(_args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;

  if (!workspacePath) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "GROVE_WORKSPACE environment variable not set. Configure the MCP server with your workspace path.",
        },
      ],
    };
  }

  try {
    const projects = await detectGroveProjects(workspacePath);

    const status: GroveStatus = {
      hasProject: projects.length > 0,
      activeProject: projects[0] ?? null,
      projects,
      mongoConnection: {
        connected: false, // Placeholder - will be implemented later
        clusterType: "unknown",
      },
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to get Grove status: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
```

### 3.4 Create packages/grove-mcp-server/bin/grove-mcp.js

```javascript
#!/usr/bin/env node
import "../dist/index.js";
```

---

## Task 4: Create VS Code Extension Package

### 4.1 Create packages/grove-core/package.json

This is a VS Code extension manifest. Key fields:

```json
{
  "name": "grove-core",
  "displayName": "Grove",
  "description": "MongoDB documentation code example testing platform",
  "version": "0.0.1",
  "publisher": "mongodb",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["workspaceContains:**/snip.js"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "grove.copyMcpConfig",
        "title": "Grove: Copy MCP Configuration"
      }
    ]
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "npm run build -- --watch"
  },
  "dependencies": {
    "@grove/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0"
  }
}
```

### 4.2 Create packages/grove-core/src/extension.ts

```typescript
import * as vscode from "vscode";
import { detectGroveProjects } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  // Detect Grove projects
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);

  if (projects.length > 0) {
    // Update status bar
    statusBarItem.text = `$(tree) Grove: ${projects[0].relativePath}`;
    statusBarItem.tooltip = `Grove project detected\n${projects.length} project(s) found`;
    statusBarItem.show();

    // Start MCP server
    await startMcpServer(context, workspaceFolders[0].uri.fsPath);
  }

  // Register commands
  registerCopyConfigCommand(context);

  // Log activation
  const outputChannel = vscode.window.createOutputChannel("Grove");
  outputChannel.appendLine(
    `Grove activated. Found ${projects.length} project(s).`,
  );
  context.subscriptions.push(outputChannel);
}

export function deactivate() {
  stopMcpServer();
}
```

### 4.3 Create packages/grove-core/src/mcp-bridge.ts

```typescript
import * as vscode from "vscode";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

let mcpProcess: ChildProcess | null = null;
let restartCount = 0;
const MAX_RESTARTS = 3;

/**
 * Start the MCP server as a child process.
 */
export async function startMcpServer(
  context: vscode.ExtensionContext,
  workspacePath: string,
): Promise<void> {
  const serverPath = path.join(
    context.extensionPath,
    "node_modules",
    "@mongodb",
    "grove-mcp",
    "dist",
    "index.js",
  );

  mcpProcess = spawn("node", [serverPath], {
    env: {
      ...process.env,
      GROVE_WORKSPACE: workspacePath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  mcpProcess.on("exit", (code) => {
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      const delay = Math.pow(2, restartCount) * 1000; // Exponential backoff
      setTimeout(() => startMcpServer(context, workspacePath), delay);
    }
  });

  mcpProcess.stderr?.on("data", (data) => {
    console.error(`Grove MCP server error: ${data}`);
  });
}

/**
 * Stop the MCP server.
 */
export function stopMcpServer(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}

/**
 * Get the MCP server configuration JSON for Augment.
 */
export function getMcpConfig(extensionPath: string): object {
  return {
    mcpServers: {
      grove: {
        command: "node",
        args: [
          path.join(
            extensionPath,
            "node_modules",
            "@mongodb",
            "grove-mcp",
            "dist",
            "index.js",
          ),
        ],
        env: {
          GROVE_WORKSPACE: "${workspaceFolder}",
        },
      },
    },
  };
}
```

### 4.4 Create packages/grove-core/src/commands/copy-config.ts

```typescript
import * as vscode from "vscode";
import { getMcpConfig } from "../mcp-bridge";

export function registerCopyConfigCommand(
  context: vscode.ExtensionContext,
): void {
  const command = vscode.commands.registerCommand(
    "grove.copyMcpConfig",
    async () => {
      const config = getMcpConfig(context.extensionPath);
      const json = JSON.stringify(config, null, 2);

      await vscode.env.clipboard.writeText(json);

      vscode.window.showInformationMessage(
        "Grove MCP config copied! Paste in Augment Settings → MCP → Import from JSON",
      );
    },
  );

  context.subscriptions.push(command);
}
```

---

## Task 5: Testing

### 5.1 Unit Tests for Project Detection

Create `packages/shared/src/__tests__/project-detection.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectGroveProjects, detectLanguage } from "../project-detection";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectGroveProjects", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect a project with snip.js", async () => {
    await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(1);
    expect(projects[0].hasValidConfig).toBe(true);
  });

  it("should detect multiple projects in subdirectories", async () => {
    await fs.mkdir(path.join(tempDir, "node"));
    await fs.mkdir(path.join(tempDir, "python"));
    await fs.writeFile(
      path.join(tempDir, "node", "snip.js"),
      "module.exports = {};",
    );
    await fs.writeFile(
      path.join(tempDir, "python", "snip.js"),
      "module.exports = {};",
    );

    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(2);
  });

  it("should return empty array when no snip.js found", async () => {
    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(0);
  });
});

describe("detectLanguage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect nodejs from package.json with jest", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("nodejs");
  });

  it("should detect python from pyproject.toml", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[tool.pytest]");
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("python");
  });

  it("should detect go from go.mod", async () => {
    await fs.writeFile(path.join(tempDir, "go.mod"), "module example.com/test");
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("go");
  });
});
```

### 5.2 Integration Test for MCP Server

Create `packages/grove-mcp-server/src/__tests__/get-status.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleGetStatus } from "../tools/get-status";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("grove_get_status tool", () => {
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

  it("should return error when GROVE_WORKSPACE not set", async () => {
    delete process.env.GROVE_WORKSPACE;
    const result = await handleGetStatus({});
    expect(result.isError).toBe(true);
  });

  it("should return hasProject:false when no snip.js exists", async () => {
    const result = await handleGetStatus({});
    expect(result.isError).toBeUndefined();
    const status = JSON.parse(result.content[0].text);
    expect(status.hasProject).toBe(false);
  });

  it("should return hasProject:true when snip.js exists", async () => {
    await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
    const result = await handleGetStatus({});
    const status = JSON.parse(result.content[0].text);
    expect(status.hasProject).toBe(true);
    expect(status.projects).toHaveLength(1);
  });
});
```

---

## Acceptance Criteria

Phase 1a is complete when:

- [ ] `pnpm install` succeeds at repository root
- [ ] `pnpm build` compiles all packages without errors
- [ ] Opening a workspace with `snip.js` shows "Grove: {path}" in status bar
- [ ] Running "Grove: Copy MCP Configuration" copies valid JSON to clipboard
- [ ] Pasting copied JSON into Augment and calling `grove_get_status` returns project info
- [ ] All unit tests pass (`pnpm test`)
- [ ] MCP server auto-restarts on crash (up to 3 times with exponential backoff)

---

## Security Checklist

- [ ] All file paths validated to be within workspace boundaries
- [ ] `grove_get_status` never returns connection strings or credentials
- [ ] No secrets logged to console or output channel
