# Grove Extension Pack Specification

## Vision

Grove is MongoDB's test platform for documentation code examples. The Grove VS Code extension pack makes it **as easy as possible for non-technical writers** to create tested code examples—without requiring deep programming expertise.

**Primary Goal**: Enable technical writers with varying programming backgrounds to create, test, and publish accurate code examples through AI-assisted workflows and intuitive UI.

## Design Principles

1. **Writer-First UX**: Every feature must be accessible to writers who may not be comfortable with command-line tools or test frameworks
2. **AI-Guided Workflows**: Language-specific agents guide writers through example creation, testing, and snipping
3. **Visibility & Control**: A dedicated UI panel gives writers real-time status and one-click access to all Grove operations
4. **Graceful Complexity**: Hide technical details by default, but expose them for power users

## Architecture Overview

### Extension Pack Structure

| Extension             | ID                      | Purpose                                                                             |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| **Grove Core**        | `mongodb.grove-core`    | Project detection, Grove Panel UI, Bluehawk preview, MCP server, symlink management |
| **Grove for Node.js** | `mongodb.grove-nodejs`  | Jest runner, scaffolding, Node.js-specific MCP tools                                |
| **Grove for Python**  | `mongodb.grove-python`  | pytest runner, scaffolding, Python-specific MCP tools                               |
| **Grove for Go**      | `mongodb.grove-go`      | go test runner, scaffolding, Go-specific MCP tools                                  |
| **Grove for Java**    | `mongodb.grove-java`    | JUnit runner, scaffolding, Java-specific MCP tools                                  |
| **Grove for C#**      | `mongodb.grove-csharp`  | NUnit runner, scaffolding, C#-specific MCP tools                                    |
| **Grove for mongosh** | `mongodb.grove-mongosh` | Jest runner, scaffolding, mongosh-specific MCP tools                                |

All extensions auto-detect Grove projects via `snip.js` presence using `workspaceContains:**/snip.js`.

### AI Integration via MCP

Grove exposes its functionality through **Model Context Protocol (MCP)**, allowing AI assistants like Augment Code to invoke Grove tools directly. The Grove MCP server runs as part of the VS Code extension and provides:

- **Tools**: Actions like creating examples, running tests, and snipping code
- **Resources**: Access to Grove project structure, templates, and conventions
- **Prompts**: Pre-built prompts for common workflows

```
┌─────────────────────────────────────────────────────────────┐
│                     Augment Code                            │
│  (or any MCP-compliant AI assistant)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Grove MCP Server                          │
│  (bundled in grove-core extension)                          │
├─────────────────────────────────────────────────────────────┤
│  Tools:                    Resources:                       │
│  • grove_create_example    • grove://project/structure      │
│  • grove_create_test       • grove://templates/{language}   │
│  • grove_run_tests         • grove://conventions            │
│  • grove_snip                                               │
│  • grove_read_file         Prompts:                         │
│  • grove_list_examples     • create-example                 │
│  • grove_get_status        • fix-test                       │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Grove VS Code Extension                        │
│  (project detection, test runners, file system access)      │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

- **TypeScript 5.x** with strict mode
- **Vite** for fast bundling
- **pnpm** for workspace management
- **Mocha + Chai** for extension testing (via `@vscode/test-electron`)
- **ESLint 9.x + Prettier 3.x** for code quality

### Repository Structure

Grove uses a **monorepo** with pnpm workspaces. The MCP server is a standalone package that can be published to npm independently while staying in sync with the extension.

```
vs-extension-grove/
├── packages/
│   ├── grove-core/                    # VS Code extension (mongodb.grove-core)
│   │   ├── src/
│   │   │   ├── extension.ts           # Extension entry point
│   │   │   ├── mcp-bridge.ts          # Starts/manages MCP server lifecycle
│   │   │   ├── panel/                 # Grove Panel webview
│   │   │   └── providers/             # Tree views, diagnostics, etc.
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── grove-mcp-server/              # MCP server (standalone npm package)
│   │   ├── src/
│   │   │   ├── index.ts               # Server entry point
│   │   │   ├── tools/                 # MCP tool implementations
│   │   │   │   ├── create-example.ts
│   │   │   │   ├── create-test.ts
│   │   │   │   ├── run-tests.ts
│   │   │   │   └── snip.ts
│   │   │   └── resources/             # MCP resource implementations
│   │   │       ├── conventions.ts
│   │   │       └── templates.ts
│   │   ├── bin/
│   │   │   └── grove-mcp.js           # CLI entry for `npx @mongodb/grove-mcp`
│   │   └── package.json               # Published as @mongodb/grove-mcp
│   │
│   ├── grove-nodejs/                  # Node.js language extension
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── test-runner.ts         # Jest integration
│   │   │   └── templates/             # Node.js example templates
│   │   └── package.json
│   │
│   ├── grove-python/                  # Python language extension
│   ├── grove-go/                      # Go language extension
│   └── shared/                        # Shared utilities
│       ├── src/
│       │   ├── bluehawk.ts            # Bluehawk parsing utilities
│       │   ├── project-detection.ts   # Grove project detection
│       │   └── types.ts               # Shared TypeScript types
│       └── package.json
│
├── meta/                              # Design documents
│   ├── grove-extension-spec.md
│   └── repo-structure.md
│
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

