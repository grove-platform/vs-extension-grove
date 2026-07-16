# Grove Extension Pack

A VS Code extension pack for MongoDB documentation code example testing. Grove helps technical writers create, test, and maintain code examples across all MongoDB documentation.

## Overview

Grove automatically detects code example projects (identified by `snip.js` files) and provides:

- **Project Detection** - Auto-discovers Grove projects and their languages
- **Test Execution** - Run tests with language-specific runners
- **Bluehawk Preview** - Live preview of snippet extraction
- **RST Navigation** - Code lenses and go-to-definition for `literalinclude` directives
- **Symlink Management** - Link documentation to shared code examples
- **MongoDB Connection** - Connect to Atlas or local clusters for testing

## Extensions

| Extension             | Package        | Description                                                                                 |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| **Grove Core**        | `grove-core`   | Core functionality: project detection, Bluehawk preview, RST navigation, MongoDB connection |
| **Grove for Node.js** | `grove-nodejs` | Jest/Vitest test runner for JavaScript/TypeScript projects                                  |
| **Grove for Python**  | `grove-python` | pytest and unittest runners for Python projects                                             |
| **Grove for C#**      | `grove-csharp` | `dotnet test` runner for C# / .NET projects                                                 |
| **Grove for Java**    | `grove-java`   | JUnit / Maven test runner for Java projects (builds comparison-library locally)             |

### Planned Extensions
- **Grove for Go** - Go test runner

## Getting Started

1. Install the Grove extensions from the VS Code Marketplace
2. Open a workspace containing Grove projects (directories with `snip.js` files)
3. Grove automatically activates and detects your projects
4. Use the Grove panel in the activity bar to view project status

### Commands

Access Grove commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- `Grove: Run Tests` - Run tests for the current project
- `Grove: Create Symlink for Documentation` - Create symlinks from docs to code-examples
- `Grove: Open Bluehawk Preview` - Preview extracted snippets
- `Grove: Connect to MongoDB` - Connect with a connection string
- `Grove: Send Feedback` - Report bugs or request features (creates Jira tickets)

## Repository Structure

```
grove-extension/
├── packages/
│   ├── shared/           # @grove/shared - Shared utilities (no VS Code deps)
│   ├── grove-core/       # Core extension
│   ├── grove-nodejs/     # Node.js language extension
│   ├── grove-python/     # Python language extension
│   ├── grove-csharp/     # C# language extension
│   └── grove-java/       # Java language extension
├── meta/
│   ├── features.md       # Feature roadmap and ideas
│   ├── discovery.md      # Initial project discovery notes
│   └── future/           # Future phase planning documents
├── package.json          # Monorepo root (pnpm workspaces)
└── pnpm-workspace.yaml   # Workspace configuration
```

## Development

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 8.0.0

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test
```

### Package Commands

```bash
# Build specific package (use workspace package names from packages/*/package.json)
pnpm --filter grove-platform-core build
pnpm --filter grove-platform-nodejs build
pnpm --filter grove-platform-python build
pnpm --filter grove-platform-csharp build
pnpm --filter grove-platform-java build
pnpm --filter @grove/shared build

# Watch mode (all packages)
pnpm watch

# Run tests for specific package
pnpm --filter grove-platform-core test
pnpm --filter grove-platform-nodejs test
pnpm --filter grove-platform-python test
pnpm --filter grove-platform-csharp test
pnpm --filter grove-platform-java test
```

### Building VSIX for Local Installation

```bash
# Package all extensions (grove-core + language extensions)
pnpm package

