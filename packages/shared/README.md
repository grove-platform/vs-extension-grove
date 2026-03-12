# @grove/shared

Shared utilities for the Grove VS Code extension pack. This internal package provides project detection, type definitions, and security utilities used by `grove-core` and language extensions.

## Overview

This package is a workspace dependency (`workspace:*`) used by:

- `grove-core` - Core extension functionality
- `grove-nodejs` - Node.js/Jest test runner

It contains no VS Code dependencies and can be used in any Node.js context.

## Modules

### Project Detection (`project-detection.ts`)

Functions for discovering and analyzing Grove projects in a workspace.

```typescript
import {
  detectGroveProjects,
  detectLanguage,
  findProjectForFile,
  validateSnipConfig,
} from "@grove/shared";

// Find all Grove projects in a workspace
const projects = await detectGroveProjects("/path/to/workspace");

// Detect language for a specific project
const language = await detectLanguage("/path/to/project");

// Find which project contains a file
const project = findProjectForFile("/path/to/file.js", projects);
```

#### `detectGroveProjects(workspacePath: string): Promise<GroveProject[]>`

Recursively searches for `snip.js` files (up to 5 levels deep) and returns an array of detected projects. Skips `node_modules` and hidden directories.

#### `detectLanguage(projectPath: string): Promise<GroveLanguage | null>`

Detects the project language by checking for:

| Language | Detection Method                             |
| -------- | -------------------------------------------- |
| `nodejs` | `package.json` with jest/vitest dependency   |
| `python` | `pyproject.toml` or `pytest.ini` exists      |
| `go`     | `go.mod` exists                              |
| `java`   | `pom.xml` or `build.gradle` exists           |
| `csharp` | `*.csproj` file exists                       |
| `mongosh`| `package.json` with name containing "mongosh"|

#### `findProjectForFile(filePath: string, projects: GroveProject[]): GroveProject | undefined`

Returns the most specific project containing the given file path (deepest match).

### Types (`types.ts`)

Core type definitions shared across all Grove packages.

```typescript
interface GroveProject {
  rootPath: string;           // Absolute path to project root
  relativePath: string;       // Relative path from workspace root
  language: GroveLanguage | null;
  hasValidConfig: boolean;    // Whether snip.js was parsed successfully
}

type GroveLanguage = "nodejs" | "python" | "go" | "java" | "csharp" | "mongosh";

interface GroveStatus {
  hasProject: boolean;
  activeProject: GroveProject | null;
  projects: GroveProject[];
  mongoConnection: {
    connected: boolean;
    clusterType: "Atlas" | "local" | "unknown";
  };
}
```

### Security (`security.ts`)

Path validation utilities to prevent directory traversal attacks.

```typescript
import {
  isPathWithinBoundary,
  sanitizePath,
  validateWorkspacePath,
} from "@grove/shared";

// Check if a resolved path is within a base directory
isPathWithinBoundary("/workspace/file.js", "/workspace"); // true
isPathWithinBoundary("/etc/passwd", "/workspace");        // false

// Sanitize a relative path (removes null bytes, normalizes separators)
sanitizePath("../../../etc/passwd"); // "../../../etc/passwd" (still needs boundary check)

// Validate a file path is within the workspace
validateWorkspacePath("/workspace/src/file.js", "/workspace"); // true
```

## Development

```bash
# Build the package
pnpm --filter @grove/shared build

# Run tests
pnpm --filter @grove/shared test

# Watch mode
pnpm --filter @grove/shared watch
```

## Testing

Tests are located in `src/__tests__/` and use Vitest:

- `project-detection.test.ts` - Project detection and language detection tests
- `security.test.ts` - Path validation and sanitization tests

```bash
# Run tests with coverage
pnpm --filter @grove/shared test
```

