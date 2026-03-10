# Phase 1c: Node.js Extension + Test Runner

**Goal**: Create the Grove for Node.js extension with Jest test runner and implement `grove_run_tests` MCP tool.

**Validates**: Language extension pattern works, AI can run tests safely.

**Depends on**: Phase 1b completed.

---

## Prerequisites

- Phase 1b complete and passing all tests
- Jest knowledge for test runner implementation

---

## Task 1: Create Node.js Extension Package

### 1.1 Create packages/grove-nodejs/package.json

```json
{
  "name": "grove-nodejs",
  "displayName": "Grove for Node.js",
  "description": "Node.js/Jest support for Grove documentation testing",
  "version": "0.0.1",
  "publisher": "mongodb",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["workspaceContains:**/snip.js"],
  "main": "./dist/extension.js",
  "extensionDependencies": ["mongodb.grove-core"],
  "contributes": {
    "commands": [
      {
        "command": "grove.nodejs.runTests",
        "title": "Grove: Run Node.js Tests"
      },
      {
        "command": "grove.nodejs.runTestFile",
        "title": "Grove: Run Current Test File"
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

### 1.2 Create packages/grove-nodejs/src/extension.ts

```typescript
import * as vscode from "vscode";
import { registerTestRunner } from "./test-runner";

export async function activate(context: vscode.ExtensionContext) {
  // Register Jest test runner with grove-core
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) {
    vscode.window.showErrorMessage("Grove Core extension not found");
    return;
  }

  await groveCore.activate();

  // Register our test runner
  const coreApi = groveCore.exports;
  if (coreApi?.registerTestRunner) {
    coreApi.registerTestRunner({
      language: "nodejs",
      name: "Jest",
      run: runJestTests,
      detect: detectJestProject,
    });
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.nodejs.runTests", async () => {
      const result = await runJestTests({
        projectPath: getActiveProjectPath(),
      });
      showTestResults(result);
    }),
    vscode.commands.registerCommand("grove.nodejs.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }
      const result = await runJestTests({
        projectPath: getActiveProjectPath(),
        testFile: editor.document.uri.fsPath,
      });
      showTestResults(result);
    }),
  );

  vscode.window.showInformationMessage("Grove for Node.js activated");
}

function getActiveProjectPath(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath || "";
}

function showTestResults(result: TestResult) {
  if (result.success) {
    vscode.window.showInformationMessage(
      `Tests passed: ${result.passed}/${result.total}`,
    );
  } else {
    vscode.window.showErrorMessage(
      `Tests failed: ${result.failed}/${result.total}`,
    );
  }
}

export function deactivate() {}
```

### 1.3 Create packages/grove-nodejs/src/test-runner.ts

```typescript
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
}

export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;


/**
 * Detect if a project uses Jest.
 */
export async function detectJestProject(projectPath: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Check devDependencies and dependencies for jest
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "jest" in deps;
  } catch {
    return false;
  }
}
```

---

## Task 2: Implement grove_run_tests MCP Tool

### 2.1 Add tool to packages/grove-mcp-server/src/index.ts

Update ListToolsRequestSchema handler:

```typescript
{
  name: "grove_run_tests",
  description: "Run tests in a Grove project. Returns test results including pass/fail counts and output.",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description: "Optional: Project root path if multiple projects exist",
      },
      testFile: {
        type: "string",
        description: "Optional: Specific test file to run (relative path)",
      },
      language: {
        type: "string",
        enum: ["nodejs", "python", "go", "java", "csharp", "mongosh"],
        description: "Optional: Override auto-detected language",
      },
      timeout: {
        type: "number",
        description: "Optional: Timeout in seconds (default: 60, max: 300)",
      },
    },
    required: [],
  },
}
```

### 2.2 Create packages/grove-mcp-server/src/tools/run-tests.ts

```typescript
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { detectLanguage, isPathWithinBoundary } from "@grove/shared";

const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 300_000;

// Allowlisted test commands per language
const TEST_RUNNERS: Record<string, { cmd: string; args: string[] }> = {
  nodejs: { cmd: "npx", args: ["jest", "--json", "--testLocationInResults"] },
  python: { cmd: "python", args: ["-m", "pytest", "--tb=short", "-q"] },
  go: { cmd: "go", args: ["test", "-json", "./..."] },
  java: { cmd: "mvn", args: ["test", "-B"] },
  csharp: { cmd: "dotnet", args: ["test", "--logger:console"] },
  mongosh: { cmd: "npx", args: ["jest", "--json"] },
};

