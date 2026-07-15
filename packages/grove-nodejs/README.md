# Grove for Node.js

A VS Code extension that adds Node.js/Jest test runner support to Grove. This extension integrates with `grove-core` to provide seamless test execution for JavaScript and TypeScript code examples.

## Overview

Grove for Node.js activates alongside Grove Core when a workspace contains a `snip.js` file. It:

- Registers a Jest test runner with Grove Core's test runner API
- Provides Node.js-specific commands for running tests
- Parses Jest output to display test results in VS Code

## Requirements

- **Grove Core** (`GrovePlatform.grove-platform-core`) must be installed
- Node.js >= 22.0.0
- npm (for running `npm test`)

## Commands

| Command                    | Title                         | Description                          |
| -------------------------- | ----------------------------- | ------------------------------------ |
| `grove.nodejs.runTests`    | Grove: Run Node.js Tests      | Run all tests in the current project |
| `grove.nodejs.runTestFile` | Grove: Run Current Node.js Test File | Run tests in the active file only    |

The language-specific commands above call `npm test` directly and use the Grove Node.js output channel. For Grove's shared test environment behavior (`.env` loading, MongoDB connection injection from the Grove UI, and masked connection strings), prefer the core commands **Grove: Run Tests** and **Grove: Run Current Test File**.

## Architecture

```
grove-nodejs/
├── src/
│   ├── extension.ts      # Extension entry point, Grove Core integration
│   └── test-runner.ts    # Jest execution and output parsing
└── package.json          # Extension manifest
```

### Extension Activation

On activation, the extension:

1. Gets the Grove Core extension API
2. Registers the Jest test runner via `coreApi.registerTestRunner()`
3. Registers Node.js-specific commands

```typescript
coreApi.registerTestRunner({
  language: "nodejs",
  name: "Jest",
  run: runJestTests,
  detect: detectJestProject,
});
```

### Test Runner

The test runner (`test-runner.ts`) provides:

#### `detectJestProject(projectPath: string): Promise<boolean>`

Detects if a project uses Jest/Vitest by checking `package.json` for:

- `jest` or `vitest` in dependencies/devDependencies
- A `test` script in the scripts section

#### `runJestTests(options: TestRunOptions): Promise<TestResult>`

Executes tests using the project's `npm test` script:

- Runs in the project directory with `CI=true` environment variable
- Supports running a specific test file via `-- <testFile>` argument
- Enforces timeout limits (default: 60s, max: 300s)
- Parses Jest output to extract pass/fail counts

```typescript
interface TestRunOptions {
  projectPath: string;   // Absolute path to project root
  testFile?: string;     // Optional specific test file
  timeout?: number;      // Timeout in milliseconds
}

interface TestResult {
  success: boolean;      // Exit code === 0
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  output: string;        // Raw console output
  duration: number;      // Execution time in ms
}
```

### Output Parsing

The runner parses Jest summary lines to extract test counts:

```
Tests: 5 passed, 2 failed, 1 skipped, 8 total
```

If parsing fails, counts default to 0 with success determined by exit code.

## Integration with Grove Core

Grove for Node.js is a **companion extension** that extends Grove Core's functionality. The extension dependency ensures Grove Core activates first:

```json
{
  "extensionDependencies": ["GrovePlatform.grove-platform-core"]
}
```

When users run `Grove: Run Tests` or `Grove: Run Current Test File` (the core commands), Grove Core automatically delegates to this extension's Jest runner for Node.js projects.

Test commands are disabled in untrusted workspaces. Grove validates that single-file runs stay within the detected Grove project boundary before invoking `npm test`.

## Development

```bash
# Build the extension
pnpm --filter grove-nodejs build

# Run tests
pnpm --filter grove-nodejs test

# Watch mode
pnpm --filter grove-nodejs watch
```

## Testing

The extension includes tests in `src/__tests__/` using Vitest. Tests mock VS Code APIs and verify:

- Jest project detection
- Test output parsing
- Command registration

```bash
pnpm --filter grove-nodejs test
```

