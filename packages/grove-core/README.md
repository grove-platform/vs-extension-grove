# Grove Core

The core VS Code extension for the MongoDB documentation code example testing platform. Grove Core provides shared functionality for detecting, managing, and testing code examples across all MongoDB driver documentation.

## Overview

Grove Core activates automatically when VS Code opens a workspace containing a `snip.js` file (the Grove project configuration). It provides:

- **Project Detection** - Automatically discovers Grove projects with caching and file system watching
- **RST Directive Navigation** - CodeLens, go-to-definition, and clickable links for `literalinclude::`, `include::`, and `io-code-block` directives
- **Test CodeLens** - Run/Debug buttons above `describe`/`it`/`test` blocks in test files
- **Snippet References** - Reference counts and navigation for Bluehawk `:snippet-start:` tags
- **Bluehawk Preview** - Live preview of extracted Bluehawk snippets
- **MongoDB Connection** - Secure credential storage with connection string injection for tests
- **Symlink Management** - Creates symlinks from docs projects to shared snippet output

## Architecture

```
grove-core/
├── src/
│   ├── extension.ts          # Main entry point and VS Code lifecycle
│   ├── project-cache.ts      # Cached project detection with FileSystemWatcher
│   ├── test-execution.ts     # Shared test execution logic
│   ├── test-runner-api.ts    # API for language extensions to register test runners
│   ├── logger.ts             # Centralized logging (Grove output channel)
│   ├── diagnostics.ts        # Inline editor diagnostics (symlink warnings)
│   ├── language-status.ts    # Per-file Grove status in editor
│   ├── symlink.ts            # Symlink creation and validation
│   ├── panel/
│   │   ├── GrovePanel.ts     # Activity bar webview panel
│   │   └── ProfilerPanel.ts  # Real-time performance monitoring webview
│   ├── preview/
│   │   ├── BluehawkPreview.ts    # Bluehawk preview webview
│   │   └── bluehawk-runner.ts    # CLI wrapper for bluehawk snip
│   ├── feedback/
│   │   ├── FeedbackPanel.ts          # Bug report / feature request webview
│   │   ├── diagnostics-collector.ts  # Gathers system/extension info
│   │   ├── feedback-submitter.ts     # Handles Jira submission
│   │   ├── jira-url-builder.ts       # Builds Jira create issue URLs
│   │   └── types.ts                  # Feedback type definitions
│   ├── rst/
│   │   ├── LiteralIncludeProviders.ts  # CodeLens, Definition, Links for RST
│   │   ├── directive-parser.ts         # Generic RST directive parser
│   │   ├── literalinclude-parser.ts    # Parses literalinclude options
│   │   ├── extract-resolver.ts         # Resolves extract YAML references
│   │   └── path-resolver.ts            # Symlink-aware path resolution
│   ├── test-codelens/
│   │   ├── TestCodeLensProvider.ts     # Run/Debug CodeLens for tests
│   │   ├── TestHoverProvider.ts        # Hover details for test results
│   │   ├── TestDecorations.ts          # Pass/fail highlighting
│   │   ├── TestResultStore.ts          # Stores test results across runs
│   │   ├── test-parser.ts              # Parses test blocks in source files
│   │   └── utils.ts                    # Shared test utilities
│   ├── snippet-codelens/
│   │   ├── SnippetCodeLensProvider.ts  # Reference count CodeLens
│   │   ├── ripgrep-searcher.ts         # Fast snippet reference search
│   │   ├── reference-searcher.ts       # Reference search abstraction
│   │   └── snippet-parser.ts           # Parses Bluehawk snippet tags
│   └── mongo/
│       ├── connection.ts     # MongoDB client lifecycle (lazy-loaded)
│       ├── commands.ts       # VS Code command handlers
│       └── credentials.ts    # SecretStorage wrapper
├── resources/
│   └── grove-icon.svg        # Activity bar icon
└── package.json              # Extension manifest and contributions
```

## VS Code Integration

### Activation

The extension activates on the `workspaceContains:**/snip.js` event. On activation, it:

1. Initializes the centralized logger (`Grove` output channel)
2. Sets up the project cache with a `FileSystemWatcher` on `**/snip.js`
3. Detects Grove projects with a progress indicator
4. Initializes diagnostics and language status
5. Registers all CodeLens providers, commands, and language features
6. Attempts MongoDB reconnection with stored credentials
7. Returns the API for language extensions

### Commands

