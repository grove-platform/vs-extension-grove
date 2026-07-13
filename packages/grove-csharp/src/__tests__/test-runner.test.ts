import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTestArgs,
  detectCSharpProject,
  parseDotnetOutput,
  resolveDotnetBin,
  resolveTestProjectForFile,
  resolveDefaultTestProject,
  runCSharpTests,
} from "../test-runner";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectCSharpProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-csharp-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect a .csproj file", async () => {
    await fs.writeFile(
      path.join(tempDir, "Driver.csproj"),
      "<Project></Project>\n",
    );
    expect(await detectCSharpProject(tempDir)).toBe(true);
  });

  it("should detect a .sln file", async () => {
    await fs.writeFile(path.join(tempDir, "Driver.sln"), "\n");
    expect(await detectCSharpProject(tempDir)).toBe(true);
  });

  it("should return false when no project markers found", async () => {
    await fs.writeFile(path.join(tempDir, "Program.cs"), "// code\n");
    expect(await detectCSharpProject(tempDir)).toBe(false);
  });

  it("should return false for empty directory", async () => {
    expect(await detectCSharpProject(tempDir)).toBe(false);
  });
});

describe("resolveDotnetBin", () => {
  it("should prefer an explicit dotnet path", () => {
    expect(resolveDotnetBin("/usr/local/bin/dotnet")).toBe(
      "/usr/local/bin/dotnet",
    );
  });

  it("should use fallback when no explicit path", () => {
    expect(resolveDotnetBin(undefined, "/opt/dotnet/dotnet")).toBe(
      "/opt/dotnet/dotnet",
    );
  });

  it("should prefer explicit over fallback", () => {
    expect(resolveDotnetBin("/a/dotnet", "/b/dotnet")).toBe("/a/dotnet");
  });

  it("should fall back to system dotnet when nothing provided", () => {
    const bin = resolveDotnetBin();
    expect(bin === "dotnet" || bin === "dotnet.exe").toBe(true);
  });
});

describe("buildTestArgs", () => {
  it("minimal when no file or pattern", () => {
    expect(buildTestArgs({ testProject: "Tests/Tests.csproj" })).toEqual([
      "test",
      "Tests/Tests.csproj",
      "--nologo",
      "--verbosity",
      "normal",
    ]);
  });

  it("filters by class name derived from the test file", () => {
    expect(buildTestArgs({ testFile: "tests/InsertTests.cs" })).toEqual([
      "test",
      "--nologo",
      "--verbosity",
      "normal",
      "--filter",
      "FullyQualifiedName~InsertTests",
    ]);
  });

  it("scopes to a test project when provided", () => {
    expect(
      buildTestArgs({
        testFile: "Tests/Aggregation/InsertTests.cs",
        testProject: "Tests/Tests.csproj",
      }),
    ).toEqual([
      "test",
      "Tests/Tests.csproj",
      "--nologo",
      "--verbosity",
      "normal",
      "--filter",
      "FullyQualifiedName~InsertTests",
    ]);
  });

  it("filters by test name pattern", () => {
    expect(buildTestArgs({ testNamePattern: "ShouldInsert" })).toEqual([
      "test",
      "--nologo",
      "--verbosity",
      "normal",
      "--filter",
      "DisplayName~ShouldInsert",
    ]);
  });

  it("ANDs file and name pattern into one filter", () => {
    expect(
      buildTestArgs({
        testFile: "tests/InsertTests.cs",
        testNamePattern: "ShouldInsert",
      }),
    ).toEqual([
      "test",
      "--nologo",
      "--verbosity",
      "normal",
      "--filter",
      "FullyQualifiedName~InsertTests&DisplayName~ShouldInsert",
    ]);
  });
});

describe("resolveTestProjectForFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-csharp-csproj-"));
    await fs.mkdir(path.join(tempDir, "Tests", "Aggregation"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tempDir, "Tests", "Tests.csproj"),
      "<Project></Project>\n",
    );
    await fs.writeFile(
      path.join(tempDir, "Tests", "Aggregation", "InsertTests.cs"),
      "// test\n",
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should find the owning csproj for a nested test file", async () => {
    expect(
      await resolveTestProjectForFile(
        tempDir,
        "Tests/Aggregation/InsertTests.cs",
      ),
    ).toBe("Tests/Tests.csproj");
  });
});

describe("resolveDefaultTestProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-csharp-default-"));
    await fs.mkdir(path.join(tempDir, "Tests"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "Tests", "Tests.csproj"),
      "<Project></Project>\n",
    );
    await fs.writeFile(path.join(tempDir, "driver.sln"), "\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should prefer Tests/Tests.csproj for run-all", async () => {
    expect(await resolveDefaultTestProject(tempDir)).toBe("Tests/Tests.csproj");
  });
});

describe("parseDotnetOutput", () => {
  it("should parse a passing summary line", () => {
    const result = parseDotnetOutput(
      "Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 5 ms",
    );
    expect(result).toEqual({ total: 7, passed: 7, failed: 0, skipped: 0 });
  });

  it("should parse a failing summary line", () => {
    const result = parseDotnetOutput(
      "Failed!  - Failed:     2, Passed:     5, Skipped:     1, Total:     8, Duration: 8 ms",
    );
    expect(result).toEqual({ total: 8, passed: 5, failed: 2, skipped: 1 });
  });

  it("should sum counts across multiple test projects", () => {
    const result = parseDotnetOutput(`
Passed!  - Failed:     0, Passed:     3, Skipped:     0, Total:     3, Duration: 5 ms
Failed!  - Failed:     1, Passed:     2, Skipped:     0, Total:     3, Duration: 6 ms
`);
    expect(result).toEqual({ total: 6, passed: 5, failed: 1, skipped: 0 });
  });

  it("should return zeros when no summary line found", () => {
    expect(parseDotnetOutput("dotnet: command not found")).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it("should parse NUnit adapter summary output", () => {
    const result = parseDotnetOutput(`
NUnit Adapter 5.2.0.0: Test execution complete
  Passed TestRunChangeStreamSplitLargeEvent [3 s]

Test Run Successful.
Total tests: 1
     Passed: 1
 Total time: 4.8113 Seconds
`);
    expect(result).toEqual({ total: 1, passed: 1, failed: 0, skipped: 0 });
  });
});

describe("runCSharpTests spawn error", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-csharp-spawn-"));
    await fs.writeFile(
      path.join(tempDir, "Driver.csproj"),
      "<Project></Project>\n",
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should fail fast with a clear message when dotnet is missing", async () => {
    const result = await runCSharpTests({
      projectPath: tempDir,
      dotnetPath: "/nonexistent/grove-csharp-missing-dotnet",
      timeout: 5_000,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatch(/Failed to launch dotnet:/);
    expect(result.output).toMatch(/Executable:/);
    expect(result.duration).toBeLessThan(4_000);
  });
});
