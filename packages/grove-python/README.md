# Grove for Python

A VS Code extension that adds Python test runner support to Grove (pytest and unittest). This extension integrates with `grove-core` to provide seamless test execution for Python code examples.

## Overview

Grove for Python activates alongside Grove Core when a workspace contains a `snip.js` file. It:

- Registers a Python test runner with Grove Core's test runner API
- Runs **pytest** or **`unittest discover tests_package`** depending on project layout (`tests_package/` selects unittest when pytest is not configured)
- Uses the project **`venv/`** or **`.venv/`** interpreter when present
- Parses test output to display results in VS Code

## Requirements

- **Grove Core** (`GrovePlatform.grove-platform-core`) must be installed
- Python 3 with project dependencies installed in **`venv/`** (PyMongo) or **`.venv/`**
- Or VS Code's selected Python interpreter with test dependencies installed

### PyMongo setup

From `code-example-tests/python/pymongo`:

```sh
source ./venv/bin/activate
python3 -m unittest discover tests_package
deactivate
```

Grove runs the same unittest command using `venv/bin/python` automatically.

## Commands

| Command                    | Title                              | Description                          |
| -------------------------- | ---------------------------------- | ------------------------------------ |
| `grove.python.runTests`    | Grove: Run Python Tests            | Run all tests in the current project |
| `grove.python.runTestFile` | Grove: Run Current Python Test File | Run tests in the active file only   |

## Architecture

```
grove-python/
├── src/
│   ├── extension.ts      # Extension entry point, Grove Core integration
│   └── test-runner.ts    # Test subprocess args, spawn, output parsing
└── package.json          # Extension manifest
```

### Extension Activation

On activation, the extension:

1. Gets the Grove Core extension API
2. Registers the Python test runner via `coreApi.registerTestRunner()`
3. Registers Python-specific commands

```typescript
coreApi.registerTestRunner({
  language: "python",
  name: "Python",
  run: runPythonTests,
  detect: detectPythonProject,
});
```

### Test Runner

The test runner (`test-runner.ts`) provides:

#### `detectPythonProject(projectPath: string): Promise<boolean>`

Detects Python projects by checking for `pyproject.toml` or `pytest.ini`, matching `@grove/shared` language detection.

#### `runPythonTests(options: TestRunOptions): Promise<TestResult>`

Runs tests using the project's Python environment:

| Project type | Command |
|--------------|---------|
| PyMongo-style (`tests_package/`, no pytest config) | `python -m unittest discover tests_package` |
| pytest (`pytest.ini` or `[tool.pytest]` in `pyproject.toml`) | `python -m pytest --tb=short -q` |
| Single file | `python -m unittest <relative-path>` or scoped pytest path |

Interpreter resolution (in order):

1. Project **`venv/bin/python`** or **`.venv/bin/python`**
2. VS Code's **Python: Default Interpreter Path** setting
3. System `python3` / `python`

The output channel shows `Using Python: ...` so you can verify which interpreter ran.

Also:

- **pytest:** `-k` test name filtering via `testNamePattern` when provided
- **unittest discover:** `-k` is passed when `testNamePattern` is set (supported since Python 3.7)
- **unittest single file:** `testNamePattern` is ignored; `-k` is not passed for a single module path (reliable only on Python 3.12+ if we did pass it)
- Injects environment variables (including `CONNECTION_STRING` from Grove UI)
- Enforces timeout limits (default: 60s, max: 300s)
- If the interpreter cannot be spawned (missing binary, permission), the run fails immediately with a clear error instead of hanging until timeout

## Integration with Grove Core

Grove for Python is a **companion extension** that extends Grove Core's functionality. When users run `Grove: Run Tests` (the core command), Grove Core automatically delegates to this extension's Python runner for Python projects.

## Development

From the repository root:

```bash
# Install dependencies
pnpm --filter grove-platform-python install

# Build the extension
pnpm --filter grove-platform-python build

# Run tests
pnpm --filter grove-platform-python test

# Watch mode
pnpm --filter grove-platform-python watch
```