export async function handleRunTests(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const projectPath = (args.projectPath as string) || "";
  const testFile = args.testFile as string | undefined;
  const languageOverride = args.language as string | undefined;
  const timeoutSeconds = args.timeout as number | undefined;

  if (!workspacePath) {
    return {
      isError: true,
      content: [{ type: "text", text: "GROVE_WORKSPACE not set." }],
    };
  }

  // Resolve and validate project path
  const fullProjectPath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;

  if (!isPathWithinBoundary(fullProjectPath, workspacePath)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Project path outside workspace." }],
    };
  }

  // Detect or use provided language
  const language = languageOverride || (await detectLanguage(fullProjectPath));

  if (!language || !TEST_RUNNERS[language]) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unsupported or undetected language: ${language || "unknown"}. Supported: ${Object.keys(TEST_RUNNERS).join(", ")}`,
        },
      ],
    };
  }

  // Validate test file path if provided
  if (testFile) {
    const fullTestPath = path.resolve(fullProjectPath, testFile);
    if (!isPathWithinBoundary(fullTestPath, workspacePath)) {
      return {
        isError: true,
        content: [{ type: "text", text: "Test file path outside workspace." }],
      };
    }
  }

  // Calculate timeout
  const timeout = Math.min((timeoutSeconds || 60) * 1000, MAX_TIMEOUT);

  // Get runner config
  const runner = TEST_RUNNERS[language];
  const runArgs = [...runner.args];

  // Add test file to args if specified
  if (testFile && language === "nodejs") {
    runArgs.push(testFile);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timedOut = false;

    const proc = spawn(runner.cmd, runArgs, {
      cwd: fullProjectPath,
      env: { ...process.env, CI: "true" },
      shell: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeout);

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (timedOut) {
        resolve({
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "timeout",
                message: `Test execution timed out after ${timeout / 1000} seconds`,
                duration,
              }),
            },
          ],
        });
        return;
      }

      // Try to parse JSON output (Jest)
      let result;
      if (language === "nodejs") {
        try {
          const jsonResult = JSON.parse(output);
          result = {
            success: jsonResult.success,
            total: jsonResult.numTotalTests,
            passed: jsonResult.numPassedTests,
            failed: jsonResult.numFailedTests,
            skipped: jsonResult.numPendingTests,
            duration,
          };
        } catch {
          result = {
            success: code === 0,
            output: output.slice(0, 10000), // Cap output size
            duration,
          };
        }
      } else {
        result = {
          success: code === 0,
          output: output.slice(0, 10000),
          duration,
        };
      }

      resolve({
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    });
  });
}
```

### 2.3 Update packages/grove-mcp-server/src/index.ts CallToolRequestSchema

```typescript
import { handleRunTests } from "./tools/run-tests";

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "grove_get_status":
      return handleGetStatus(args || {});
    case "grove_read_file":
      return handleReadFile(args || {});
    case "grove_run_tests":
      return handleRunTests(args || {});
    default:
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
  }
});
```

---

## Task 3: Extension API for Test Runner Registration

### 3.1 Update packages/grove-core/src/extension.ts exports

Expose API for language extensions to register test runners:

```typescript
import * as vscode from "vscode";

export interface TestRunner {
  language: string;
  name: string;
  run: (options: {
    projectPath: string;
    testFile?: string;
  }) => Promise<TestResult>;
  detect: (projectPath: string) => Promise<boolean>;
}

export interface TestResult {
  success: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  output?: string;
  duration: number;
}

const registeredRunners: Map<string, TestRunner> = new Map();

// Export API for language extensions
export function getApi() {
  return {
    registerTestRunner(runner: TestRunner) {
      registeredRunners.set(runner.language, runner);
      console.log(
        `Registered test runner: ${runner.name} for ${runner.language}`,
      );
    },
    getTestRunner(language: string): TestRunner | undefined {
      return registeredRunners.get(language);
    },
    listTestRunners(): string[] {
      return Array.from(registeredRunners.keys());
    },
  };
}

export async function activate(context: vscode.ExtensionContext) {
  // ... existing activation code ...

  // Return API for other extensions
  return getApi();
}
```

---

## Task 4: Concurrent Execution Queue

### 4.1 Create packages/grove-mcp-server/src/execution-queue.ts

```typescript
type QueuedTask<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

/**
 * Simple execution queue to prevent concurrent tool executions.
 * Max 1 execution per tool type at a time.
 */
export class ExecutionQueue {
  private queues: Map<string, QueuedTask<unknown>[]> = new Map();
  private running: Set<string> = new Set();

  async enqueue<T>(toolName: string, execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: QueuedTask<T> = { execute, resolve, reject };

      if (!this.queues.has(toolName)) {
        this.queues.set(toolName, []);
      }

      this.queues.get(toolName)!.push(task as QueuedTask<unknown>);
      this.processQueue(toolName);
    });
  }

  private async processQueue(toolName: string): Promise<void> {
    if (this.running.has(toolName)) {
      return; // Already processing this queue
    }

    const queue = this.queues.get(toolName);
    if (!queue || queue.length === 0) {
      return;
    }

    this.running.add(toolName);
    const task = queue.shift()!;

    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (error) {
      task.reject(error as Error);
    } finally {
      this.running.delete(toolName);
      this.processQueue(toolName); // Process next in queue
    }
  }
}

export const globalQueue = new ExecutionQueue();
```

### 4.2 Use queue in MCP server handlers

Update the CallToolRequestSchema handler to use the queue:

