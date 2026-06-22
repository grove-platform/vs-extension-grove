# Phase 3: Multi-Language Extensions + Polish

**Goal**: Create language extensions for Python, Go, Java, C#, and mongosh. Polish the Grove Panel UI and add final features.

**Validates**: Extension pack pattern works across all supported languages.

**Depends on**: Phase 2 completed.

---

## Prerequisites

- Phase 2 complete and passing all tests
- Understanding of each language's test framework

---

## Task 1: Create Python Extension

### 1.1 Create packages/grove-python/package.json

```json
{
  "name": "grove-python",
  "displayName": "Grove for Python",
  "description": "Python/pytest support for Grove documentation testing",
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
        "command": "grove.python.runTests",
        "title": "Grove: Run Python Tests"
      }
    ]
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node"
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

### 1.2 Create packages/grove-python/src/extension.ts

```typescript
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) {
    vscode.window.showErrorMessage("Grove Core extension not found");
    return;
  }

  await groveCore.activate();
  const coreApi = groveCore.exports;

  if (coreApi?.registerTestRunner) {
    coreApi.registerTestRunner({
      language: "python",
      name: "Python",
      run: runPythonTests,
      detect: detectPythonProject,
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.python.runTests", async () => {
      const result = await runPythonTests({
        projectPath: getActiveProjectPath(),
      });
      showTestResults(result);
    }),
  );

  vscode.window.showInformationMessage("Grove for Python activated");
}

async function runPythonTests(options: {
  projectPath: string;
  testFile?: string;
}) {
  const { projectPath, testFile } = options;
  const args = ["-m", "pytest", "--tb=short", "-q"];
  if (testFile) args.push(testFile);

  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const startTime = Date.now();
    let output = "";

    const proc = spawn("python", args, {
      cwd: projectPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code: number) => {
      resolve({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
      });
    });
  });
}

async function detectPythonProject(projectPath: string): Promise<boolean> {
  const fs = require("fs/promises");
  const path = require("path");

  try {
    await fs.access(path.join(projectPath, "pyproject.toml"));
    return true;
  } catch {
    try {
      await fs.access(path.join(projectPath, "pytest.ini"));
      return true;
    } catch {
      return false;
    }
  }
}

function getActiveProjectPath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function showTestResults(result: { success: boolean; output?: string }) {
  if (result.success) {
    vscode.window.showInformationMessage("Python tests passed!");
  } else {
    vscode.window.showErrorMessage(
      "Python tests failed. Check output for details.",
    );
  }
}

export function deactivate() {}
```

---

## Task 2: Create Go Extension

### 2.1 Create packages/grove-go/package.json

Same structure as Python, with Go-specific commands and title.

### 2.2 Create packages/grove-go/src/extension.ts

```typescript
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) {
    vscode.window.showErrorMessage("Grove Core extension not found");
    return;
  }

  await groveCore.activate();
  const coreApi = groveCore.exports;

  if (coreApi?.registerTestRunner) {
    coreApi.registerTestRunner({
      language: "go",
      name: "go test",
      run: runGoTests,
      detect: detectGoProject,
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.go.runTests", async () => {
      const result = await runGoTests({ projectPath: getActiveProjectPath() });
      showTestResults(result);
    }),
  );

  vscode.window.showInformationMessage("Grove for Go activated");
}

async function runGoTests(options: { projectPath: string; testFile?: string }) {
  const { projectPath } = options;

  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const startTime = Date.now();
    let output = "";

    const proc = spawn("go", ["test", "-json", "./..."], {
      cwd: projectPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code: number) => {
      resolve({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
      });
    });
  });
}

async function detectGoProject(projectPath: string): Promise<boolean> {
  const fs = require("fs/promises");
  const path = require("path");

  try {
    await fs.access(path.join(projectPath, "go.mod"));
    return true;
  } catch {
    return false;
  }
}

function getActiveProjectPath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function showTestResults(result: { success: boolean; output?: string }) {
  if (result.success) {
    vscode.window.showInformationMessage("Go tests passed!");
  } else {
    vscode.window.showErrorMessage(
      "Go tests failed. Check output for details.",
    );
  }
}

