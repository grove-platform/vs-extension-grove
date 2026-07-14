# Grove for Java

A VS Code extension that adds Java test runner support to Grove via Maven (`mvn test`). This extension integrates with `grove-core` to provide seamless test execution for Java code examples.

## Overview

Grove for Java activates alongside Grove Core when a workspace contains a `snip.js` file. It:

- Registers a Java test runner with Grove Core's test runner API
- **Builds the local comparison library** (`utilities/comparison-library`) before running tests
- Runs the project's tests with **`mvn test -B`**
- Parses Maven Surefire output to display results in VS Code

## Requirements

- **Grove Core** (`GrovePlatform.grove-platform-core`) must be installed
- **Apache Maven** (`mvn`) available on `PATH`, or configured via `grove.java.mavenPath`
- **JDK 21** (matches the Java driver test suite)

For the MongoDB docs Java driver suite (`code-example-tests/java/driver-sync`), Grove automatically runs:

```bash
mvn install -DskipTests -B -pl utilities -am
```

from the `java/` multi-module root before `mvn test` in the Grove project directory. This installs `com.mongodb.docs:comparison-library` and `sample-data` into your local Maven repository.

Grove loads `CONNECTION_STRING` from `driver-sync/.env`, `driver-sync/src/.env`, or `java/.env`. Use **Grove: Run Tests** from Grove Core to also inject a connection string from the Grove MongoDB UI.

## Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `grove.java.testTimeoutSeconds` | `300` | Max seconds for utilities build + test run |
| `grove.java.mavenPath` | `""` | Path to `mvn` when not on `PATH` |
| `grove.java.skipUtilitiesBuild` | `false` | Skip comparison-library install (use when already built) |

## Commands

| Command | Title | Description |
| ------- | ----- | ----------- |
| `grove.java.runTests` | Grove: Run Java Tests | Run all tests in the current project |
| `grove.java.runTestFile` | Grove: Run Current Java Test File | Run tests in the active file only |

## Architecture

```
grove-java/
├── src/
│   ├── extension.ts      # Extension entry point, Grove Core integration
│   └── test-runner.ts    # Maven utilities build, test args, spawn, parsing
└── package.json          # Extension manifest
```

### Test Runner

The test runner (`test-runner.ts`) provides:

#### `detectJavaProject(projectPath: string): Promise<boolean>`

Detects Java projects by checking for `pom.xml` or `build.gradle`, matching `@grove/shared` language detection.

#### `runJavaTests(options: TestRunOptions): Promise<TestResult>`

1. Resolves the Java multi-module root (parent `java/` directory when present)
2. Runs `mvn install -DskipTests -B -pl utilities -am` to build comparison-library locally
3. Runs `mvn test -B` in the Grove project directory (`driver-sync`, etc.)

| Scope | Command |
| ----- | ------- |
| All tests | `mvn test -B` |
| Single file | `mvn test -B -Dtest=TutorialTests` |
| Single method | `mvn test -B -Dtest=TutorialTests#TestFilter` |

Single-file runs use the test class name derived from the file basename (e.g. `TutorialTests.java` → `TutorialTests`), matching Maven Surefire conventions.

Also:

- Injects environment variables (including `CONNECTION_STRING` from Grove UI)
- Enforces timeout limits (default: 300s, max: 300s)
- Fails fast when `mvn` cannot be spawned
- Sums pass/fail/skip counts across Surefire summary lines

## Integration with Grove Core

Grove for Java is a **companion extension**. When users run **Grove: Run Tests** or **Grove: Run Current Test File** (the core commands), Grove Core delegates to this extension's Maven runner for Java projects.

## Development

From the repository root:

```bash
pnpm --filter grove-platform-java install
pnpm --filter grove-platform-java build
pnpm --filter grove-platform-java test
pnpm --filter grove-platform-java watch
```

## Manual comparison-library build

If you prefer to build utilities yourself:

```bash
cd code-example-tests/java
mvn install -DskipTests
```

Then set `grove.java.skipUtilitiesBuild` to `true` in VS Code settings.