### MCP Server Distribution Strategy

The Grove MCP server uses a **hybrid distribution** approach to serve both VS Code users and users of other AI tools:

```
┌─────────────────────────────────────────────────────────────────┐
│                    @mongodb/grove-mcp (npm)                      │
│                                                                  │
│  • Single source of truth for MCP server logic                   │
│  • Published to npm for standalone use                           │
│  • Consumed by grove-core extension as a dependency              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ VS Code +     │   │ Claude        │   │ Cursor /      │
│ Augment       │   │ Desktop       │   │ Other AI      │
│               │   │               │   │               │
│ Auto-config:  │   │ Manual setup: │   │ Manual setup: │
│ Extension     │   │ npx @mongodb/ │   │ npx @mongodb/ │
│ handles setup │   │ grove-mcp     │   │ grove-mcp     │
└───────────────┘   └───────────────┘   └───────────────┘
```

| Distribution Channel     | Target Users                    | Setup Experience                                 |
| ------------------------ | ------------------------------- | ------------------------------------------------ |
| **VS Code Extension**    | Writers using Augment           | Zero-config: extension auto-registers MCP server |
| **npm package**          | Claude Desktop, Cursor users    | `npx @mongodb/grove-mcp` in MCP config           |
| **Bundled in extension** | Offline/air-gapped environments | Works without npm access                         |

**Why monorepo instead of separate repo?**

- ✅ Extension and MCP server always stay in sync
- ✅ Single CI/CD pipeline for releases
- ✅ Shared code via `packages/shared`
- ✅ Can still publish `@mongodb/grove-mcp` to npm independently
- ✅ Easier for contributors (one repo to clone)

## Core Features

### 1. Grove Panel (Primary UI)

A **webview in the sidebar** that serves as the command center for all Grove operations:

```
┌─────────────────────────────────────┐
│ 🌳 Grove                            │
├─────────────────────────────────────┤
│ 📁 Current Project: javascript/driver│
│ 🔌 MongoDB: Connected (Atlas)       │
│ 📊 Sample Data: 3 databases         │
├─────────────────────────────────────┤
│ Quick Actions                       │
│ ┌─────────────┐ ┌─────────────┐    │
│ │ + Example   │ │ + Test      │    │
│ └─────────────┘ └─────────────┘    │
│ ┌─────────────┐ ┌─────────────┐    │
│ │ ▶ Run Tests │ │ ✂ Snip      │    │
│ └─────────────┘ └─────────────┘    │
├─────────────────────────────────────┤
│ Recent Activity                     │
│ ✓ filter.test.js passed (2s ago)   │
│ ✓ Snipped 3 files                  │
│ ⚠ Missing symlink in docs-node     │
└─────────────────────────────────────┘
```

**Technology**:

- Plain HTML/CSS for MVP (no framework)
- Upgrade to Lit/Web Components if componentization needed
- ❌ No React

**Panel Capabilities**:

- One-click buttons for all common operations
- Real-time status for MongoDB connection and sample data
- Activity log showing recent operations
- Inline warnings for issues (missing symlinks, broken references)
- Progress indicators for long-running operations

**Works Without AI**: The Grove Panel is fully functional without Augment:

- "+ Example" button opens template picker (no AI required)
- "Run Tests" button works directly
- "Snip" button works directly
- AI features via MCP are additive, not required

### 2. MCP Tools

Grove exposes controlled tools via MCP that AI assistants (like Augment) can invoke:

