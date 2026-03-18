# Grove Extension Demo Script

Target length: ~5 minutes

## Setup (before recording)

- Open the `docs-mongodb-internal` monorepo in VS Code
- Make sure Grove is installed and activated (check for the Grove icon in the activity bar)
- Have a `.env` file with a valid `CONNECTION_STRING` in at least one test suite (e.g. `code-example-tests/javascript/driver/.env`)
- Close all editor tabs for a clean start
- Collapse the sidebar

## 1. Introduction & Project Detection (~30s)

**Show:** Click the Grove icon in the activity bar to open the sidebar panel.

**Talk through:**

- Grove is currently in beta — we're actively developing new features, including automated test and code example creation
- Grove automatically detected all the code-example-tests projects in the workspace
- Each project is listed by its friendly name (Node.js Driver, PyMongo, Go Driver, etc.)
- Click a project name to reveal it in the Explorer

## 2. MongoDB Connection (~45s)

**Show:** The MongoDB section in the Grove panel.

**Talk through:**

- Grove auto-connected using the `.env` file it found in the active project
- The panel shows the connection status, cluster type (Atlas/local), and hostname
- Show the "Show Databases" button — click it to list databases on the cluster

**Then:** Disconnect, and reconnect manually via the "Connect to MongoDB" button to show the UI flow. Enter a connection string when prompted.

## 3. RST Directive Navigation (~60s)

**Show:** Open an `.rst` file that contains `literalinclude` directives (e.g. a page in `source/` that references code examples).

**Talk through:**

- CodeLens annotations appear above each directive: "view", "source", "test"
- Click "view" to open the snippet output file
- Click "source" to jump to the Bluehawk source file with markup tags
- Click "test" to jump to the corresponding test file
- Ctrl+click (go-to-definition) on the file path works too

**Also show:**

- An `include` directive that references an extract — the "extract" CodeLens resolves the YAML reference

**Reference files:**

- Extracts: content/atlas/source/configure-api-access-project.txt
- include and io-code-block: content/atlas/source/atlas-search/operators-collectors/geoWithin.txt
- literalinclude, tested: content/manual/manual/source/includes/ts-create-collection-node.rst
- literalinclude, not tested: content/c-driver/current/source/crud/delete.txt

## 4. Test CodeLens (~45s)

**Show:** Open a test file (e.g. a `.test.js` in the Node.js driver suite).

**Talk through:**

- Test CodeLens currently supports the JavaScript and mongosh suites (more languages coming soon)
- "Run" and "Debug" buttons appear above each `describe` and `it`/`test` block
- Click "Run" on a single test — show the running spinner
- After it completes, show the pass/fail decorations and hover for duration info
- The test uses the MongoDB connection from Grove UI (injected as `CONNECTION_STRING`)

**Reference files:**

- create query collection test: code-example-tests/javascript/driver/tests/time-series/create-query-collection.test.js

## 5. Snippet Reference CodeLens (~30s)

**Show:** Open an example source file that contains `:snippet-start:` tags.

**Talk through:**

- Above each snippet tag, a CodeLens shows the reference count (e.g. "3 references")
- This tells you how many RST files include this snippet
- Click the reference count to see a list of all referencing files

**Reference files:**

- create query collection source: code-example-tests/javascript/driver/examples/time-series/create-query/create-query-collection.js

## 6. Bluehawk Preview (~30s)

**Show:** With the example source file still open, run "Grove: Open Bluehawk Preview" from the Command Palette.

**Talk through:**

- The Bluehawk Preview pane shows what each snippet will look like after extraction
- It strips out `:remove:` blocks, applies `:replace:` tags, etc.
- The preview updates automatically when you save the file

## 7. Feedback (~15s)

**Show:** Click "Send Feedback" in the Grove panel (or run the command).

**Talk through:**

- The feedback panel lets you file a bug or request a feature
- It pre-fills diagnostic info (extension version, OS, workspace context)
- Submitting opens a pre-filled Jira ticket in DOCSP

## Wrap-up (~15s)

Recap the key value props:

- Auto-detects projects — no configuration needed
- Navigate seamlessly between docs, source, and tests
- Run tests without leaving VS Code
- See snippet usage at a glance
- Preview Bluehawk output in real time
