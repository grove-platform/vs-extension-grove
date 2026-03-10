# Grove Extension Discovery

Grove is a test platform for code examples that are used in the MongoDB documentation. It balances technical accuracy with user experience. Technical writers with a range of programming knowledge need to use Grove to create and test code examples.

We need a VS Code extension pack focused on:

- abstracting and automating Grove functions
- enforcing standards
- scaffolding test files
- differentiated AI agents that work with the VS Code API and GitHub Copilot

## Extension Pack Architecture

This extension pack provides a core extension for shared Grove functionality plus per-language extensions that users install based on which drivers they work with. All extensions auto-detect Grove projects via `snip.js` presence.

### Tech Stack

All extensions use modern tooling:

- **TypeScript 5.x** with strict mode
- **Vite** for fast bundling and development
- **pnpm** for workspace management
- **Mocha + Chai** for all testing (via `@vscode/test-electron`)
- **ESLint 9.x + Prettier 3.x** for code quality

See [repo-structure.md](./repo-structure.md) for detailed tech stack and tooling configuration.

### Extension Pack Structure

| Extension             | ID                      | Purpose                                                                                     |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| **Grove Core**        | `mongodb.grove-core`    | Project detection, status bar, Bluehawk preview, `literalinclude` links, symlink management |
| **Grove for Node.js** | `mongodb.grove-nodejs`  | Jest runner, scaffolding, `@grove-nodejs` agent                                             |
| **Grove for Python**  | `mongodb.grove-python`  | unittest/pytest runner, scaffolding, `@grove-python` agent                                  |
| **Grove for Go**      | `mongodb.grove-go`      | go test runner, scaffolding, `@grove-go` agent                                              |
| **Grove for Java**    | `mongodb.grove-java`    | JUnit runner, scaffolding, `@grove-java` agent                                              |
| **Grove for C#**      | `mongodb.grove-csharp`  | NUnit runner, scaffolding, `@grove-csharp` agent                                            |
| **Grove for mongosh** | `mongodb.grove-mongosh` | Jest runner, shell scaffolding, `@grove-mongosh` agent                                      |

## Security Considerations

The extension executes shell commands and accesses the file system, requiring careful security design.

### Workspace Trust

Declare `untrustedWorkspaces: { supported: 'limited' }` in each extension's `package.json`. In untrusted workspaces:

- Disable shell command execution (bluehawk, test runners)
- Disable symlink creation
- Allow read-only features (literalinclude navigation, Bluehawk preview)

### Credential Storage

Never store or log MongoDB connection strings in plain text:

- Use `context.secrets.store()` / `context.secrets.get()` for credential storage
- Clear credentials from memory after use
- Mask connection strings in any log output

### Shell Command Execution

Prevent command injection:

- Use parameterized execution (pass args as arrays, never interpolate user input into command strings)
- Validate all file paths before passing to shell commands
- Consider using VS Code's Task API for test runners instead of raw `child_process`

### File System Boundaries

Restrict file access to workspace folders:

- Validate all paths are within workspace boundaries before read/write operations
- Sanitize paths from `snip.js` parsing before use
- Reject symlink targets that point outside the workspace

## Proposed Features

### Core Extension Features

1. **Project auto-detection**: Use `workspaceContains:**/snip.js` activation event for efficient detection. Parse `START_DIRECTORY` and `OUTPUT_DIRECTORY` to determine language and paths. Expose detected projects via `grove.getDetectedProjects()` API.

2. **Status bar integration**: Show MongoDB connection status and available sample databases. Use `context.secrets` for credential storage, not raw env vars.

3. **Language status items**: Use `languages.createLanguageStatusItem()` to show per-file Grove status (detected project, test status) in addition to global status bar.

4. **Bluehawk preview pane**: Show a live preview of what `snip.js` will extract using `bluehawk snip --dry-run`. Highlights `:snippet-start:`, `:remove:`, and `:replace:` blocks to visualize final output before running the script.

5. **In-file pathing for literalinclude**: Parse RST files and provide hover/click-to-open for referenced files in `code-example-tests/` and `content/code-examples/tested/`.

6. **Symlink management**: Detect when a docs project lacks the required symlink to `content/code-examples/tested` and offer one-click creation with path validation.

