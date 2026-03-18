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

### Planned Extensions

- **Grove for Python** - pytest runner for Python projects
- **Grove for Go** - Go test runner
- **Grove for Java** - JUnit/Maven test runner
- **Grove for C#** - NUnit/.NET test runner

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
│   └── grove-nodejs/     # Node.js language extension
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
# Build specific package
pnpm --filter grove-core build
pnpm --filter grove-nodejs build
pnpm --filter @grove/shared build

# Watch mode (all packages)
pnpm watch

# Run tests for specific package
pnpm --filter grove-core test
```

### Building VSIX for Local Installation

```bash
# Package all extensions (grove-core + grove-nodejs)
pnpm package

# Install both extensions locally
code --install-extension packages/grove-core/grove-core-0.0.2.vsix
code --install-extension packages/grove-nodejs/grove-nodejs-0.0.15.vsix
```

> **Note:** Grove Core alone provides project detection, Bluehawk preview, and RST navigation. To run tests, you also need a language extension (e.g., Grove for Node.js).

### Running in VS Code

1. Open the repository in VS Code
2. Press `F5` to launch the Extension Development Host
3. The development instance will have all Grove extensions loaded

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
│  ├── Bluehawk Preview                                    │
│  ├── RST Literalinclude Providers                        │
│  ├── MongoDB Connection Manager                          │
│  └── Diagnostics & Language Status                       │
├─────────────────────────────────────────────────────────┤
│  grove-nodejs              │  grove-python (future)      │
│  └── Jest Test Runner      │  └── pytest Test Runner     │
├─────────────────────────────────────────────────────────┤
│  @grove/shared (workspace package)                       │
│  ├── Project Detection                                   │
│  ├── Performance Profiler                                │
│  ├── Type Definitions                                    │
│  └── Security Utilities                                  │
└─────────────────────────────────────────────────────────┘
```

Language extensions register their test runners with Grove Core's API, enabling the core `Grove: Run Tests` command to delegate to the appropriate runner.

## Contributing

See individual package READMEs for detailed development information:

- [packages/grove-core/README.md](packages/grove-core/README.md)
- [packages/grove-nodejs/README.md](packages/grove-nodejs/README.md)
- [packages/shared/README.md](packages/shared/README.md)

## License

MongoDB Internal