# Install extensions locally (versions match packages/*/package.json)
code --install-extension packages/grove-core/grove-platform-core-0.0.24.vsix
code --install-extension packages/grove-nodejs/grove-platform-nodejs-0.0.15.vsix
code --install-extension packages/grove-python/grove-platform-python-0.0.4.vsix
code --install-extension packages/grove-csharp/grove-platform-csharp-0.0.3.vsix
code --install-extension packages/grove-java/grove-platform-java-0.0.2.vsix
```

> **Note:** Grove Core alone provides project detection, Bluehawk preview, and RST navigation. To run tests, install Grove Core plus the language extension for your project (Node.js, Python, C#, or Java).

### Running in VS Code

1. Open the repository in VS Code
2. Create a local `.vscode/launch.json` (not committed — paths vary by machine). Example for debugging Grove Core with a language extension against a docs checkout:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Grove Core + Java",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--new-window",
        "--extensionDevelopmentPath=${workspaceFolder}/packages/grove-core",
        "--extensionDevelopmentPath=${workspaceFolder}/packages/grove-java",
        "${input:groveTestWorkspace}"
      ],
      "outFiles": ["${workspaceFolder}/packages/*/dist/**/*.js"]
    }
  ],
  "inputs": [
    {
      "id": "groveTestWorkspace",
      "type": "promptString",
      "description": "Path to a Grove code-example-tests project",
      "default": ""
    }
  ]
}
```

Swap `grove-java` for `grove-nodejs`, `grove-python`, or `grove-csharp` as needed. See [VS Code extension debugging](https://code.visualstudio.com/api/working-with-extensions/testing-extension) for more options.

3. Press `F5` to launch the Extension Development Host
4. The development instance will have the configured Grove extensions loaded

### Performance Profiler

Grove includes a built-in performance profiler (via `@grove/shared`) for measuring the impact of new features. **The profiler is only active in development mode** (`ExtensionMode.Development`) and has zero overhead in production builds.

#### Initialization

```typescript
import { initProfiler } from "@grove/shared";

export async function activate(context: vscode.ExtensionContext) {
  // Initialize with optional logger for output
  initProfiler(context, outputChannel);
}
```

#### Usage

**Profile async/sync functions:**

```typescript
import { profile, profileSync } from "@grove/shared";

// Async operations
const result = await profile("findReferences", () =>
  findSnippetReferencesWithRipgrep(name, uri),
);

// Sync operations
const blocks = profileSync("parseBlocks", () => parseSnippetBlocks(document));
```

**Mark/measure for multi-step operations:**

```typescript
import { mark, measure } from "@grove/shared";

mark("activation.start");
await initializeProviders();
mark("activation.providersReady");
measure(
  "activation.providers",
  "activation.start",
  "activation.providersReady",
);
```

#### Viewing Reports

In development mode, use the Command Palette:

- `Grove: Show Performance Report (Debug)` - View collected metrics
- `Grove: Clear Performance Statistics (Debug)` - Reset all data

Reports show operation count, average, min, and max times sorted by total time.

## Architecture

Grove uses a **core + language extensions** architecture:

```
┌─────────────────────────────────────────────────────────┐
│                      VS Code                             │
├─────────────────────────────────────────────────────────┤
│  grove-core                                              │
│  ├── Project Detection (via @grove/shared)               │
│  ├── Test Runner API (registry for language runners)     │
│  ├── Shared test execution (runGroveTests)               │
│  ├── Bluehawk Preview                                    │
│  ├── RST Literalinclude Providers                        │
│  ├── MongoDB Connection Manager                          │
│  └── Diagnostics & Language Status                       │
├─────────────────────────────────────────────────────────┤
│  grove-nodejs  │  grove-python  │  grove-csharp  │  grove-java │
│  Jest/Vitest   │  pytest/unittest│  dotnet test  │  Maven/JUnit │
├─────────────────────────────────────────────────────────┤
│  @grove/shared (workspace package)                       │
│  ├── Project Detection                                   │
│  ├── Performance Profiler                                │
│  ├── Type Definitions                                    │
│  └── Security Utilities                                  │
└─────────────────────────────────────────────────────────┘
```

Language extensions register their test runners with Grove Core's API. Core commands (`Grove: Run Tests`, `Grove: Run Current Test File`) and language-specific commands route through shared test execution in Grove Core, which delegates to the appropriate runner.

## Contributing

See individual package READMEs for detailed development information:

- [packages/grove-core/README.md](packages/grove-core/README.md)
- [packages/grove-nodejs/README.md](packages/grove-nodejs/README.md)
- [packages/grove-python/README.md](packages/grove-python/README.md)
- [packages/grove-csharp/README.md](packages/grove-csharp/README.md)
- [packages/grove-java/README.md](packages/grove-java/README.md)
- [packages/shared/README.md](packages/shared/README.md)

## License

MongoDB Internal
