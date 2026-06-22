import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTestArgs,
  detectPythonProject,
  parsePytestOutput,
  parseUnittestOutput,
  resolvePythonBin,
  resolveTestFramework,
  resolveUnittestDiscoverDir,
  runPythonTests,
  usesPytest,
} from "../test-runner";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectPythonProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-python-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect pyproject.toml", async () => {
    await fs.writeFile(
      path.join(tempDir, "pyproject.toml"),
      "[tool.pytest.ini_options]\n",
    );
    expect(await detectPythonProject(tempDir)).toBe(true);
  });

  it("should detect pytest.ini", async () => {
    await fs.writeFile(path.join(tempDir, "pytest.ini"), "[pytest]\n");
    expect(await detectPythonProject(tempDir)).toBe(true);
  });

  it("should return false when no project markers found", async () => {
    await fs.writeFile(path.join(tempDir, "requirements.txt"), "pytest\n");
    expect(await detectPythonProject(tempDir)).toBe(false);
  });

  it("should return false for empty directory", async () => {
    expect(await detectPythonProject(tempDir)).toBe(false);
  });
});

describe("resolvePythonBin", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-python-bin-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should prefer an explicit interpreter path", async () => {
    expect(await resolvePythonBin(tempDir, "/usr/bin/python3.12")).toBe(
      "/usr/bin/python3.12",
    );
  });

  it("should use project venv when present", async () => {
    const venvPython = path.join(tempDir, "venv", "bin", "python");
    await fs.mkdir(path.dirname(venvPython), { recursive: true });
    await fs.writeFile(venvPython, "");
    await fs.chmod(venvPython, 0o755);
    expect(await resolvePythonBin(tempDir)).toBe(venvPython);
  });

  it("should use project .venv when present", async () => {
    const venvPython = path.join(tempDir, ".venv", "bin", "python");
    await fs.mkdir(path.dirname(venvPython), { recursive: true });
    await fs.writeFile(venvPython, "");
    await fs.chmod(venvPython, 0o755);
    expect(await resolvePythonBin(tempDir)).toBe(venvPython);
  });

  it("should prefer project venv over fallback interpreter", async () => {
    const venvPython = path.join(tempDir, "venv", "bin", "python");
    await fs.mkdir(path.dirname(venvPython), { recursive: true });
    await fs.writeFile(venvPython, "");
    await fs.chmod(venvPython, 0o755);
    expect(await resolvePythonBin(tempDir, undefined, "/usr/bin/wrong")).toBe(
      venvPython,
    );
  });

  it("should use fallback interpreter when no venv exists", async () => {
    expect(await resolvePythonBin(tempDir, undefined, "/usr/bin/python3.12")).toBe(
      "/usr/bin/python3.12",
    );
  });

  it("should fall back to system python when no venv or fallback exists", async () => {
    const bin = await resolvePythonBin(tempDir);
    expect(bin === "python3" || bin === "python").toBe(true);
  });
});

describe("buildTestArgs", () => {
  it("pytest: file then -k when both set", () => {
    expect(
      buildTestArgs("pytest", {
        testFile: "tests/test_foo.py",
        testNamePattern: "bar",
      }),
    ).toEqual(["-m", "pytest", "--tb=short", "-q", "tests/test_foo.py", "-k", "bar"]);
  });

  it("pytest: minimal when no file or pattern", () => {
    expect(buildTestArgs("pytest", {})).toEqual([
      "-m",
      "pytest",
      "--tb=short",
      "-q",
    ]);
  });

  it("unittest discover: includes -k after discover dir", () => {
    expect(
      buildTestArgs("unittest", {
        unittestDiscoverDir: "tests_package",
        testNamePattern: "MyTest",
      }),
    ).toEqual(["-m", "unittest", "discover", "tests_package", "-k", "MyTest"]);
  });

  it("unittest single file: omits -k (not reliable before Python 3.12)", () => {
    expect(
      buildTestArgs("unittest", {
        testFile: "tests_package/foo/test_bar.py",
        testNamePattern: "should_not_appear",
      }),
    ).toEqual(["-m", "unittest", "tests_package/foo/test_bar.py"]);
  });

  it("unittest discover: defaults discover dir to tests_package when omitted", () => {
    expect(buildTestArgs("unittest", {})).toEqual([
      "-m",
      "unittest",
      "discover",
      "tests_package",
    ]);
  });
});

