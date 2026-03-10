# Grove Extension Spec Audit

Pre-implementation review of `grove-extension-spec.md` to identify gaps, risks, and open questions.

**Status**: 🔴 = Critical | 🟡 = Important | 🔵 = Nice to have

---

## 🔴 Critical: Security Risks

### 1. MCP Tool Execution Trust Model

**Issue**: The spec doesn't define the security boundary between Augment and Grove MCP tools. AI assistants can invoke tools without direct user initiation.

| Tool                   | Risk                    | Current Mitigation |
| ---------------------- | ----------------------- | ------------------ |
| `grove_run_tests`      | Executes shell commands | None specified     |
| `grove_create_example` | Writes files to disk    | None specified     |
| `grove_read_file`      | Reads arbitrary files   | None specified     |
| `grove_snip`           | Overwrites files        | None specified     |

**Potential Attacks**:

- Path traversal: `grove_read_file({ filePath: "../../../.env" })`
- Command injection via test path: `grove_run_tests({ testPath: "; rm -rf /" })`
- File bombing: AI creates thousands of files in a loop

**Proposed Resolution**:

Add "MCP Tool Security Model" section with:

- [ ] All file paths must resolve within workspace boundaries (use `path.resolve()` + prefix check)
- [ ] Test commands limited to known runners (jest, pytest, go test, etc.)
- [ ] Rate limiting: max 20 file operations per minute per tool
- [ ] Audit logging: all tool invocations logged to output channel
- [ ] Add timeout for `grove_run_tests` (default: 60 seconds, max: 300 seconds)
- [ ] Disallow `watch: true` mode via MCP (only available via Panel UI)
- [ ] Queue concurrent tool calls (max 1 execution per tool type at a time)
- [ ] Cap created file size at 100KB for `grove_create_example`
- [ ] Validate `snip.js` is a known Bluehawk config format before parsing

**Decision**: _To be discussed_

---

### 2. Credential Exposure via MCP

**Issue**: `grove_get_status` returns MongoDB connection status. Could this inadvertently expose connection string details to the AI?

**Current Spec**: Uses `context.secrets.store()` for credentials, but doesn't specify what `grove_get_status` returns.

**Proposed Resolution**:

- [ ] `grove_get_status` returns only: `{ connected: boolean, clusterType: "Atlas" | "local" | "unknown" }`
- [ ] Never include connection strings, hostnames, or credentials in MCP tool responses
- [ ] Add to Security Considerations section

**Decision**: _To be discussed_

---

## 🟡 Important: Technical Gaps

### 3. MCP Server Lifecycle

**Issue**: The spec says "Extension starts the bundled MCP server" but doesn't specify implementation details.

**Questions**:

- What transport? (stdio, HTTP, WebSocket)
- What happens if the server crashes?
- Multi-window: If user opens 2 VS Code windows with Grove projects, are there 2 servers?

**Proposed Resolution**:

| Aspect         | Recommendation                                       |
| -------------- | ---------------------------------------------------- |
| Transport      | stdio (simplest, matches Claude Desktop pattern)     |
| Crash handling | Auto-restart with exponential backoff, max 3 retries |
| Multi-window   | One server per workspace folder                      |

**Decision**: _To be discussed_

---

### 4. Multi-Project Workspace Handling

**Issue**: Workspaces may contain multiple Grove projects (e.g., monorepo with `javascript/driver/` AND `python/driver/`).

**Questions**:

- Does each project get its own MCP server instance?
- How does the Grove Panel show status for multiple projects?
- Which project does `grove_run_tests` target?

**Proposed Resolution**:

- [ ] Detect all Grove projects at activation (glob for `**/snip.js`)
- [ ] Grove Panel shows project picker dropdown
- [ ] All MCP tools require `projectPath` parameter (or use "current" project from Panel)
- [ ] One MCP server instance, multiple project contexts

**Decision**: _To be discussed_

---

### 5. Bluehawk Dependency

**Issue**: The spec mentions Bluehawk but doesn't clarify how it's consumed.

**Questions**:

- Is `bluehawk` CLI bundled, or must users install it?
- What version is supported?
- Is it invoked as a child process or imported as a library?

**Proposed Resolution**:

| Option                  | Pros                      | Cons                                       |
| ----------------------- | ------------------------- | ------------------------------------------ |
| Bundle CLI in extension | Zero-config for users     | Larger extension size (~5MB)               |
| Require global install  | Smaller extension         | Writers must run `npm install -g bluehawk` |
| Import as library       | Fastest, no child process | May have bundling issues                   |

**Recommendation**: Import `@mongodb-oss/bluehawk` as a library

