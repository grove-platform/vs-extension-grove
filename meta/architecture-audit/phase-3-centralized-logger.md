# Phase 3: Centralized Logger & Output Channel

## Goal

Replace ad-hoc `console.log` calls and duplicated output channel creation with a centralized logger module. All Grove components should log through a single `LogOutputChannel` and share a single "Grove Tests" output channel.

## Prerequisites

- Phase 1 complete (stale `console.log` calls removed in 1.4 and 1.5).
- Phase 2 complete (no dependency, but keeps phases sequential).

## Context

Currently:

- `extension.ts` creates a `LogOutputChannel` named "Grove" (`outputChannel`) but keeps it module-scoped — no other module can access it.
- `extension.ts` and `test-codelens/index.ts` each call `vscode.window.createOutputChannel("Grove Tests")` on every test invocation.
- `test-runner-api.ts` previously used `console.log` (removed in Phase 1).

## Tasks

### 3.1 Create a logger module

**Create** `packages/grove-core/src/logger.ts`:

```ts
import * as vscode from "vscode";

let _logChannel: vscode.LogOutputChannel | undefined;
let _testChannel: vscode.OutputChannel | undefined;

/**
 * Initialize the logging channels. Call once during extension activation.
 */
export function initLogger(context: vscode.ExtensionContext): void {
  _logChannel = vscode.window.createOutputChannel("Grove", { log: true });
  context.subscriptions.push(_logChannel);

  _testChannel = vscode.window.createOutputChannel("Grove Tests");
  context.subscriptions.push(_testChannel);
}

/**
 * The shared Grove log output channel.
 * Use log.info(), log.warn(), log.error(), log.debug().
 */
export function getLogChannel(): vscode.LogOutputChannel {
  if (!_logChannel) {
    throw new Error("Logger not initialized. Call initLogger() first.");
  }
  return _logChannel;
}

/**
 * The shared "Grove Tests" output channel for test results.
 */
export function getTestOutputChannel(): vscode.OutputChannel {
  if (!_testChannel) {
    throw new Error("Logger not initialized. Call initLogger() first.");
  }
  return _testChannel;
}
```

### 3.2 Update extension.ts to use the logger module

**File:** `packages/grove-core/src/extension.ts`

1. Add import:

   ```ts
   import { initLogger, getLogChannel, getTestOutputChannel } from "./logger";
   ```

2. In `activate()`, replace:

   ```ts
   outputChannel = vscode.window.createOutputChannel("Grove", { log: true });
   context.subscriptions.push(outputChannel);
   ```

   with:

   ```ts
   initLogger(context);
   const outputChannel = getLogChannel();
   ```

3. Remove the module-level `let outputChannel: vscode.LogOutputChannel;` declaration.

4. In the `grove.runTests` command handler, replace:

   ```ts
   const testOutputChannel = vscode.window.createOutputChannel("Grove Tests");
   ```

   with:

   ```ts
   const testOutputChannel = getTestOutputChannel();
   ```

5. All existing `outputChannel.info(...)`, `outputChannel.warn(...)` calls within `activate()` should continue to work since `outputChannel` is now a local const.

### 3.3 Update test-codelens/index.ts to use the shared test output channel

**File:** `packages/grove-core/src/test-codelens/index.ts`

1. Add import:

   ```ts
   import { getTestOutputChannel } from "../logger";
   ```

2. In `runTestBlock()`, replace:
   ```ts
   const testOutputChannel = vscode.window.createOutputChannel("Grove Tests");
   ```
   with:
   ```ts
   const testOutputChannel = getTestOutputChannel();
   ```

### 3.4 Use logger in test-runner-api.ts (optional, to restore logging)

**File:** `packages/grove-core/src/test-runner-api.ts`

Phase 1 removed the `console.log` from `registerTestRunner`. If you want to restore this log message using the proper channel, add:

```ts
import { getLogChannel } from "./logger";
```

And in `registerTestRunner`:

```ts
export function registerTestRunner(runner: TestRunner): void {
  registeredRunners.set(runner.language, runner);
  getLogChannel().info(
    `Registered test runner "${runner.name}" for ${runner.language}`,
  );
}
```

This is optional. If the log message is not useful, leave the function body as just the `set` call.

## Validation

1. Run `pnpm build` from the repo root. Must succeed.
2. Run `pnpm test` from the repo root. All tests must pass.
3. Grep for `createOutputChannel` in `packages/grove-core/src/` — should appear only in `logger.ts` (twice: once for "Grove", once for "Grove Tests"). Test setup files (`__tests__/setup.ts`) may also contain mocks — that is fine.
4. Grep for `console.log` in `packages/grove-core/src/` (excluding `__tests__/`) — should return zero results.
