import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildMavenTestArgs,
  buildUtilitiesInstallArgs,
  deriveTestClassFromFile,
  detectJavaProject,
  escapeSurefireTestValue,
  evaluateMavenTestSuccess,
  isJavaAggregatorPom,
  isScopedMavenTestRun,
  parseMavenOutput,
  resolveJavaMultiModuleRoot,
  resolveMavenBin,
  runJavaTests,
} from "../test-runner";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectJavaProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect a pom.xml project", async () => {
    await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>\n");
    expect(await detectJavaProject(tempDir)).toBe(true);
  });

  it("should not treat Gradle-only projects as runnable", async () => {
    await fs.writeFile(path.join(tempDir, "build.gradle"), "\n");
    expect(await detectJavaProject(tempDir)).toBe(false);
  });

  it("should return false when no Java markers found", async () => {
    expect(await detectJavaProject(tempDir)).toBe(false);
  });
});

describe("resolveMavenBin", () => {
  it("should prefer an explicit mvn path", () => {
    expect(resolveMavenBin("/usr/local/bin/mvn")).toBe("/usr/local/bin/mvn");
  });

  it("should use fallback when no explicit path", () => {
    expect(resolveMavenBin(undefined, "/opt/maven/bin/mvn")).toBe(
      "/opt/maven/bin/mvn",
    );
  });

  it("should fall back to system mvn when nothing provided", () => {
    const bin = resolveMavenBin();
    expect(bin === "mvn" || bin === "mvn.cmd").toBe(true);
  });
});

describe("resolveJavaMultiModuleRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-root-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should find the java-code-examples parent from driver-sync", async () => {
    const javaRoot = path.join(tempDir, "code-example-tests", "java");
    const driverSync = path.join(javaRoot, "driver-sync");
    await fs.mkdir(driverSync, { recursive: true });
    await fs.writeFile(
      path.join(javaRoot, "pom.xml"),
      `<project>
  <artifactId>java-code-examples</artifactId>
  <packaging>pom</packaging>
  <modules><module>utilities</module></modules>
</project>`,
    );
    await fs.writeFile(
      path.join(driverSync, "pom.xml"),
      `<project>
  <parent>
    <artifactId>java-code-examples</artifactId>
  </parent>
  <artifactId>driver-sync</artifactId>
</project>`,
    );

    expect(await resolveJavaMultiModuleRoot(driverSync)).toBe(javaRoot);
  });

  it("should not treat driver-sync pom as the multi-module root", async () => {
    const pom = `<project>
  <parent>
    <groupId>com.mongodb.docs</groupId>
    <artifactId>java-code-examples</artifactId>
  </parent>
  <artifactId>driver-sync</artifactId>
</project>`;
    expect(isJavaAggregatorPom(pom)).toBe(false);
  });

  it("should not match unrelated packaging poms that mention utilities", async () => {
    const pom = `<project>
  <artifactId>other-aggregator</artifactId>
  <packaging>pom</packaging>
  <modules><module>utilities</module></modules>
</project>`;
    expect(isJavaAggregatorPom(pom)).toBe(false);
  });

  it("should return undefined when no multi-module root exists", async () => {
    await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>\n");
    expect(await resolveJavaMultiModuleRoot(tempDir)).toBeUndefined();
  });
});

describe("buildUtilitiesInstallArgs", () => {
  it("should install utilities and required modules", () => {
    expect(buildUtilitiesInstallArgs()).toEqual([
      "install",
      "-DskipTests",
      "-B",
      "-pl",
      "utilities/comparison-library,utilities/sample-data",
      "-am",
    ]);
  });
});

describe("deriveTestClassFromFile", () => {
  it("should derive an FQCN from src/test/java paths", () => {
    expect(
      deriveTestClassFromFile(
        "src/test/java/aggregation/pipelines/TutorialTests.java",
      ),
    ).toBe("aggregation.pipelines.TutorialTests");
  });

  it("should fall back to the basename outside src/test/java", () => {
    expect(deriveTestClassFromFile("TutorialTests.java")).toBe("TutorialTests");
  });
});

describe("escapeSurefireTestValue", () => {
  it("should escape Surefire metacharacters", () => {
    expect(escapeSurefireTestValue("foo,bar#baz!")).toBe("foo\\,bar\\#baz\\!");
  });
});

