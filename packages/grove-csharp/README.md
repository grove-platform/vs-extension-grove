# Grove for C#

A VS Code extension that adds C# test runner support to Grove via `dotnet test`. This extension integrates with `grove-core` to provide seamless test execution for C# code examples.

## Overview

Grove for C# activates alongside Grove Core when a workspace contains a `snip.js` file. It:

- Registers a C# test runner with Grove Core's test runner API
- Runs the project's tests with **`dotnet test`**
- Parses `dotnet test` output to display results in VS Code

## Requirements

- **Grove Core** (`GrovePlatform.grove-platform-core`) must be installed
- The **.NET SDK** (`dotnet`) available on `PATH`, or configured via the `dotnet.dotnetPath` setting

### Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `grove.csharp.testTimeoutSeconds` | `300` | Max seconds to wait for `dotnet test` (includes project build time) |

## Commands

| Command                    | Title                            | Description                          |
| -------------------------- | -------------------------------- | ------------------------------------ |
| `grove.csharp.runTests`    | Grove: Run C# Tests              | Run all tests in the current project |
| `grove.csharp.runTestFile` | Grove: Run Current C# Test File  | Run tests in the active file only    |

The language-specific commands above call `dotnet test` directly and use the Grove C# output channel. For Grove's shared test environment behavior (`.env` loading, MongoDB connection injection from the Grove UI, and masked connection strings), prefer the core commands **Grove: Run Tests** and **Grove: Run Current Test File**.

## Architecture

```
grove-csharp/
├── src/
│   ├── extension.ts      # Extension entry point, Grove Core integration
│   └── test-runner.ts    # dotnet test args, spawn, output parsing
└── package.json          # Extension manifest
```

### Extension Activation

On activation, the extension:

1. Gets the Grove Core extension API
2. Registers the C# test runner via `coreApi.registerTestRunner()`
3. Registers C#-specific commands

```typescript
coreApi.registerTestRunner({
  language: "csharp",
  name: "C#",
  run: runCSharpWithConfiguredDotnet,
  detect: detectCSharpProject,
});
```

### Test Runner

The test runner (`test-runner.ts`) provides:

#### `detectCSharpProject(projectPath: string): Promise<boolean>`

Detects C# projects by checking for a `*.csproj` or `*.sln` file, matching `@grove/shared` language detection.

#### `runCSharpTests(options: TestRunOptions): Promise<TestResult>`

Runs tests with `dotnet test`:

| Scope        | Command                                                        |
| ------------ | -------------------------------------------------------------- |
| All tests    | `dotnet test Tests/Tests.csproj --nologo --verbosity normal`  |
| Single file  | `dotnet test Tests/Tests.csproj ... --filter FullyQualifiedName~<ClassName>` |
| Name pattern | `dotnet test ... --filter DisplayName~<pattern>`              |

`dotnet test` has no direct "run this file" concept, so a single-file run is
approximated by filtering on the class name derived from the file's base name
(test classes conventionally match their file name). A test file scope and a
name pattern are ANDed into one `--filter` expression.

`dotnet` resolution (in order):

1. Explicit `dotnetPath` override (highest priority)
2. VS Code's **`dotnet.dotnetPath`** setting
3. System `dotnet` on `PATH`

The output channel shows `Using dotnet: ...` so you can verify which executable ran.

Also:

- Injects environment variables (including `CONNECTION_STRING` from Grove UI)
- Enforces timeout limits (default: 300s, max: 300s; configure via `grove.csharp.testTimeoutSeconds`)
- If `dotnet` cannot be spawned (missing binary, permission), the run fails immediately with a clear error instead of hanging until timeout
- Sums pass/fail/skip counts across multiple test-project summary lines

## Integration with Grove Core

Grove for C# is a **companion extension** that extends Grove Core's functionality. When users run `Grove: Run Tests` or `Grove: Run Current Test File` (the core commands), Grove Core automatically delegates to this extension's C# runner for C# projects.

Test commands are disabled in untrusted workspaces. Grove validates that single-file runs stay within the detected Grove project boundary (including symlink traversal) before invoking `dotnet test`.

## Development

From the repository root:

```bash
# Install dependencies
pnpm --filter grove-platform-csharp install

# Build the extension
pnpm --filter grove-platform-csharp build

# Run tests
pnpm --filter grove-platform-csharp test

# Watch mode
pnpm --filter grove-platform-csharp watch
```
