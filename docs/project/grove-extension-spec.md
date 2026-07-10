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

| Extension             | ID                      | Purpose                                                                 |
| --------------------- | ----------------------- | ----------------------------------------------------------------------- |
| **Grove Core**        | `mongodb.grove-core`    | Project detection, Grove Panel UI, Bluehawk preview, symlink management |
| **Grove for Node.js** | `mongodb.grove-nodejs`  | Jest runner, scaffolding, Node.js-specific AI skills                    |
| **Grove for Python**  | `mongodb.grove-python`  | unittest and pytest runners, scaffolding, Python-specific AI skills   |
| **Grove for Go**      | `mongodb.grove-go`      | go test runner, scaffolding, Go-specific AI skills                      |
| **Grove for Java**    | `mongodb.grove-java`    | JUnit runner, scaffolding, Java-specific AI skills                      |
| **Grove for C#**      | `mongodb.grove-csharp`  | `dotnet test` runner, scaffolding, C#-specific AI skills                |
| **Grove for mongosh** | `mongodb.grove-mongosh` | Jest runner, scaffolding, mongosh-specific AI skills                    |

All extensions auto-detect Grove projects via `snip.js` presence using `workspaceContains:**/snip.js`.

### AI Integration via Agents & Skills

> **Design Decision**: We evaluated MCP (Model Context Protocol) for AI integration but decided against it. Instead, Grove uses **AI agents and skill files** that work with any AI assistant that supports file-based context (Augment, Cursor, Copilot, etc.). This approach is simpler, more portable, and doesn't require running a separate server process.

Grove's AI integration consists of:

- **Skill Files** (`.skills/`): Markdown files containing instructions, conventions, and workflows for specific tasks
- **Agent Definitions** (`.agents/`): Pre-configured AI agent personas for language-specific guidance
- **Context Files**: Project structure and conventions exposed as readable files

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistant                            │
│  (Augment, Cursor, Copilot, or any file-aware AI)          │
└─────────────────────┬───────────────────────────────────────┘
                      │ Reads files as context
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Grove Project Files                            │
├─────────────────────────────────────────────────────────────┤
│  .skills/                  .agents/                         │
│  • create-example.md       • nodejs-grove-agent.md          │
│  • write-test.md           • python-grove-agent.md          │
│  • fix-test.md             • conventions.md                 │
│  • snip-code.md                                             │
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
- **esbuild** for production bundling
- **pnpm** for workspace management
- **Vitest** for unit testing
- **ESLint 9.x + Prettier 3.x** for code quality

### Repository Structure

Grove uses a **monorepo** with pnpm workspaces:

```
vs-extension-grove/
├── packages/
│   ├── grove-core/                    # VS Code extension (mongodb.grove-core)
│   │   ├── src/
│   │   │   ├── extension.ts           # Extension entry point
│   │   │   ├── panel/                 # Grove Panel and Profiler webviews
│   │   │   ├── preview/               # Bluehawk preview
│   │   │   ├── feedback/              # Feedback/Jira integration
│   │   │   ├── rst/                   # RST directive providers
│   │   │   ├── test-codelens/         # Test CodeLens providers
│   │   │   ├── snippet-codelens/      # Snippet reference CodeLens
│   │   │   └── mongo/                 # MongoDB connection management
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── grove-nodejs/                  # Node.js language extension
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   └── test-runner.ts         # Jest integration
│   │   └── package.json
│   │
│   └── shared/                        # Shared utilities (@grove/shared)
│       ├── src/
│       │   ├── project-detection.ts   # Grove project detection
│       │   ├── types.ts               # Shared TypeScript types
│       │   ├── security.ts            # Path validation utilities
│       │   └── profiler.ts            # Performance profiling
│       └── package.json
│
├── meta/                              # Planning and design documents
│   ├── features.md
│   ├── discovery.md
│   └── future/
│
├── docs/project/                      # Specifications
│   └── grove-extension-spec.md
│
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

**Why monorepo?**

- ✅ All extensions stay in sync
- ✅ Single CI/CD pipeline for releases
- ✅ Shared code via `packages/shared`
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

**Works Without AI**: The Grove Panel is fully functional without any AI assistant:

- "+ Example" button opens template picker (no AI required)
- "Run Tests" button works directly
- "Snip" button works directly
- AI skills are additive, not required

### 2. AI Skills & Agents

Grove provides skill files and agent definitions that any file-aware AI assistant can use:

| Skill File          | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `create-example.md` | Instructions for creating example files with Bluehawk markup |
| `write-test.md`     | Instructions for writing tests for examples                  |
| `fix-test.md`       | Troubleshooting guide for common test failures               |
| `snip-code.md`      | How to run Bluehawk snip and verify output                   |

| Agent File        | Description                                  |
| ----------------- | -------------------------------------------- |
| `grove-nodejs.md` | Node.js-specific conventions and patterns    |
| `grove-python.md` | Python-specific conventions and patterns     |
| `conventions.md`  | General Grove conventions and best practices |

**Example interaction with AI**:

```
Writer: Create a code example showing how to insert a document in Node.js