describe("parsePytestOutput", () => {
  it("should parse passed-only summary", () => {
    const result = parsePytestOutput(`
tests/test_foo.py ....
7 passed in 0.12s
`);
    expect(result).toEqual({
      total: 7,
      passed: 7,
      failed: 0,
      skipped: 0,
    });
  });

  it("should parse failed and passed summary", () => {
    const result = parsePytestOutput(`
tests/test_foo.py F..
2 failed, 5 passed in 0.45s
`);
    expect(result).toEqual({
      total: 7,
      passed: 5,
      failed: 2,
      skipped: 0,
    });
  });

  it("should parse failed, passed, and skipped summary", () => {
    const result = parsePytestOutput(`
1 failed, 2 passed, 1 skipped in 0.30s
`);
    expect(result).toEqual({
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    });
  });

  it("should count errors as failures", () => {
    const result = parsePytestOutput(`
2 error in 0.05s
`);
    expect(result).toEqual({
      total: 2,
      passed: 0,
      failed: 2,
      skipped: 0,
    });
  });

  it("should return zeros when no summary line found", () => {
    expect(parsePytestOutput("pytest: command not found")).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    });
  });
});

describe("usesPytest", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-python-fw-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect pytest.ini", async () => {
    await fs.writeFile(path.join(tempDir, "pytest.ini"), "[pytest]\n");
    expect(await usesPytest(tempDir)).toBe(true);
  });

  it("should detect pytest config in pyproject.toml", async () => {
    await fs.writeFile(
      path.join(tempDir, "pyproject.toml"),
      "[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
    );
    expect(await usesPytest(tempDir)).toBe(true);
  });

  it("should return false for pyproject.toml without pytest config", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[project]\nname = 'demo'\n");
    expect(await usesPytest(tempDir)).toBe(false);
  });
});

describe("resolveTestFramework", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-python-fw-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should prefer unittest for pymongo-style projects", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[project]\nname = 'pymongo'\n");
    await fs.mkdir(path.join(tempDir, "tests_package"));
    expect(await resolveTestFramework(tempDir)).toBe("unittest");
    expect(await resolveUnittestDiscoverDir(tempDir)).toBe("tests_package");
  });

  it("should prefer pytest when only generic tests/ exists (no tests_package)", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[project]\nname = 'demo'\n");
    await fs.mkdir(path.join(tempDir, "tests"));
    expect(await resolveUnittestDiscoverDir(tempDir)).toBeUndefined();
    expect(await resolveTestFramework(tempDir)).toBe("pytest");
  });

  it("should prefer pytest when configured", async () => {
    await fs.writeFile(path.join(tempDir, "pytest.ini"), "[pytest]\n");
    await fs.mkdir(path.join(tempDir, "tests_package"));
    expect(await resolveTestFramework(tempDir)).toBe("pytest");
  });
});

describe("runPythonTests spawn error", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-python-spawn-"));
    await fs.writeFile(
      path.join(tempDir, "pyproject.toml"),
      "[project]\nname = 'x'\n",
    );
    await fs.mkdir(path.join(tempDir, "tests_package"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should fail fast with a clear message when interpreter is missing", async () => {
    const result = await runPythonTests({
      projectPath: tempDir,
      pythonPath: "/nonexistent/grove-python-missing-interpreter",
      timeout: 5_000,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatch(/Failed to launch Python:/);
    expect(result.output).toMatch(/Interpreter:/);
    expect(result.duration).toBeLessThan(4_000);
  });
});

describe("parseUnittestOutput", () => {
  it("should parse OK output", () => {
    expect(
      parseUnittestOutput(`
..........
----------------------------------------------------------------------
Ran 10 tests in 0.042s

OK
`),
    ).toEqual({
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
    });
  });

  it("should parse failed output", () => {
    expect(
      parseUnittestOutput(`
======================================================================
FAIL: test_limitations (tests_package.timeseries.test_limitations)
----------------------------------------------------------------------
Ran 3 tests in 0.015s

FAILED (failures=1)
`),
    ).toEqual({
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
    });
  });
});