| MCP Tool                | Description                                      | Parameters                                  |
| ----------------------- | ------------------------------------------------ | ------------------------------------------- |
| `grove_create_example`  | Generates example file from template             | `language`, `topic`, `name`, `description`  |
| `grove_create_test`     | Generates test stub for an example               | `examplePath`, `assertions[]`               |
| `grove_run_tests`       | Executes test command, returns output            | `testPath?` (optional, runs all if omitted) |
| `grove_snip`            | Runs Bluehawk snip, returns extracted file paths | `projectPath?`                              |
| `grove_read_file`       | Reads file content for AI context                | `filePath`                                  |
| `grove_list_examples`   | Lists all examples in current project            | `language?`, `topic?`                       |
| `grove_get_status`      | Returns project status (connection, tests, etc.) | none                                        |
| `grove_get_conventions` | Returns Grove conventions for a language         | `language`                                  |

**Example interaction with Augment**:

```
Writer: Create a code example showing how to insert a document in Node.js

Augment: [Calls grove_get_conventions with language="nodejs"]
         [Calls grove_create_example with language="nodejs", topic="crud/insert",
          name="basic-insert", description="Insert a single document"]

         I've created the example file at examples/crud/insert/basic-insert.js.
         It includes:
         - MongoClient import
         - Connection using CONNECTION_STRING env var
         - insertOne() call with a sample document
         - Proper Bluehawk markup for snipping

         Would you like me to also create the test file?

Writer: Yes, please

Augment: [Calls grove_create_test with examplePath="examples/crud/insert/basic-insert.js",
          assertions=["insertedId is returned", "document exists in collection"]]

         Created tests/crud/insert.test.js. Run the tests?

Writer: Run them

Augment: [Calls grove_run_tests with testPath="tests/crud/insert.test.js"]

         ✓ All tests passed! Ready to snip.
```

### 3. Bluehawk Preview

Live preview panel showing what `snip.js` will extract:

- Highlights `:snippet-start:`, `:remove:`, `:replace:` blocks
- Shows final output alongside source
- Updates in real-time as you edit

### 4. Test Runner Integration

Each language extension integrates with VS Code's Test Explorer:

