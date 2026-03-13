# Phase 4: Consolidate Test Execution Flow

## Goal

Eliminate the duplication between `grove.runTests` (in `extension.ts`, lines 278-410) and `runTestBlock` (in `test-codelens/index.ts`, lines 88-210). Both flows detect projects, find runners, create output channels, run tests, and display results — with slight variations in options. Extract a shared helper so both call sites become thin wrappers.

## Prerequisites

- Phase 3 complete (`getTestOutputChannel()` exists in `logger.ts`; both call sites already use it).

## Context

### Current duplication

| Concern              | `grove.runTests` (extension.ts)                                                   | `runTestBlock` (test-codelens/index.ts)                             |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Detect projects      | `detectGroveProjects(workspaceRoot)`                                              | `detectGroveProjects(workspaceRoot)`                                |
| Find runner          | `findTestRunnerForProject(projectPath)`                                           | `findTestRunnerForProject(project.rootPath)`                        |
| Output channel       | `vscode.window.createOutputChannel("Grove Tests")` (now `getTestOutputChannel()`) | same                                                                |
| Run tests            | `runTests({ projectPath, env })`                                                  | `runTests({ projectPath, testFile, testNamePattern })`              |
| Connection injection | Yes — reads `mongoConnectionManager`                                              | No                                                                  |
| Connection masking   | Yes — calls `maskConnectionString`                                                | No                                                                  |
| CodeLens refresh     | No                                                                                | Yes — `codeLensProvider.setRunning/clearRunning`, decoration update |
| Result store         | No                                                                                | Yes — `testResultStore.set(...)`                                    |

### Overlap to extract

The test execution and result display logic can be shared:

1. Get workspace root; detect projects; find the project for the active file.
2. Find a test runner.
3. Call `runTests(...)`.
4. Format and display results in the shared "Grove Tests" output channel.
5. Show information/error message with optional "Show Output" button.

Connection injection/masking and CodeLens refresh are call-site-specific — they can remain in their respective wrappers.

## Tasks

### 4.1 Create a shared test-execution helper

**Create** `packages/grove-core/src/test-execution.ts`:

```ts
import * as vscode from "vscode";
import { detectGroveProjects, findProjectForFile } from "@grove/shared";
import type { GroveProject } from "@grove/shared";
import { findTestRunnerForProject, runTests } from "./test-runner-api";
import { getTestOutputChannel } from "./logger";

export interface TestRunOptions {
  /** The project to run tests in. If omitted, auto-detect from active file. */
  project?: GroveProject;
  /** Relative path to the specific test file. */
  testFile?: string;
  /** Pattern to match test names (for targeted test runs). */
  testNamePattern?: string;
  /** Additional env variables to inject (e.g., CONNECTION_STRING). */
  env?: Record<string, string>;
}

export interface ResolvedProject {
  project: GroveProject;
  allProjects: GroveProject[];
}

/**
 * Resolve the Grove project for the current context.
 * Returns undefined if no project can be determined.
 */
export async function resolveProject(
  activeFilePath?: string,
): Promise<ResolvedProject | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder open");
    return undefined;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const projects = await detectGroveProjects(workspaceRoot);

  if (projects.length === 0) {
    vscode.window.showErrorMessage(
      "No Grove project detected. Create a snip.js file to define a Grove project.",
    );
    return undefined;
  }

  const filePath =
    activeFilePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!filePath) {
    const projectList = projects
      .map((p) => p.relativePath || "root")
      .join(", ");
    vscode.window.showErrorMessage(
      `Cannot determine which Grove project to test. Open a file within a Grove project and try again. Detected projects: ${projectList}`,
    );
    return undefined;
  }

  const project = findProjectForFile(filePath, projects);
  if (!project) {
    const projectList = projects
      .map((p) => p.relativePath || "root")
      .join(", ");
    vscode.window.showErrorMessage(
      `Cannot determine which Grove project to test. Open a file within a Grove project and try again. Detected projects: ${projectList}`,
    );
    return undefined;
  }

  return { project, allProjects: projects };
}

/**
 * Execute tests and display results in the shared "Grove Tests" output channel.
 *
 * Handles runner lookup, progress notification, output channel writing,
 * and pass/fail messaging. Call-site-specific concerns (connection masking,
 * CodeLens refresh) are left to the caller via the returned result.
 */
export async function executeTests(
  projectPath: string,
  opts: Omit<TestRunOptions, "project"> = {},
) {
  const runner = await findTestRunnerForProject(projectPath);
  if (!runner) {
    vscode.window.showWarningMessage(
      "No test runner found. Install a Grove language extension (e.g., Grove for Node.js).",
    );
    return undefined;
  }

  const result = await runTests({
    projectPath,
    testFile: opts.testFile,
    testNamePattern: opts.testNamePattern,
    env: opts.env,
  });

  return { result, runner };
}

/**
 * Write test results to the "Grove Tests" output channel and show a
 * pass/fail notification.
 */
export function displayTestResults(
  output: string,
  result: {
    success: boolean;
    passed?: number;
    failed?: number;
    total?: number;
    duration: number;
  },
  label: string,
  extraLines?: string[],
): void {
  const ch = getTestOutputChannel();
  ch.clear();
  ch.appendLine("=== Grove Test Results ===");
  ch.appendLine(`Test: ${label}`);
  ch.appendLine(`Duration: ${result.duration}ms`);
  ch.appendLine(`Success: ${result.success}`);
  if (extraLines) {
    for (const line of extraLines) {
      ch.appendLine(line);
    }
  }
  ch.appendLine("");
  ch.appendLine(output);

  if (result.success) {
    const msg =
      result.total != null
        ? `Tests passed: ${result.passed ?? 0}/${result.total}`
        : `✓ ${label}`;
    vscode.window.showInformationMessage(msg);
  } else {
    const msg =
      result.total != null && result.total > 0
        ? `Tests failed: ${result.failed ?? 0}/${result.total}`
        : `Test runner failed. Check output for details.`;
    vscode.window.showErrorMessage(msg, "Show Output").then((action) => {
      if (action === "Show Output") {
        ch.show();
      }
    });
  }
}
```