export function deactivate() {}
```

---

## Task 3: Create Java Extension

### 3.1 Create packages/grove-java/package.json

Same structure with Java-specific commands.

### 3.2 Create packages/grove-java/src/extension.ts

```typescript
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) return;
  await groveCore.activate();

  const coreApi = groveCore.exports;
  coreApi?.registerTestRunner({
    language: "java",
    name: "JUnit (Maven)",
    run: runMavenTests,
    detect: detectMavenProject,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.java.runTests", async () => {
      const result = await runMavenTests({
        projectPath: getActiveProjectPath(),
      });
      showTestResults(result);
    }),
  );
}

async function runMavenTests(options: { projectPath: string }) {
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const startTime = Date.now();
    let output = "";

    // Use mvn for Maven or gradle for Gradle projects
    const proc = spawn("mvn", ["test", "-B"], {
      cwd: options.projectPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code: number) => {
      resolve({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
      });
    });
  });
}

async function detectMavenProject(projectPath: string): Promise<boolean> {
  const fs = require("fs/promises");
  const path = require("path");

  try {
    await fs.access(path.join(projectPath, "pom.xml"));
    return true;
  } catch {
    try {
      await fs.access(path.join(projectPath, "build.gradle"));
      return true;
    } catch {
      return false;
    }
  }
}

// ... helper functions
```

---

## Task 4: Create C# Extension

### 4.1 Create packages/grove-csharp/package.json

Same structure with C#-specific commands.

### 4.2 Create packages/grove-csharp/src/extension.ts

```typescript
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) return;
  await groveCore.activate();

  const coreApi = groveCore.exports;
  coreApi?.registerTestRunner({
    language: "csharp",
    name: "NUnit (dotnet)",
    run: runDotnetTests,
    detect: detectDotnetProject,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.csharp.runTests", async () => {
      const result = await runDotnetTests({
        projectPath: getActiveProjectPath(),
      });
      showTestResults(result);
    }),
  );
}

async function runDotnetTests(options: { projectPath: string }) {
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const startTime = Date.now();
    let output = "";

    const proc = spawn("dotnet", ["test", "--logger:console"], {
      cwd: options.projectPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code: number) => {
      resolve({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
      });
    });
  });
}

async function detectDotnetProject(projectPath: string): Promise<boolean> {
  const fs = require("fs/promises");
  const { glob } = require("glob");

  try {
    const csprojFiles = await glob("*.csproj", { cwd: projectPath });
    return csprojFiles.length > 0;
  } catch {
    return false;
  }
}
```

---

## Task 5: Create mongosh Extension

### 5.1 Create packages/grove-mongosh/package.json

Same structure with mongosh-specific commands.

### 5.2 Create packages/grove-mongosh/src/extension.ts

```typescript
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");

  if (!groveCore) return;
  await groveCore.activate();

  const coreApi = groveCore.exports;
  coreApi?.registerTestRunner({
    language: "mongosh",
    name: "Jest (mongosh)",
    run: runMongoshTests,
    detect: detectMongoshProject,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.mongosh.runTests", async () => {
      const result = await runMongoshTests({
        projectPath: getActiveProjectPath(),
      });
      showTestResults(result);
    }),
  );
}

async function runMongoshTests(options: { projectPath: string }) {
  // mongosh projects typically use Jest
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const startTime = Date.now();
    let output = "";

    const proc = spawn("npx", ["jest", "--json"], {
      cwd: options.projectPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code: number) => {
      try {
        const json = JSON.parse(output);
        resolve({
          success: json.success,
          total: json.numTotalTests,
          passed: json.numPassedTests,
          failed: json.numFailedTests,
          duration: Date.now() - startTime,
        });
      } catch {
        resolve({
          success: code === 0,
          output,
          duration: Date.now() - startTime,
        });
      }
    });
  });
}