AI: [Reads .agents/grove-nodejs.md for conventions]
    [Reads .skills/create-example.md for workflow]

    I've created the example file at examples/crud/insert/basic-insert.js.
    It includes:
    - MongoClient import
    - Connection using CONNECTION_STRING env var
    - insertOne() call with a sample document
    - Proper Bluehawk markup for snipping

    Would you like me to also create the test file?

Writer: Yes, please

AI: [Reads .skills/write-test.md for test patterns]

    Created tests/crud/insert.test.js. Run the tests?

Writer: Run them

AI: [Executes: npm test -- tests/crud/insert.test.js]

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

### General Security Model

Grove validates all inputs and enforces the following safeguards:

| Safeguard                | Implementation                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Path validation**      | All file paths must resolve within workspace boundaries (`path.resolve()` + prefix check) |
| **Command allowlisting** | Test commands limited to known runners (jest, pytest, go test, etc.)                      |
| **Execution timeout**    | Test runners time out after 60 seconds (max: 300 seconds configurable)                    |
| **snip.js validation**   | Validate snip.js is a known Bluehawk config format before parsing                         |
| **Audit logging**        | All operations logged to "Grove" output channel                                           |

### Credential Exposure Prevention

- Use `context.secrets.store()` / `context.secrets.get()` for MongoDB connection strings
- Never log credentials in plain text
- Clear credentials from memory after use
- Skill files never include or expose credentials

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

### Phase 1a: Core Foundation

1. **Project Detection**: Detect Grove projects via `snip.js`, activate extension
2. **Status Bar**: Show Grove project status in VS Code status bar
3. **AI Skills Setup**: Create initial skill and agent files for AI assistance

_Validates: Extension activates correctly, AI can read skill files_

### Phase 1b: Grove Panel + Basic UI

4. **Grove Panel (skeleton)**: Webview in sidebar with project info, quick actions
5. **Panel ↔ Extension messaging**: Basic webview communication
6. **Template Picker**: UI for selecting example templates without AI

_Validates: Webview messaging works, extension is usable without AI_

### Phase 1c: Node.js Extension + Test Runner

7. **Grove for Node.js**: Jest runner integration
8. **Test runner registration**: Language extensions register runners with grove-core
9. **Run tests from Panel**: One-click test execution

_Validates: Test runner architecture, language extension pattern_

### Phase 2: Full Feature Set

10. **Template-based Creation**: Create examples from templates via Panel UI
11. **Bluehawk Snip**: Run snip with Bluehawk library integration
12. **Bluehawk Preview**: Live extraction preview pane
13. **Enhanced Panel**: Activity log, inline warnings, progress indicators

### Phase 3: Multi-Language & Polish

14. **Additional Languages**: Python, Go, Java, C#, mongosh extensions
15. **Language-specific Skills**: Skill files for each supported language
16. **Diagnostics**: Full diagnostic collection for all issue types
17. **literalinclude Navigation**: Click-to-open for RST file references

## Multi-Project Workspace Handling

