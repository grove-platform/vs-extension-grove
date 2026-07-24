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
- A **`pom.xml`** in the Grove project (Gradle-only projects are not supported)

For the MongoDB docs Java driver suite (`code-example-tests/java/driver-sync`), Grove automatically runs:

```bash
mvn install -DskipTests -B -pl utilities/comparison-library,utilities/sample-data -am
```

from the `java/` multi-module root before `mvn test` in the Grove project directory. This installs `com.mongodb.docs:comparison-library` and `sample-data` into your local Maven repository.

Grove Core loads `CONNECTION_STRING` from `driver-sync/.env`, `driver-sync/src/.env`, or `java/.env`. Use **Grove: Run Tests** from Grove Core to also inject a connection string from the Grove MongoDB UI.

## Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `grove.java.utilitiesTimeoutSeconds` | `180` | Max seconds for the utilities install phase |
| `grove.java.testTimeoutSeconds` | `300` | Max seconds for the Maven test phase |
| `grove.java.mavenPath` | `""` | Path to `mvn` when not on `PATH` |
| `grove.java.skipUtilitiesBuild` | `false` | Skip comparison-library install (use when already built) |

## Commands

| Command | Title | Description |
| ------- | ----- | ----------- |
| `grove.java.runTests` | Grove: Run Java Tests | Run all tests in the current project |
| `grove.java.runTestFile` | Grove: Run Current Java Test File | Run tests in the active file only |

The language-specific commands above route through Grove Core's `runGroveTests` API, so they use the same `.env` loading, MongoDB connection injection, connection-string masking, and Grove Tests output channel as **Grove: Run Tests** and **Grove: Run Current Test File**.

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

Detects Maven Java projects by checking for `pom.xml`.

#### `runJavaTests(options: TestRunOptions): Promise<TestResult>`

1. Resolves the Java multi-module root (parent `java/` directory when present)
2. Runs `mvn install -DskipTests -B -pl utilities/comparison-library,utilities/sample-data -am` to build comparison-library locally
3. Runs `mvn test -B` in the Grove project directory (`driver-sync`, etc.)

| Scope | Command |
| ----- | ------- |
| All tests | `mvn test -B` |
| Single file | `mvn test -B -Dtest=aggregation.pipelines.TutorialTests` |
| Single method | `mvn test -B -Dtest=aggregation.pipelines.TutorialTests#TestFilter` |

Single-file runs derive the Surefire class name from the path under `src/test/java/` (FQCN), not just the file basename.

Also:

- Receives environment variables from Grove Core (including `CONNECTION_STRING` from `.env` or the Grove UI)
- Uses separate timeout budgets for utilities install and test execution
- Fails fast when `mvn` cannot be spawned
- Treats scoped runs that match zero tests as failures
- Sums pass/fail/skip counts across Surefire summary lines

## Integration with Grove Core

Grove for Java is a **companion extension**. It registers a Maven test runner with Grove Core and routes its own commands through Grove Core's shared test execution (`runGroveTests`), so project resolution, `.env` loading, trust checks, and output all use the unified **Grove Tests** channel.

When users run **Grove: Run Tests** or **Grove: Run Current Test File** (the core commands), Grove Core delegates to this extension's Maven runner for Java projects.

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
mvn install -DskipTests -B -pl utilities/comparison-library,utilities/sample-data -am
```

Then set `grove.java.skipUtilitiesBuild` to `true` in VS Code settings.