| Command                           | Title                                       | Description                                         |
| --------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `grove.runTests`                  | Grove: Run Tests                            | Run tests using the detected language runner        |
| `grove.createSymlink`             | Grove: Create Symlink for Documentation     | Create symlink from docs to code-examples           |
| `grove.connectMongo`              | Grove: Connect to MongoDB                   | Connect with a connection string                    |
| `grove.disconnectMongo`           | Grove: Disconnect from MongoDB              | Disconnect and clear session                        |
| `grove.showDatabases`             | Grove: Show Databases                       | List databases on the connected MongoDB cluster     |
| `grove.openBluehawkPreview`       | Grove: Open Bluehawk Preview                | Show Bluehawk output for current file               |
| `grove.sendFeedback`              | Grove: Send Feedback                        | Open feedback panel to report bugs/request features |
| `grove.showPerformanceReport`     | Grove: Show Performance Report (Debug)      | Display profiling stats in output channel           |
| `grove.clearPerformanceStats`     | Grove: Clear Performance Statistics (Debug) | Reset all profiling data                            |
| `grove.savePerformanceReport`     | Grove: Save Performance Report (Debug)      | Save profiling data to a file                       |
| `grove.comparePerformanceReports` | Grove: Compare Performance Reports (Debug)  | Compare two saved profiling reports                 |
| `grove.openProfilerPanel`         | Grove: Open Performance Monitor (Debug)     | Open real-time performance monitoring panel         |

### Configuration

| Setting                                      | Type    | Default   | Description                                     |
| -------------------------------------------- | ------- | --------- | ----------------------------------------------- |
| `grove.autoDetect`                           | boolean | `true`    | Automatically detect Grove projects on open     |
| `grove.bluehawkPath`                         | string  | `""`      | Custom path to bluehawk CLI (uses npx if empty) |
| `grove.feedback.jiraProjectId`               | string  | `"14181"` | Jira project ID for feedback tickets (DOCSP)    |
| `grove.feedback.includeDiagnosticsByDefault` | boolean | `true`    | Include diagnostic information by default       |

### Views

Grove contributes an activity bar container (`grove`) with two webview views:

- **Grove Panel** (`grove.panel`) - Shows detected projects, MongoDB connection status, and quick actions (Run Tests, Connect/Disconnect MongoDB, Show Databases)
- **Bluehawk Preview** (`grove.bluehawkPreview`) - Live preview of extracted snippets with syntax highlighting

## Features

### Project Detection & Caching

Uses `@grove/shared` to scan the workspace for `snip.js` files. Each project's language is detected by parsing the `START_DIRECTORY` constant (e.g., `javascript/driver/examples` → `nodejs`).

Projects are cached and automatically refreshed when:

- A `snip.js` file is created or deleted (via `FileSystemWatcher`)
- The user manually refreshes the Grove panel

### RST Directive Support

Provides CodeLens, go-to-definition, and clickable links for file-referencing RST directives:

| Directive                              | CodeLens                     | Description                            |
| -------------------------------------- | ---------------------------- | -------------------------------------- |
| `.. literalinclude:: /path`            | 📄 view, 📄 source, 🧪 test  | Code examples with syntax highlighting |
| `.. include:: /path`                   | 📄 view                      | RST content inclusion                  |
| `.. include:: /includes/extracts/...`  | 📋 extract                   | YAML extract file references           |
| `.. input:: /path` (in io-code-block)  | 📥 input, 📄 source, 🧪 test | Input examples                         |
| `.. output:: /path` (in io-code-block) | 📤 output                    | Output examples                        |

Features:

- **Symlink-aware resolution** - Follows symlinks for code-example paths
- **Snippet navigation** - Jumps to `:snippet:` or `:start-after:` markers
- **Source file linking** - "📄 source" CodeLens links to the Bluehawk source file with markup tags in `code-example-tests/`
- **Test file linking** - "🧪 test" CodeLens links to the test file in `code-example-tests/`
- **Extract resolution** - Resolves extract YAML references and links to the definition

### Test CodeLens

Provides Run/Debug buttons above test blocks in JavaScript/TypeScript files:

| Block Type              | CodeLens Actions  |
| ----------------------- | ----------------- |
| `describe(...)`         | ▶ Run, ▶▶ Run All |
| `it(...)` / `test(...)` | ▶ Run, 🐛 Debug   |

Features:

- **Running indicator** - Shows `$(sync~spin) Running...` during test execution
- **Pass/fail decorations** - Highlights test blocks with results
- **Hover details** - Shows test duration and error messages
- **MongoDB injection** - Passes `CONNECTION_STRING` env var when connected

### Snippet Reference CodeLens

Shows reference counts for Bluehawk `:snippet-start:` tags:

```
$(references) 3 references    ← Above each :snippet-start:
```

- Uses `ripgrep` for fast reference searching across RST files
- Click to see all references in a quick pick

### Bluehawk Preview

Runs `bluehawk snip` on the active file and displays extracted snippets in a webview panel:

- Updates automatically on file save
- Debounces updates during active editing
- Syntax highlighting based on file type

### Diagnostics

Reports issues on `snip.js` files when symlinks are missing or broken. Docs projects (detected by `snooty.toml` or `source/conf.py`) show warnings for missing `source/code-examples/tested` symlinks.

### Language Status

Shows the current file's Grove project in the editor language status area. Updates automatically when switching between files.

### MongoDB Connection

Manages MongoDB connections with:

- **Secure storage** - Connection strings stored via VS Code's `SecretStorage`
- **Cluster detection** - Identifies Atlas (`mongodb+srv://`) vs local connections
- **Sample databases** - Lists `sample_*` databases for Grove tests
- **Lazy loading** - MongoDB driver imported only when connecting
- **Test injection** - Injects `CONNECTION_STRING` env var when running tests