7. **Diagnostic collection**: Use `languages.createDiagnosticCollection()` to report issues inline:
   - Missing symlinks in docs projects
   - Invalid Bluehawk markup syntax
   - Broken literalinclude references

8. **Progress indicators**: Use `window.withProgress()` for all long-running operations (project detection, test runs, snip operations).

9. **Settings schema**: Define `contributes.configuration` with JSON Schema for all settings, including:
   - `grove.connectionString` (stored securely)
   - `grove.bluehawkPath` (path to bluehawk CLI)
   - `grove.autoDetect` (enable/disable auto-detection)

### Language Extension Features

1. **Scaffolding commands**: Generate boilerplate for new examples, tests, and expected output files via Command Palette (e.g., "Grove: New JavaScript Example") with proper Bluehawk markup and directory structure pre-populated.

2. **Test runner integration**: Run Jest/pytest/go test/JUnit/NUnit tests directly from the editor with output in VS Code's Test Explorer. Show pass/fail status inline next to example functions. Implement:
   - `resolveHandler` for lazy test discovery (don't scan all tests upfront)
   - `refreshHandler` for manual refresh
   - `TestRunProfile` with `runHandler`

3. **Test coverage**: Implement `loadDetailedCoverage` on TestRunProfile to show code coverage for tested examples.

4. **Comparison API autocomplete**: Provide IntelliSense for the `Expect` fluent API and expected-output file syntax (ellipsis patterns, `ignoreFieldValues`, MongoDB constructors).

5. **Differentiated AI agents**: Language-specific Chat participants that understand driver patterns and Grove conventions. Examples:
   - **Node.js Driver**: Knows MongoDB Node.js Driver best practices, Grove comparison API, can create new test files based on prompts
   - **mongosh**: Understands mongosh commands and patterns, Grove comparison API, can create shell-based test files
   - **PyMongo**: Understands Python patterns, pytest/unittest conventions, Grove comparison API
   - **Go Driver**: Understands Go idioms, go test conventions, Grove comparison API
   - **C# Driver**: Understands .NET patterns, NUnit conventions, Grove comparison API
   - **Java Driver**: Understands Java patterns, JUnit conventions, Grove comparison API

## Implementation Steps

1. **Implement project auto-detection in Core**: Use `workspaceContains:**/snip.js` activation event—VS Code handles the file search efficiently. Parse `START_DIRECTORY` and `OUTPUT_DIRECTORY` constants to determine language and project paths. Expose detected projects via `grove.getDetectedProjects()` API for language extensions to consume.

2. **Configure extension dependencies**: Each language extension must declare `extensionDependencies: ["mongodb.grove-core"]` in `package.json` to ensure core activates first. Use activation events:

   ```json
   "activationEvents": ["onStartupFinished", "workspaceContains:**/snip.js"]
   ```

3. **Build status bar in Core**: Create `StatusBarItem` showing MongoDB connection status and available sample databases. Use `context.secrets` for credential storage. Query databases matching the registry from `sample-data-utility-spec.md`. Update on workspace change.

4. **Implement logging and telemetry**: Use `window.createOutputChannel('Grove', { log: true })` for leveled logging. Use `env.createTelemetryLogger()` with a custom `TelemetrySender` that respects `telemetry.telemetryLevel`.

5. **Implement Bluehawk preview in Core**: Register command `grove.previewSnippet` that runs `bluehawk snip --dry-run` on the current file, parses JSON output, and renders extracted snippets in a Webview panel with syntax highlighting.

6. **Create agent definition schema in `.github/agents/`**: Define YAML agent files (e.g., `grove-nodejs.agent.yml`) specifying: agent name, description, system prompt (referencing existing migration instructions), and declared tools. Core extension loads these at activation.

7. **Register Chat participants from agent files**: For each agent file in `.github/agents/`, register a `ChatParticipant` via `vscode.chat.createChatParticipant()`. Bind declared tools using `ChatParticipantToolAccess` with explicit tool implementations that agents invoke (never direct filesystem access).

8. **Define tool interfaces for agents**: Create tools like `grove.createExampleFile`, `grove.createTestFile`, `grove.runTests`, `grove.runSnip`. Agents invoke these via the Chat tool API; tools handle file creation with user confirmation prompts before writing.

9. **Implement per-language test runners**: Each language extension registers a `TestController` that discovers tests in `tests/` directories and runs via the appropriate command (Jest, pytest, go test, mvn test, dotnet test). Implement lazy discovery via `resolveHandler`.

10. **Add graceful degradation**: Wrap each feature in try-catch blocks. Disable broken features rather than crashing the extension. Log errors to the Output channel.

## Agent Tool Boundaries

Agents invoke these tools (never raw filesystem APIs):

| Tool                      | Behavior                                               | Confirmation Required |
| ------------------------- | ------------------------------------------------------ | --------------------- |
| `grove.createExampleFile` | Generates example from template, writes to `examples/` | Yes (shows preview)   |
| `grove.createTestFile`    | Generates test stub, writes to `tests/`                | Yes (shows preview)   |
| `grove.runTests`          | Executes test command, streams output                  | No                    |
| `grove.runSnip`           | Runs `bluehawk snip`, shows extracted files            | No                    |
| `grove.readFile`          | Reads file content for agent context                   | No                    |

## Agent Definition Schema

Agent files in `.github/agents/` use YAML format to align with GitHub Actions conventions:

```yaml
# .github/agents/grove-nodejs.agent.yml
name: grove-nodejs
displayName: Grove Node.js Agent
description: Creates and tests Node.js Driver code examples
systemPrompt: |
  You are an expert in MongoDB Node.js Driver code examples.
  Follow the patterns in code-example-tests/javascript/driver/.
  Use Bluehawk markup for snippets. Use the Expect API for assertions.
promptFiles:
  - .github/prompts/grove/javascript-code-example-test-migration-instructions.md
tools:
  - grove.createExampleFile
  - grove.createTestFile
  - grove.runTests
  - grove.runSnip
  - grove.readFile
```

## Maintenance & Operations

### Logging

Use `LogOutputChannel` for leveled logging:

```typescript
const log = vscode.window.createOutputChannel("Grove", { log: true });
log.trace("Detailed debug info");
log.debug("Debug info");
log.info("General info");
log.warn("Warnings");
log.error("Errors");
```

### Telemetry

Use `TelemetryLogger` to respect user privacy settings:

```typescript
const telemetry = vscode.env.createTelemetryLogger(sender);
telemetry.logUsage("grove.testRun", { language: "nodejs", duration: 1234 });
```

Telemetry automatically respects the `telemetry.telemetryLevel` setting.

### Configuration Migration

Provide a `grove.migrateSettings` command to migrate deprecated settings when the schema changes.

### Error Recovery

- Wrap each feature in try-catch blocks
- Disable broken features rather than crashing
- Log errors to Output channel with actionable context
- Consider auto-restart for test runners on failure

## Open Questions

1. **Extension activation events**: Should language extensions activate on workspace open (eager) or only when a Grove project of that language is detected (lazy)?
   - **Resolved**: Use lazy activation via `workspaceContains:**/snip.js` activation event plus `extensionDependencies` on grove-core

2. **Telemetry scope**: What events should we track? Suggested minimal set:
   - Extension activation (language detected)
   - Test runs (language, pass/fail count, duration)
   - Agent tool invocations (tool name, success/failure)
   - Errors (anonymized error types, not messages)

## References

- Grove README: `../../docs-mongodb-internal/code-example-tests/README.md`
- Comparison spec: `../../docs-mongodb-internal/code-example-tests/comparison-spec.md`
- Sample data utility spec: `../../docs-mongodb-internal/code-example-tests/sample-data-utility-spec.md`
- Test suites:
  - command line: `../../docs-mongodb-internal/code-example-tests/command-line/mongosh`
  - C# driver: `../../docs-mongodb-internal/code-example-tests/csharp/driver`
  - Go driver: `../../docs-mongodb-internal/code-example-tests/go/driver`
  - Java sync driver: `../../docs-mongodb-internal/code-example-tests/java/driver-sync`
  - Node.js driver: `../../docs-mongodb-internal/code-example-tests/javascript/driver`
  - PyMongo driver: `../../docs-mongodb-internal/code-example-tests/python/pymongo`
- MongoDB docs: `../../docs-mongodb-internal/content`