- ✅ Zero-config for users (bundled in extension)
- ✅ Smaller footprint than CLI (~1MB vs ~5MB)
- ✅ Faster execution (no process spawn overhead)
- ✅ Better error handling (exceptions vs parsing CLI output)
- ⚠️ Need to verify library API supports our use cases (snip, extract)

**Action Items**:

- [ ] Verify `@mongodb-oss/bluehawk` exports the functions we need (`snip`, `extract`)
- [ ] Test bundling with Vite/esbuild to confirm no issues
- [ ] Fallback plan: shell out to CLI if library doesn't work

**Decision**: ✅ Import as library (try first, fall back to CLI if needed)

### 6. Test Framework Detection

**Issue**: `grove_run_tests` doesn't specify how it determines which test framework to use.

**Questions**:

- How does it know to run `jest` vs `pytest` vs `go test`?
- What if the test framework isn't installed?
- Who provides the runner: grove-core or language extensions?

**Proposed Resolution**:

- [ ] Language extensions register test runners with grove-core
- [ ] Each runner specifies: command, file pattern, result parser
- [ ] `grove_run_tests` delegates to appropriate language extension
- [ ] If runner not found, return helpful error message

**Decision**: _To be discussed_

---

## 🟡 Important: Open Questions Requiring Resolution

### 7. Panel vs. Sidebar (Existing Open Question #1)

**Current Options**:

- **Sidebar**: Always visible, feels native
- **Webview Panel**: More UI flexibility, can be closed

**Analysis**:

| Approach           | Pros                                    | Cons                              |
| ------------------ | --------------------------------------- | --------------------------------- |
| Sidebar (TreeView) | Native look, low effort, always visible | Limited UI (just trees/lists)     |
| Webview in Sidebar | Rich UI, always visible                 | More complex, messaging overhead  |
| Webview Panel      | Full control, can be large              | Takes editor space, can be closed |

**Recommendation**: Webview in Sidebar container (like GitLens, MongoDB extension)

**Decision**: _To be discussed_

---

### 8. Tool Confirmation UX (Existing Open Question #2)

**Issue**: Should destructive MCP tools require user confirmation?

**Current Options**:

- Augment handles confirmation via its own UX
- Grove adds VS Code notification for additional safety

**Analysis**:

Augment already prompts users before executing tools that modify files. Adding Grove-specific confirmation would create double-prompting:

```
Augment: "I'll create basic-insert.js. Proceed?" → User clicks Yes
Grove: "Create file basic-insert.js?" → User clicks Yes again  ❌ Bad UX
```

**Recommendation**: Trust Augment's confirmation UX. Grove should NOT add its own confirmation layer, but SHOULD:

- [ ] Log all tool invocations to "Grove" output channel
- [ ] Show toast notification after file creation (non-blocking)

**Decision**: _To be discussed_

---

### 9. Auto-registration with Augment (Existing Open Question #3)

**Issue**: Can the extension programmatically register the Grove MCP server with Augment?

**Investigation Result**: ❌ **No programmatic API exists.**

Augment does not expose a VS Code command or extension API for programmatic MCP server registration. The available methods are:

| Method         | User Effort         | Can Grove Automate?          |
| -------------- | ------------------- | ---------------------------- |
| Easy MCP       | One-click           | ❌ Augment-curated list only |
| Settings Panel | ~5 clicks + typing  | ❌ No API                    |
| JSON Import    | Copy → Paste → Save | ⚠️ Partially                 |

**Recommended Approach**: "One-Click Import" UX

1. **"Grove: Copy MCP Configuration" command** — copies JSON to clipboard
2. **Grove Panel setup section** — shows instructions when Augment not configured
3. **Toast notification** — "MCP config copied! Paste in Augment Settings → Import from JSON"

**Generated JSON**:

```json
{
  "mcpServers": {
    "grove": {
      "command": "node",
      "args": ["${extensionPath}/mcp-server/dist/index.js"],
      "env": { "GROVE_WORKSPACE": "${workspaceFolder}" }
    }
  }
}
```

**Future**: If Augment adds an API, we can revisit auto-registration.

**Decision**: ✅ Implement "Copy to Clipboard" + guided setup UX

---

### 10. Error Handling Strategy (New)

**Issue**: How should MCP tools report errors to the AI?

**Options**:

| Approach         | Example                                                      | Pros             | Cons                              |
| ---------------- | ------------------------------------------------------------ | ---------------- | --------------------------------- |
| Throw exception  | `throw new Error("File not found")`                          | Simple           | AI may not understand             |
| Structured error | `{ error: { code: "FILE_NOT_FOUND", message: "..." } }`      | Machine-readable | More complex                      |
| Prose in content | `return { content: "I couldn't find that file because..." }` | AI-friendly      | Harder to detect programmatically |