async function detectMongoshProject(projectPath: string): Promise<boolean> {
  const fs = require("fs/promises");
  const path = require("path");

  try {
    const content = await fs.readFile(
      path.join(projectPath, "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(content);
    return pkg.name?.includes("mongosh") || false;
  } catch {
    return false;
  }
}
```

---

## Task 6: Polish Grove Panel UI

### 6.1 Update packages/grove-core/src/panel/GrovePanel.ts

Add these improvements to the webview HTML:

```typescript
private _getHtml(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Grove</title>
  <style>
    :root {
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --border-radius: 4px;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: var(--spacing-md);
      margin: 0;
      line-height: 1.4;
    }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-sm);
    }

    .card-title {
      font-weight: 600;
      font-size: 1.1em;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-success { background: var(--vscode-testing-iconPassed); }
    .status-error { background: var(--vscode-testing-iconFailed); }
    .status-warning { background: var(--vscode-testing-iconQueued); }
    .status-inactive { background: var(--vscode-descriptionForeground); }

    .project-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .project-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .project-item:last-child {
      border-bottom: none;
    }

    .project-name {
      flex: 1;
      font-weight: 500;
    }

    .project-language {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-sm);
    }

    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--border-radius);
      padding: var(--spacing-sm) var(--spacing-md);
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
      transition: background 0.1s;
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-full {
      grid-column: 1 / -1;
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-md) * 2;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 2em;
      margin-bottom: var(--spacing-sm);
    }

    .test-results {
      margin-top: var(--spacing-md);
      padding: var(--spacing-sm);
      background: var(--vscode-textCodeBlock-background);
      border-radius: var(--border-radius);
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .test-summary {
      display: flex;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
    }

    .test-passed { color: var(--vscode-testing-iconPassed); }
    .test-failed { color: var(--vscode-testing-iconFailed); }
    .test-skipped { color: var(--vscode-testing-iconSkipped); }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-md) * 2;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    // ... enhanced JavaScript with better state management
  </script>
</body>
</html>`;
}
```

---

## Task 7: Add Test Output Panel

### 7.1 Create packages/grove-core/src/output/TestOutputChannel.ts

```typescript
import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;

export function getTestOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Grove Test Results");
  }
  return outputChannel;
}

export function showTestOutput(result: {
  success: boolean;
  output?: string;
  passed?: number;
  failed?: number;
  total?: number;
  duration: number;
}): void {
  const channel = getTestOutputChannel();
  channel.clear();

  const timestamp = new Date().toLocaleTimeString();
  channel.appendLine(`=== Grove Test Run - ${timestamp} ===`);
  channel.appendLine("");

  if (result.total !== undefined) {
    channel.appendLine(`Total:   ${result.total}`);
    channel.appendLine(`Passed:  ${result.passed ?? 0}`);
    channel.appendLine(`Failed:  ${result.failed ?? 0}`);
  }

  channel.appendLine(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  channel.appendLine(`Status:  ${result.success ? "PASSED ✓" : "FAILED ✗"}`);

  if (result.output) {
    channel.appendLine("");
    channel.appendLine("--- Output ---");
    channel.appendLine(result.output);
  }

  channel.show(true);
}
```

---

## Task 8: Extension Pack Manifest

### 8.1 Create packages/grove-pack/package.json

```json
{
  "name": "grove",
  "displayName": "Grove Extension Pack",
  "description": "Complete Grove suite for MongoDB documentation testing",
  "version": "0.0.1",
  "publisher": "mongodb",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Extension Packs"],
  "extensionPack": [
    "mongodb.grove-core",
    "mongodb.grove-nodejs",
    "mongodb.grove-python",
    "mongodb.grove-go",
    "mongodb.grove-java",
    "mongodb.grove-csharp",
    "mongodb.grove-mongosh"
  ],
  "keywords": [
    "mongodb",
    "documentation",
    "testing",
    "code examples",
    "bluehawk"
  ]
}
```

---

## Acceptance Criteria

Phase 3 is complete when:

- [ ] All language extensions activate when grove-core is present
- [ ] Each language extension registers its test runner correctly
- [ ] Test commands work for each language (Python, Go, Java, C#, mongosh)
- [ ] Grove Panel UI uses improved styling and components
- [ ] Test output appears in dedicated output channel
- [ ] Extension pack installs all extensions together
- [ ] All unit tests pass (`pnpm test`)
- [ ] Documentation updated with usage instructions

---

## Security Checklist

- [ ] All extensions use allowlisted test commands only
- [ ] No arbitrary command execution from language extensions
- [ ] Test output size limited to prevent memory issues
- [ ] Language detection cannot be manipulated by malicious projects

---

## Final Verification

Before release:

- [ ] Run full test suite across all packages
- [ ] Test in fresh VS Code installation
- [ ] Verify MCP integration with Augment Code
- [ ] Test multi-project workspace scenarios
- [ ] Verify all security constraints work as expected
- [ ] Update CHANGELOG.md with features
- [ ] Create release notes