Workspaces may contain multiple Grove projects (e.g., monorepo with `javascript/driver/` AND `python/driver/`).

| Behavior      | Implementation                                          |
| ------------- | ------------------------------------------------------- |
| **Detection** | Glob for `**/snip.js` at activation                     |
| **Panel UI**  | Project picker dropdown when multiple projects detected |
| **Context**   | Skill files use current project from Panel selection    |

## Test Framework Detection

Language extensions register test runners with grove-core:

```typescript
// Language extension registers a runner
groveCore.registerTestRunner({
  language: "nodejs",
  name: "Jest",
  run: (options: TestRunOptions) => Promise<TestResult>,
  detect: (projectPath: string) => Promise<boolean>,
});
```

When tests are run:

1. Detect language from project structure
2. Look up registered runner for that language
3. Execute runner command with appropriate arguments
4. Parse results and return structured output
5. If no runner found, return helpful error message

## Bluehawk Integration

Grove uses the Bluehawk **CLI** for snippet extraction, invoked via a wrapper in `bluehawk-runner.ts`:

- Defaults to `npx bluehawk` (no global install required)
- Configurable via the `grove.bluehawkPath` setting for custom installations
- Uses `execFile` (no shell) to prevent command injection
- Runs `bluehawk snip` with a temporary output directory for previews
- 30-second timeout for CLI execution

```typescript
// CLI wrapper usage (simplified)
const { bin, baseArgs } = getBluehawkCommand();
await execFileAsync(bin, [...baseArgs, "snip", "-o", tempDir, filePath], {
  cwd: workingDir,
  timeout: 30000,
});
```

## Writer Workflows

### Creating a New Code Example

1. **Open Grove Panel** → Click "+ Example" or ask AI in natural language
2. **Describe what you need** → "Create a Node.js example that inserts a document"
3. **AI reads skills** → AI reads `.skills/create-example.md` and `.agents/grove-nodejs.md`
4. **Review output** → Writer sees file with proper Bluehawk markup
5. **Run tests** → One-click in Panel or ask "run the tests"
6. **Snip** → Extract tested code to `content/code-examples/tested/`

### Fixing a Failing Test

1. **See failure in Panel** → Activity log shows failed test
2. **Ask AI** → "Why did filter.test.js fail?"
3. **AI reads context** → AI reads `.skills/fix-test.md` and the test output
4. **Get explanation** → AI explains the failure in plain language
5. **Apply fix** → AI suggests changes, writer confirms

### Using Grove with AI Assistants

Writers interact with Grove through natural language with any AI assistant:

| Writer Says                                 | AI Reads & Does                                  |
| ------------------------------------------- | ------------------------------------------------ |
| "Create a Python aggregation example"       | Reads skills, creates example + test files       |
| "Run the tests for insert examples"         | Executes `npm test` or equivalent                |
| "What's wrong with my filter test?"         | Reads test output, explains failure              |
| "Show me the Grove conventions for Node.js" | Reads `.agents/grove-nodejs.md`                  |
| "Snip all examples in this project"         | Reads `.skills/snip-code.md`, runs Bluehawk snip |

## Resolved Design Decisions

The following questions were resolved during the spec audit (see `grove-spec-audit.md`):

| Question                 | Decision                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| **Panel vs. Sidebar**    | Webview in sidebar container (like GitLens, MongoDB extension)            |
| **AI Integration**       | File-based skills & agents instead of MCP server (simpler, more portable) |
| **Frontend Technology**  | Plain HTML/CSS for MVP; Lit/Web Components if needed; no React            |
| **Bluehawk Integration** | CLI via `npx bluehawk` (configurable path), wrapped with `execFile`       |
| **Telemetry**            | Deferred to post-MVP                                                      |

## References

- Grove Platform: `../../docs-mongodb-internal/code-example-tests/README.md`
- Comparison Spec: `../../docs-mongodb-internal/code-example-tests/comparison-spec.md`
- Sample Data Spec: `../../docs-mongodb-internal/code-example-tests/sample-data-utility-spec.md`
- Repo Structure: `./repo-structure.md`