describe("buildMavenTestArgs", () => {
  it("should run all tests with batch mode", () => {
    expect(buildMavenTestArgs({})).toEqual(["test", "-B"]);
  });

  it("should filter by FQCN from nested test paths", () => {
    expect(
      buildMavenTestArgs({
        testFile: "src/test/java/aggregation/pipelines/TutorialTests.java",
      }),
    ).toEqual(["test", "-B", "-Dtest=aggregation.pipelines.TutorialTests"]);
  });

  it("should filter by class and method", () => {
    expect(
      buildMavenTestArgs({
        testFile: "src/test/java/aggregation/TutorialTests.java",
        testNamePattern: "TestFilter",
      }),
    ).toEqual(["test", "-B", "-Dtest=aggregation.TutorialTests#TestFilter"]);
  });

  it("should escape method patterns with Surefire metacharacters", () => {
    expect(buildMavenTestArgs({ testNamePattern: "foo,bar" })).toEqual([
      "test",
      "-B",
      "-Dtest=*foo\\,bar*",
    ]);
  });

  it("should filter by method pattern when no file is provided", () => {
    expect(buildMavenTestArgs({ testNamePattern: "TestFilter" })).toEqual([
      "test",
      "-B",
      "-Dtest=*TestFilter*",
    ]);
  });

  it("should ignore non-java testFile paths", () => {
    expect(
      buildMavenTestArgs({
        testFile: "extension-output-GrovePlatform.grove-platform-java",
      }),
    ).toEqual(["test", "-B"]);
  });
});

describe("evaluateMavenTestSuccess", () => {
  it("should fail scoped runs that match zero tests despite Maven exit 0", () => {
    expect(
      evaluateMavenTestSuccess(true, { total: 0 }, true),
    ).toBe(false);
  });

  it("should allow full-suite runs with zero executed tests", () => {
    expect(
      evaluateMavenTestSuccess(true, { total: 0 }, false),
    ).toBe(true);
  });

  it("should fail when Maven exits non-zero", () => {
    expect(
      evaluateMavenTestSuccess(false, { total: 3 }, true),
    ).toBe(false);
  });
});

describe("isScopedMavenTestRun", () => {
  it("should detect file and pattern scoped runs", () => {
    expect(isScopedMavenTestRun({ testFile: "Foo.java" })).toBe(true);
    expect(isScopedMavenTestRun({ testNamePattern: "bar" })).toBe(true);
    expect(isScopedMavenTestRun({})).toBe(false);
  });
});

describe("parseMavenOutput", () => {
  it("should parse a passing Surefire summary", () => {
    const result = parseMavenOutput(
      "[INFO] Tests run: 7, Failures: 0, Errors: 0, Skipped: 0",
    );
    expect(result).toEqual({ total: 7, passed: 7, failed: 0, skipped: 0 });
  });

  it("should parse a failing Surefire summary", () => {
    const result = parseMavenOutput(
      "[INFO] Tests run: 8, Failures: 2, Errors: 1, Skipped: 1",
    );
    expect(result).toEqual({ total: 8, passed: 4, failed: 3, skipped: 1 });
  });

  it("should sum counts across multiple modules", () => {
    const result = parseMavenOutput(`
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
[INFO] Tests run: 2, Failures: 1, Errors: 0, Skipped: 0
`);
    expect(result).toEqual({ total: 5, passed: 4, failed: 1, skipped: 0 });
  });

  it("should ignore per-class Surefire lines that include Time elapsed", () => {
    const result = parseMavenOutput(`
[ERROR] Tests run: 6, Failures: 0, Errors: 6, Skipped: 0, Time elapsed: 120.1 s <<< FAILURE! -- in aggregation.pipelines.TutorialTests
[INFO] Results:
[ERROR] Tests run: 6, Failures: 0, Errors: 6, Skipped: 0
`);
    expect(result).toEqual({ total: 6, passed: 0, failed: 6, skipped: 0 });
  });

  it("should return zeros when no summary line found", () => {
    expect(parseMavenOutput("BUILD FAILURE")).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    });
  });
});

describe("runJavaTests spawn error", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-spawn-"));
    await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should fail fast with a clear message when mvn is missing", async () => {
    const result = await runJavaTests({
      projectPath: tempDir,
      mavenPath: "/nonexistent/grove-java-missing-mvn",
      skipUtilitiesBuild: true,
      testTimeout: 5_000,
      utilitiesTimeout: 5_000,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatch(/Failed to launch mvn:/);
    expect(result.output).toMatch(/Executable:/);
    expect(result.duration).toBeLessThan(4_000);
  });
});