- Lazy test discovery (doesn't scan all tests upfront)
- Run individual tests or entire suites
- Pass/fail status shown inline in editor
- Clear error messages with suggested fixes

### 5. Diagnostics & Warnings

Inline diagnostics for common issues:

- Missing symlinks in docs projects
- Invalid Bluehawk markup syntax
- Broken `literalinclude` references
- Missing expected output files

## Security Considerations

### MCP Tool Security Model

AI assistants invoke MCP tools without direct user initiation. Grove treats all AI-provided input as **untrusted** and enforces the following safeguards:

| Safeguard                 | Implementation                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| **Path validation**       | All file paths must resolve within workspace boundaries (`path.resolve()` + prefix check) |
| **Command allowlisting**  | Test commands limited to known runners (jest, pytest, go test, etc.)                      |
| **Execution timeout**     | `grove_run_tests` times out after 60 seconds (max: 300 seconds configurable)              |
| **No watch mode via MCP** | `watch: true` only available via Panel UI, not AI tools                                   |
| **Concurrency queue**     | Max 1 execution per tool type at a time                                                   |
| **File size cap**         | `grove_create_example` rejects files larger than 100KB                                    |
| **snip.js validation**    | Validate snip.js is a known Bluehawk config format before parsing                         |
| **Audit logging**         | All tool invocations logged to "Grove" output channel                                     |

### Credential Exposure Prevention

The `grove_get_status` tool returns only minimal, non-sensitive information:

```typescript
// grove_get_status response - NEVER includes connection strings
{
  connected: boolean,
  clusterType: "Atlas" | "local" | "unknown",
  projectPath: string,
  hasSnipConfig: boolean
}
```

- Never include connection strings, hostnames, or credentials in MCP tool responses
- Use `context.secrets.store()` / `context.secrets.get()` for MongoDB connection strings
- Never log credentials in plain text
- Clear credentials from memory after use

### Workspace Trust

Declare `untrustedWorkspaces: { supported: 'limited' }`. In untrusted workspaces:

- Disable shell command execution (bluehawk, test runners)
- Disable symlink creation
- Allow read-only features (navigation, preview)

### Shell Command Execution

- Use parameterized execution (args as arrays, never string interpolation)
- Validate all file paths before passing to shell commands
- Use VS Code's Task API for test runners

### File System Boundaries

- Validate all paths are within workspace boundaries
- Sanitize paths from `snip.js` parsing
- Reject symlink targets pointing outside workspace

## Implementation Priorities

### Phase 1a: Core + Basic MCP

1. **Project Detection**: Detect Grove projects via `snip.js`, activate extension
2. **Status Bar**: Show Grove project status in VS Code status bar
3. **MCP Server (minimal)**: `grove_get_status` tool only
4. **Augment Setup UX**: "Copy MCP Configuration" command + guided setup

_Validates: MCP integration works end-to-end with Augment_

### Phase 1b: Grove Panel + Read Tools

5. **Grove Panel (skeleton)**: Webview in sidebar with project info, quick actions
6. **`grove_read_file` tool**: Read file content for AI context
7. **Panel ↔ Extension messaging**: Basic webview communication

_Validates: Webview messaging works, AI can read project files_

### Phase 1c: Node.js Extension + Test Runner

8. **Grove for Node.js**: Jest runner integration
9. **`grove_run_tests` tool**: Execute tests, return results
10. **Test runner registration**: Language extensions register runners with grove-core

_Validates: Test runner architecture, language extension pattern_

### Phase 2: Full MCP Tool Suite

11. **Creation Tools**: `grove_create_example`, `grove_create_test` with template support
12. **Execution Tools**: `grove_snip` with Bluehawk library integration
13. **Bluehawk Preview**: Live extraction preview pane
14. **Enhanced Panel**: Activity log, inline warnings, progress indicators

### Phase 3: Multi-Language & Polish

15. **Additional Languages**: Python, Go, Java, C#, mongosh extensions
16. **MCP Resources**: Expose project structure, templates, and conventions
17. **Diagnostics**: Full diagnostic collection for all issue types
18. **literalinclude Navigation**: Click-to-open for RST file references

## MCP Server Configuration

### MCP Server Lifecycle

| Aspect             | Implementation                                       |
| ------------------ | ---------------------------------------------------- |
| **Transport**      | stdio (matches Claude Desktop pattern, simplest)     |
| **Crash handling** | Auto-restart with exponential backoff, max 3 retries |
| **Multi-window**   | One server per workspace folder                      |

### For VS Code + Augment Users (Recommended)

The Grove extension provides **guided setup** for Augment MCP configuration:

**How it works**:

1. Extension activates when `snip.js` is detected in workspace
2. Extension starts the bundled MCP server
3. Grove Panel shows "Connect to Augment" setup wizard (if not configured)
4. User runs **"Grove: Copy MCP Configuration"** command
5. User pastes JSON into Augment Settings → MCP → Import from JSON
6. Grove tools become available in Augment's chat

> **Note**: Augment does not currently expose an API for programmatic MCP server registration. If this changes in the future, we'll add auto-registration.

### For Claude Desktop / Other AI Tools

Users can install Grove's MCP server via npm:

```bash
# Install globally
npm install -g @mongodb/grove-mcp

# Or run directly with npx (recommended)
npx @mongodb/grove-mcp
```

Then add to Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grove": {
      "command": "npx",
      "args": ["-y", "@mongodb/grove-mcp"],
      "env": {
        "GROVE_PROJECT_PATH": "/path/to/code-example-tests/javascript/driver"
      }
    }
  }
}
```

### For Augment (Manual Configuration)

If auto-configuration doesn't work, manually add to Augment's MCP settings:

```json
{
  "mcpServers": {
    "grove": {
      "command": "npx",
      "args": ["-y", "@mongodb/grove-mcp"],
      "env": {
        "GROVE_PROJECT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

### MCP Tool Definitions

```typescript
// grove_create_example tool schema
{
  name: "grove_create_example",
  description: "Create a new code example file with Bluehawk markup",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["nodejs", "python", "go", "java", "csharp", "mongosh"],
        description: "Target programming language"
      },
      topic: {
        type: "string",
        description: "Topic path (e.g., 'crud/insert', 'aggregation/match')"
      },
      name: {
        type: "string",
        description: "Example file name (without extension)"
      },
      description: {
        type: "string",
        description: "Brief description of what the example demonstrates"
      }
    },
    required: ["language", "topic", "name"]
  }
}

// grove_run_tests tool schema
{
  name: "grove_run_tests",
  description: "Run Grove tests and return results",
  inputSchema: {
    type: "object",
    properties: {
      testPath: {
        type: "string",
        description: "Path to specific test file (optional, runs all if omitted)"
      }
      // Note: watch mode is NOT available via MCP (security constraint)
      // Use Grove Panel UI for watch mode
    }
  }
}
```

### MCP Resources

Grove exposes the following resources for AI context:

| Resource URI                     | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `grove://project/structure`      | Current project layout (examples, tests, etc.) |
| `grove://templates/{language}`   | Code templates for the specified language      |
| `grove://conventions`            | Grove conventions and best practices           |
| `grove://conventions/{language}` | Language-specific conventions                  |

### MCP Error Handling

All MCP tools return structured errors with AI-friendly messages:

```typescript
// Error response format
{
  isError: true,
  content: [{
    type: "text",
    text: "Could not run tests: Jest is not installed in this project. Run `npm install` first."
  }]
}

// Success response format
{
  content: [{
    type: "text",
    text: "Tests passed! 3 tests in 1.2s"
  }]
}
```

This format allows AI assistants to understand errors and suggest remediation steps.

## Multi-Project Workspace Handling

Workspaces may contain multiple Grove projects (e.g., monorepo with `javascript/driver/` AND `python/driver/`).

| Behavior             | Implementation                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| **Detection**        | Glob for `**/snip.js` at activation                                               |
| **Panel UI**         | Project picker dropdown when multiple projects detected                           |
| **MCP tools**        | Accept optional `projectPath` parameter; defaults to "current" project from Panel |
| **Server instances** | One MCP server instance handles multiple project contexts                         |

## Test Framework Detection

Language extensions register test runners with grove-core:

```typescript
// Language extension registers a runner
groveCore.registerTestRunner({
  language: "nodejs",
  command: "npx jest",
  filePattern: "**/*.test.{js,ts}",
  parseResults: (output) => {
    /* parse Jest output */
  },
});
```

When `grove_run_tests` is called:

1. Detect language from project structure or `projectPath`
2. Look up registered runner for that language
3. Execute runner command with appropriate arguments
4. Parse results and return structured output
5. If no runner found, return helpful error message

## Bluehawk Integration

Grove uses `@mongodb-oss/bluehawk` as a **library** (not CLI) for snippet extraction:

| Benefit                   | Description                                |
| ------------------------- | ------------------------------------------ |
| **Smaller footprint**     | ~1MB vs ~5MB for CLI bundle                |
| **Faster execution**      | No process spawn overhead                  |
| **Better error handling** | Direct exceptions vs parsing CLI output    |
| **Zero-config**           | Bundled in extension, no user installation |

```typescript
// Direct library usage
import { snip } from "@mongodb-oss/bluehawk";

const result = await snip({
  input: projectPath,
  output: outputPath,
  state: "tested",
});
```

## Writer Workflows

### Creating a New Code Example

1. **Open Grove Panel** → Click "+ Example" or ask Augment in natural language
2. **Describe what you need** → "Create a Node.js example that inserts a document"
3. **AI uses Grove tools** → Augment calls `grove_create_example`, shows generated code
4. **Review output** → Writer sees file with proper Bluehawk markup
5. **Run tests** → One-click in Panel or ask "run the tests"
6. **Snip** → Extract tested code to `content/code-examples/tested/`

### Fixing a Failing Test

1. **See failure in Panel** → Activity log shows failed test
2. **Ask Augment** → "Why did filter.test.js fail?"
3. **AI reads context** → Augment calls `grove_read_file` to get test output
4. **Get explanation** → AI explains the failure in plain language
5. **Apply fix** → AI suggests changes, writer confirms

### Using Grove with Augment

Writers interact with Grove through natural language in Augment's chat:

| Writer Says                                 | Augment Uses                                 |
| ------------------------------------------- | -------------------------------------------- |
| "Create a Python aggregation example"       | `grove_create_example` + `grove_create_test` |
| "Run the tests for insert examples"         | `grove_run_tests`                            |
| "What's wrong with my filter test?"         | `grove_read_file` + analysis                 |
| "Show me the Grove conventions for Node.js" | `grove://conventions/nodejs` resource        |
| "Snip all examples in this project"         | `grove_snip`                                 |

## Resolved Design Decisions

The following questions were resolved during the spec audit (see `grove-spec-audit.md`):

| Question                           | Decision                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| **Panel vs. Sidebar**              | Webview in sidebar container (like GitLens, MongoDB extension)                               |
| **Tool Confirmation**              | Trust Augment's confirmation UX; Grove logs to output channel + shows toast after completion |
| **Auto-registration with Augment** | No API exists; implement "Copy to Clipboard" + guided setup UX                               |
| **Frontend Technology**            | Plain HTML/CSS for MVP; Lit/Web Components if needed; no React                               |
| **Bluehawk Integration**           | Import `@mongodb-oss/bluehawk` as library (not CLI)                                          |
| **Telemetry**                      | Deferred to post-MVP                                                                         |

## References

- Grove Platform: `../../docs-mongodb-internal/code-example-tests/README.md`
- Comparison Spec: `../../docs-mongodb-internal/code-example-tests/comparison-spec.md`
- Sample Data Spec: `../../docs-mongodb-internal/code-example-tests/sample-data-utility-spec.md`
- Repo Structure: `./repo-structure.md`