**Recommendation**: Structured error with AI-friendly message:

```typescript
{
  isError: true,
  content: [{
    type: "text",
    text: "Could not run tests: Jest is not installed in this project. Run `npm install` first."
  }]
}
```

**Decision**: _To be discussed_

---

### 11. Multi-Project Workspaces (New)

See Technical Gap #4 above.

---

### 12. Offline/Air-gapped Mode (New)

**Issue**: Can writers use the Grove Panel without Augment at all?

**Context**: Some writers may not have Augment installed, or may be in environments where AI tools are restricted.

**Proposed Resolution**:

The Grove Panel should be fully functional without AI:

- [ ] "+ Example" button opens template picker (no AI)
- [ ] "Run Tests" button works directly
- [ ] "Snip" button works directly
- [ ] AI features are additive, not required

**Decision**: _To be discussed_

---

### 13. Telemetry (New)

**Issue**: Will the extension collect usage data? How is consent handled?

**MongoDB's Position**: Need to check with legal/compliance.

**Typical Approach**:

- Respect VS Code's `telemetry.telemetryLevel` setting
- If collecting, use VS Code's `@vscode/extension-telemetry` package
- Document what is collected in README

**Decision**: ⏭️ Deferred — out of scope for MVP. Revisit post-launch.

---

## 🔵 Nice to Have: Implementation Concerns

### 14. Phase 1 Scope

**Issue**: Phase 1 may be too large for an initial milestone.

**Current Phase 1**:

1. Grove Core (project detection, status bar, panel skeleton)
2. MCP Server (2 tools)
3. Node.js Extension (Jest runner, scaffolding)

**Proposed Split**:

| Phase  | Deliverable                                                                 | Validates                |
| ------ | --------------------------------------------------------------------------- | ------------------------ |
| **1a** | Project detection + status bar + basic MCP server (`grove_get_status` only) | MCP integration works    |
| **1b** | Grove Panel skeleton + `grove_read_file`                                    | Webview messaging works  |
| **1c** | Node.js extension + `grove_run_tests`                                       | Test runner architecture |
| **2**  | Full tool suite                                                             | Everything else          |

**Decision**: _To be discussed_

---

### 15. Webview Complexity

**Issue**: The Grove Panel mockup implies significant frontend work.

**Features in Mockup**:

- Real-time MongoDB connection status
- Activity log with timestamps
- Progress indicators
- Quick action buttons

**Estimated Effort**:

- Plain HTML/CSS: 2-3 days
- Lit/Web Components: 3-4 days
- Vue (if needed): 4-5 days
- With real-time updates: +2 days

**Technology Decision**:

- ❌ No React
- ✅ Start with plain HTML/CSS
- ✅ If components needed later: Lit/Web Components or Vue

**Decision**: ✅ Plain HTML/CSS for MVP, upgrade to Lit if needed

---

## Summary

| #   | Issue                     | Severity        | Status                    |
| --- | ------------------------- | --------------- | ------------------------- |
| 1   | MCP Tool Security Model   | 🔴 Critical     | ✅ Added to spec          |
| 2   | Credential Exposure       | 🔴 Critical     | ✅ Added to spec          |
| 3   | MCP Server Lifecycle      | 🟡 Important    | ✅ Added to spec          |
| 4   | Multi-Project Workspaces  | 🟡 Important    | ✅ Added to spec          |
| 5   | Bluehawk Dependency       | 🟡 Important    | ✅ Import as library      |
| 6   | Test Framework Detection  | 🟡 Important    | ✅ Added to spec          |
| 7   | Panel vs. Sidebar         | 🟡 Important    | ✅ Webview in sidebar     |
| 8   | Tool Confirmation UX      | 🟡 Important    | ✅ Trust Augment UX       |
| 9   | Augment Auto-registration | 🟡 Important    | ✅ Copy-to-clipboard UX   |
| 10  | Error Handling Strategy   | 🟡 Important    | ✅ Structured errors      |
| 11  | Multi-Project (see #4)    | 🟡 Important    | ✅ (see #4)               |
| 12  | Offline Mode              | 🟡 Important    | ✅ Panel works without AI |
| 13  | Telemetry                 | � Nice to have  | ⏭️ Deferred (post-MVP)    |
| 14  | Phase 1 Scope             | 🔵 Nice to have | ✅ Split into 1a, 1b, 1c  |
| 15  | Webview Complexity        | 🔵 Nice to have | ✅ HTML/CSS, then Lit     |

---

## Next Steps

1. ~~Review each item and mark decisions~~ ✅ Complete
2. ~~Update `grove-extension-spec.md` with resolutions~~ ✅ Complete
3. Create implementation plan based on finalized spec

---