```typescript
import { globalQueue } from "./execution-queue";

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Queue execution for tools that modify state or take time
  const queuedTools = ["grove_run_tests", "grove_create_example"];

  if (queuedTools.includes(name)) {
    return globalQueue.enqueue(name, async () => {
      switch (name) {
        case "grove_run_tests":
          return handleRunTests(args || {});
        default:
          throw new Error(`Unknown queued tool: ${name}`);
      }
    });
  }

  // Direct execution for fast, read-only tools
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

## Task 5: Testing

### 5.1 Create packages/grove-mcp-server/src/**tests**/run-tests.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleRunTests } from "../tools/run-tests";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("grove_run_tests tool", () => {
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

  it("should reject unknown languages", async () => {
    const result = await handleRunTests({ language: "unknown-lang" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported");
  });

  it("should reject project paths outside workspace", async () => {
    const result = await handleRunTests({ projectPath: "../../../etc" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside workspace");
  });

  it("should reject test file paths outside workspace", async () => {
    const result = await handleRunTests({
      language: "nodejs",
      testFile: "../../../etc/passwd",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside workspace");
  });

  it("should enforce timeout limits", async () => {
    const result = await handleRunTests({
      language: "nodejs",
      timeout: 9999, // Should be capped to 300
    });
    // Test that it doesn't wait 9999 seconds
    // (actual test would need a mock or real project)
  });
});
```

### 5.2 Create packages/grove-mcp-server/src/**tests**/execution-queue.test.ts

```typescript
import { describe, it, expect } from "vitest";
import { ExecutionQueue } from "../execution-queue";

describe("ExecutionQueue", () => {
  it("should execute tasks sequentially for same tool", async () => {
    const queue = new ExecutionQueue();
    const order: number[] = [];

    const task1 = queue.enqueue("test-tool", async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 1;
    });

    const task2 = queue.enqueue("test-tool", async () => {
      order.push(2);
      return 2;
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2]);
  });

  it("should execute different tools in parallel", async () => {
    const queue = new ExecutionQueue();
    const startTimes: Record<string, number> = {};

    const task1 = queue.enqueue("tool-a", async () => {
      startTimes["a"] = Date.now();
      await new Promise((r) => setTimeout(r, 50));
      return "a";
    });

    const task2 = queue.enqueue("tool-b", async () => {
      startTimes["b"] = Date.now();
      return "b";
    });

    await Promise.all([task1, task2]);

    // Both should start at roughly the same time
    expect(Math.abs(startTimes["a"] - startTimes["b"])).toBeLessThan(20);
  });
});
```

---

## Acceptance Criteria

Phase 1c is complete when:

- [ ] Grove for Node.js extension activates when grove-core is present
- [ ] "Grove: Run Node.js Tests" command runs Jest and shows results
- [ ] "Grove: Run Current Test File" runs tests for the active file
- [ ] `grove_run_tests` MCP tool returns JSON with pass/fail counts
- [ ] Test timeout enforced (default 60s, max 300s)
- [ ] Path traversal rejected for project/test file paths
- [ ] Concurrent test executions are queued (max 1 per tool)
- [ ] All unit tests pass (`pnpm test`)

---

## Security Checklist

- [ ] Test runner commands are allowlisted (no arbitrary command execution)
- [ ] Project and test file paths validated within workspace
- [ ] Timeout enforced to prevent hanging tests
- [ ] Test output capped at 10KB to prevent memory issues
- [ ] CI=true environment variable set to prevent interactive prompts

  output: string;
  duration: number;
  }

const DEFAULT_TIMEOUT = 60_000; // 60 seconds
const MAX_TIMEOUT = 300_000; // 300 seconds (5 minutes)

/\*\*

- Run Jest tests in the specified project.
  \*/
  export async function runJestTests(options: TestRunOptions): Promise<TestResult> {
  const { projectPath, testFile, timeout = DEFAULT_TIMEOUT } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);

const args = ["--json", "--testLocationInResults"];
if (testFile) {
args.push(testFile);
}

return new Promise((resolve) => {
const startTime = Date.now();
let output = "";
let timedOut = false;

    // Find jest binary
    const jestPath = path.join(projectPath, "node_modules", ".bin", "jest");

    const proc = spawn(jestPath, args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true" },
      shell: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, effectiveTimeout);

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (timedOut) {
        resolve({
          success: false,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          output: `Test execution timed out after ${effectiveTimeout / 1000} seconds`,
          duration,
        });
        return;
      }

      try {
        const jsonResult = JSON.parse(output);
        resolve({
          success: jsonResult.success,
          total: jsonResult.numTotalTests,
          passed: jsonResult.numPassedTests,
          failed: jsonResult.numFailedTests,
          skipped: jsonResult.numPendingTests,
          output,
          duration,
        });
      } catch {
        resolve({
          success: code === 0,
          total: 0,
          passed: 0,
          failed: code === 0 ? 0 : 1,
          skipped: 0,
          output,
          duration,
        });
      }
    });

});
}