### 4.2 Refactor grove.runTests in extension.ts

**File:** `packages/grove-core/src/extension.ts`

Replace the `grove.runTests` command body with:

```ts
import {
  resolveProject,
  executeTests,
  displayTestResults,
} from "./test-execution";

// Inside the command handler:
context.subscriptions.push(
  vscode.commands.registerCommand("grove.runTests", async () => {
    const resolved = await resolveProject();
    if (!resolved) return;

    const projectPath = resolved.project.rootPath;

    // Check MongoDB connection for env injection
    let env: Record<string, string> | undefined;
    let connectionString: string | null = null;
    const usingUiConnection = mongoConnectionManager?.status.connected;

    if (usingUiConnection) {
      connectionString = mongoConnectionManager.getConnectionStringForTests();
      if (connectionString) {
        env = { CONNECTION_STRING: connectionString };
      }
    }

    const progressTitle = usingUiConnection
      ? "Running tests (using Grove MongoDB connection)..."
      : "Running tests...";

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: false,
      },
      async () => {
        const outcome = await executeTests(projectPath, { env });
        if (!outcome) return;

        let sanitizedOutput = outcome.result.output ?? "";
        if (connectionString && sanitizedOutput.includes(connectionString)) {
          const masked = maskConnectionString(connectionString);
          sanitizedOutput = sanitizedOutput.replaceAll(
            connectionString,
            masked,
          );
          outputChannel.warn(
            "Connection string was detected in test output and has been masked.",
          );
        }

        const extraLines = usingUiConnection
          ? ["MongoDB: Using Grove extension connection"]
          : undefined;

        displayTestResults(
          sanitizedOutput,
          outcome.result,
          outcome.runner.name,
          extraLines,
        );
      },
    );
  }),
);
```

Remove the import of `detectGroveProjects`, `findProjectForFile` from `@grove/shared` **only if** no other code in extension.ts still references them. The `getStatus()` function also calls `detectGroveProjects`, so it will still be needed. Keep the import but remove `findProjectForFile` if unused.

### 4.3 Refactor runTestBlock in test-codelens/index.ts

**File:** `packages/grove-core/src/test-codelens/index.ts`

Replace the body of `runTestBlock()` to use the shared helpers:

```ts
import {
  resolveProject,
  executeTests,
  displayTestResults,
} from "../test-execution";

async function runTestBlock(
  uri: vscode.Uri,
  testNamePattern: string,
  testName: string,
  blockType: string,
  debug: boolean,
): Promise<void> {
  const resolved = await resolveProject(uri.fsPath);
  if (!resolved) return;

  const project = resolved.project;
  const displayType = blockType === "describe" ? "suite" : "test";
  const action = debug ? "Debugging" : "Running";

  codeLensProvider.setRunning(uri, testNamePattern);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${action} ${displayType}: "${testName}"`,
        cancellable: false,
      },
      async () => {
        const relativeTestFile = path.relative(project.rootPath, uri.fsPath);

        const outcome = await executeTests(project.rootPath, {
          testFile: relativeTestFile,
          testNamePattern,
        });
        if (!outcome) return;

        // Store results for decorations and hover
        const document = await vscode.workspace.openTextDocument(uri);
        const blocks = parseTestBlocks(document);
        const block = blocks.find(
          (b) => buildTestNamePattern(b) === testNamePattern,
        );

        testResultStore.set(uri, testNamePattern, {
          passed: outcome.result.success,
          duration: outcome.result.duration,
          line: block?.line ?? 0,
          errorMessage: outcome.result.success
            ? undefined
            : extractErrorMessage(outcome.result.output),
        });

        // Update decorations
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === uri.toString()) {
          updateDecorationsForEditor(editor);
        }

        displayTestResults(
          outcome.result.output ?? "",
          outcome.result,
          testName,
        );
      },
    );
  } finally {
    codeLensProvider.clearRunning();
  }
}
```

Remove the now-unused imports: `detectGroveProjects`, `findProjectForFile`, `findTestRunnerForProject`, `runTests`.

### 4.4 Clean up imports

After refactoring both files:

1. In `extension.ts`: remove `findProjectForFile` from the `@grove/shared` import if unused; remove `findTestRunnerForProject` and `runTests` from `./test-runner-api` import if unused (check `getApi()` — it spreads `getTestRunnerApi()`, so keep that).
2. In `test-codelens/index.ts`: remove `detectGroveProjects`, `findProjectForFile` from `@grove/shared`; remove `findTestRunnerForProject`, `runTests` from `../test-runner-api`.

## Validation

1. `pnpm build` must succeed.
2. `pnpm test` must pass.
3. Grep for `detectGroveProjects` in `packages/grove-core/src/` — should only appear in:
   - `extension.ts` (inside `getStatus()` and `detectProjectsWithProgress()`)
   - `test-execution.ts` (inside `resolveProject()`)
4. Grep for `createOutputChannel` in `packages/grove-core/src/` (excluding tests) — should only appear in `logger.ts`.
5. Grep for `findTestRunnerForProject` — should only appear in `test-runner-api.ts` (definition) and `test-execution.ts` (usage).
