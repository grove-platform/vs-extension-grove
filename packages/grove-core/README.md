# Grove Core

The core VS Code extension for the MongoDB documentation code example testing platform. Grove Core provides shared functionality for detecting, managing, and testing code examples across all MongoDB driver documentation.

## Overview

Grove Core activates automatically when VS Code opens a workspace containing a `snip.js` file (the Grove project configuration). It provides:

- **Project Detection** - Automatically discovers Grove projects and determines their language
- **Symlink Management** - Creates and validates symlinks from docs projects to shared snippet output directories
- **Bluehawk Preview** - Live preview of Bluehawk snippet output
- **RST Literalinclude Navigation** - Code lenses and go-to-definition for RST file includes
- **MongoDB Connection** - Secure credential storage and database listing
- **Test Runner API** - Extensibility point for language-specific test runners

## Architecture

```
grove-core/
├── src/
│   ├── extension.ts          # Main entry point and VS Code lifecycle
│   ├── test-runner-api.ts    # API for language extensions to register test runners
│   ├── diagnostics.ts        # Inline editor diagnostics (symlink warnings)
│   ├── language-status.ts    # Per-file Grove status in editor
│   ├── symlink.ts            # Symlink creation and validation
│   ├── panel/
│   │   └── GrovePanel.ts     # Activity bar webview panel
│   ├── preview/
│   │   ├── BluehawkPreview.ts    # Bluehawk preview webview
│   │   └── bluehawk-runner.ts    # CLI wrapper for bluehawk snip
│   ├── rst/
│   │   ├── LiteralIncludeProviders.ts  # CodeLens, Definition, Links
│   │   ├── literalinclude-parser.ts    # RST directive parser
│   │   └── path-resolver.ts            # Symlink-aware path resolution
│   └── mongo/
│       ├── connection.ts     # MongoDB client lifecycle
│       ├── commands.ts       # VS Code command handlers
│       └── credentials.ts    # SecretStorage wrapper
└── package.json              # Extension manifest and contributions
```

## VS Code Integration

### Activation

The extension activates on the `workspaceContains:**/snip.js` event. On activation, it:

1. Creates a log output channel (`Grove`)
2. Detects Grove projects with a progress indicator
3. Initializes the status bar, diagnostics, and language status
4. Registers all commands and providers
5. Attempts MongoDB reconnection with stored credentials
6. Returns the API for language extensions

### Commands

| Command                     | Title                                   | Description                                  |
| --------------------------- | --------------------------------------- | -------------------------------------------- |
| `grove.runTests`            | Grove: Run Tests                        | Run tests using the detected language runner |
| `grove.createSymlink`       | Grove: Create Symlink for Documentation | Create symlink from docs to code-examples    |
| `grove.connectMongo`        | Grove: Connect to MongoDB               | Connect with a connection string             |
| `grove.disconnectMongo`     | Grove: Disconnect from MongoDB          | Disconnect and clear session                 |
| `grove.openBluehawkPreview` | Grove: Open Bluehawk Preview            | Show Bluehawk output for current file        |

### Configuration

| Setting              | Type    | Default | Description                                     |
| -------------------- | ------- | ------- | ----------------------------------------------- |
| `grove.autoDetect`   | boolean | `true`  | Automatically detect Grove projects on open     |
| `grove.bluehawkPath` | string  | `""`    | Custom path to bluehawk CLI (uses npx if empty) |

### Views

Grove contributes an activity bar container (`grove`) with two webview views:

- **Grove Panel** (`grove.panel`) - Shows detected projects, MongoDB status, and actions
- **Bluehawk Preview** (`grove.bluehawkPreview`) - Live preview of extracted snippets

## Features

### Project Detection

Uses `@grove/shared` to scan the workspace for `snip.js` files. Each project's language is detected by parsing the `START_DIRECTORY` constant (e.g., `javascript/driver/examples` → `nodejs`).

```typescript
const projects = await detectGroveProjects(workspacePath);
```

### Diagnostics

Reports issues on `snip.js` files when symlinks are missing or broken. Docs projects (detected by `snooty.toml` or `source/conf.py` presence) show warnings for missing `source/code-examples/tested` symlinks.

### Language Status

Shows the current file's Grove project in the editor language status area. Updates automatically when switching between files in different projects.

### RST Literalinclude Support

Provides three language features for RST/TXT files:

1. **CodeLens** - "📄 view" and "🧪 test" links above each `literalinclude` directive
2. **Definition Provider** - Ctrl+Click navigation to the referenced file
3. **Document Links** - Clickable file paths within directives

The CodeLens resolves snippet files back to their original test files in `code-example-tests/`, enabling quick navigation from documentation to source.

### Bluehawk Preview

Runs `bluehawk snip --dry-run` on the active file and displays extracted snippets in a webview panel. The preview:

- Updates automatically on file save
- Debounces updates during active editing
- Detects Bluehawk directives (`:snippet-start:`, `:remove-start:`, etc.)
- Provides syntax highlighting based on file type

### MongoDB Connection

Manages MongoDB connections with:

- **Secure storage** - Connection strings stored via VS Code's `SecretStorage`
- **Cluster detection** - Identifies Atlas (`mongodb+srv://`) vs local connections
- **Sample databases** - Lists `sample_*` databases for Grove tests
- **Lazy loading** - MongoDB driver imported only when connecting

### Symlink Management

Creates portable relative symlinks from Snooty documentation projects to the shared Bluehawk output directory. The typical structure is:

```
code-example-tests/
├── javascript/driver/examples/...     # Test source files
├── content/code-examples/tested/      # Bluehawk snippet output
│   └── javascript/driver/...

docs-node/
├── snooty.toml
└── source/
    └── code-examples/
        └── tested → ../../../code-example-tests/content/code-examples/tested
```

Each docs project's `source/code-examples/tested/` symlinks to `code-example-tests/content/code-examples/tested/`, allowing RST `literalinclude` directives to reference the extracted snippet files. Validates paths are within the workspace and creates parent directories as needed.

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
```

Language extensions should:

1. Declare `extensionDependencies: ["mongodb.grove-core"]` in `package.json`
2. Access the API via `vscode.extensions.getExtension("mongodb.grove-core")?.exports`
3. Call `registerTestRunner()` during activation

## Dependencies

- **`@grove/shared`** - Workspace package with project detection and security utilities
- **VS Code API** - Webview, SecretStorage, Diagnostics, LanguageStatus, CodeLens

## Development

```bash
# From repository root
pnpm install
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm --filter grove-core watch
```

## License

MongoDB Internal