### Symlink Management

Creates portable relative symlinks from Snooty documentation projects to the shared Bluehawk output directory:

```
code-example-tests/
├── javascript/driver/examples/...     # Test source files
├── content/code-examples/tested/      # Bluehawk snippet output

docs-node/
├── snooty.toml
└── source/
    └── code-examples/
        └── tested → ../../../code-example-tests/content/code-examples/tested
```

### Feedback System

Provides a built-in feedback mechanism for reporting bugs and requesting features:

- **Webview Panel** - Dedicated UI for composing feedback with title, description, and type selection
- **Jira Integration** - Generates pre-filled Jira ticket URLs for the DOCSP project
- **Diagnostic Collection** - Optionally includes system info, extension version, and workspace context
- **Configurable** - Jira project ID and default diagnostic inclusion are configurable

### Performance Profiling (Debug)

Development-mode tooling for measuring extension performance:

- **Real-time Monitor** - Live dashboard showing operation timings and call counts
- **Report Generation** - Export profiling data for analysis
- **Report Comparison** - Compare reports across sessions to detect regressions
- **Git Integration** - Reports can include commit/branch metadata

## Extension API

Grove Core exports an API for language extensions (e.g., `grove-nodejs`, `grove-python`):

```typescript
interface GroveApi {
  // Project detection
  getDetectedProjects(): GroveProject[];
  getActiveProject(): GroveProject | null;

  // Test runner registration
  registerTestRunner(runner: TestRunner): void;
  getTestRunner(language: string): TestRunner | undefined;
  listTestRunners(): string[];
  findTestRunnerForProject(
    projectPath: string,
  ): Promise<TestRunner | undefined>;
  runTests(options: TestRunOptions): Promise<TestResult>;
}

interface TestRunner {
  language: string; // e.g., "nodejs", "python"
  name: string; // e.g., "Jest", "pytest"
  run: (options: TestRunOptions) => Promise<TestResult>;
  detect: (projectPath: string) => Promise<boolean>;
}

interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  env?: Record<string, string>;
  testNamePattern?: string;
}
```

Language extensions should:

1. Declare `extensionDependencies: ["mongodb.grove-core"]` in `package.json`
2. Access the API via `vscode.extensions.getExtension("mongodb.grove-core")?.exports`
3. Call `registerTestRunner()` during activation

## Dependencies

- **`@grove/shared`** - Workspace package with project detection, profiling, and security utilities
- **`@vscode/ripgrep`** - Fast file searching for snippet references
- **`js-yaml`** - YAML parsing for extract files
- **`mongodb`** - MongoDB driver (lazy-loaded on first connection)
- **VS Code API** - Webview, SecretStorage, Diagnostics, LanguageStatus, CodeLens

## MongoDB Connection

Grove needs a MongoDB connection string to run tests. There are two ways to provide one, depending on which test suite you are working with.

### Option 1: .env file (required for JavaScript and mongosh)

All test suites support a `.env` file in the project root directory. Create a file named `.env` in the test suite directory (e.g. `code-example-tests/javascript/driver/.env`) with at minimum:

```
CONNECTION_STRING="mongodb+srv://user:password@cluster.mongodb.net/"
```

Some suites require additional variables. For example, the JavaScript driver and mongosh suites require:

```
CONNECTION_STRING="mongodb+srv://user:password@cluster.mongodb.net/"
TZ=UTC
```

The `TZ=UTC` setting ensures consistent timezone handling in date-related test assertions.

Refer to each suite's own README for the full list of required variables.

### Option 2: Grove UI connection (Python, Go, C#, Java)

For suites that read environment variables at runtime — Python (PyMongo), Go, C#, and Java — you can connect via the Grove panel instead of creating a `.env` file:

1. Open the Grove panel in the VS Code sidebar
2. Click **Connect to MongoDB**
3. Enter your connection string

When you run tests, Grove injects the connection string into the test process. This takes priority over any `CONNECTION_STRING` value in a `.env` file.

If a `.env` file is also present, all other variables in it (such as `TZ=UTC`) are still passed to the test process even when using the Grove UI connection.

### Why the JavaScript and mongosh suites are different

The JavaScript driver and mongosh test suites load the `.env` file using a shell-level `export` command inside the `npm test` script:

```
export $(xargs < .env) && jest ...
```

This runs after Grove has already launched the process, overwriting any environment variables Grove injected. As a result, Grove's "Connect to MongoDB" button has no effect on what connection string these suites use — the `.env` file is always the authoritative source.

The Grove panel will display the hostname from your `.env` file when one is present, but the Connect button is not shown for these suites.

## Development

```bash
# From repository root
pnpm install
pnpm build

# Run tests
pnpm test

# Launch Extension Development Host
code --extensionDevelopmentPath=./packages/grove-core /path/to/test/workspace
```

### Building a VSIX for Local Installation

```bash
# Build all packages first
pnpm build

# Create the VSIX package
cd packages/grove-core
pnpm package

# Install locally
code --install-extension grove-core-0.0.2.vsix
```

## License

MongoDB Internal
