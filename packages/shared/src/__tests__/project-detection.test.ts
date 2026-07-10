import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectGroveProjects, detectLanguage } from "../project-detection";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectGroveProjects", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect a project with snip.js", async () => {
    await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(1);
  });

  it("should detect multiple projects in subdirectories", async () => {
    await fs.mkdir(path.join(tempDir, "node"));
    await fs.mkdir(path.join(tempDir, "python"));
    await fs.writeFile(
      path.join(tempDir, "node", "snip.js"),
      "module.exports = {};"
    );
    await fs.writeFile(
      path.join(tempDir, "python", "snip.js"),
      "module.exports = {};"
    );

    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(2);
  });

  it("should return empty array when no snip.js found", async () => {
    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(0);
  });

  it("should skip node_modules directories", async () => {
    await fs.mkdir(path.join(tempDir, "node_modules", "some-package"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tempDir, "node_modules", "some-package", "snip.js"),
      "module.exports = {};"
    );

    const projects = await detectGroveProjects(tempDir);
    expect(projects).toHaveLength(0);
  });
});

describe("detectLanguage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect nodejs from package.json with jest", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } })
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("nodejs");
  });

  it("should detect nodejs from package.json with vitest", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("nodejs");
  });

  it("should detect python from pyproject.toml", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[tool.pytest]");
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("python");
  });

  it("should detect python from pytest.ini", async () => {
    await fs.writeFile(path.join(tempDir, "pytest.ini"), "[pytest]");
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("python");
  });

  it("should detect go from go.mod", async () => {
    await fs.writeFile(
      path.join(tempDir, "go.mod"),
      "module example.com/test"
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("go");
  });

  it("should detect java from pom.xml", async () => {
    await fs.writeFile(
      path.join(tempDir, "pom.xml"),
      "<project></project>"
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("java");
  });

  it("should detect java from build.gradle", async () => {
    await fs.writeFile(
      path.join(tempDir, "build.gradle"),
      "apply plugin: 'java'"
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("java");
  });

  it("should detect csharp from .csproj file", async () => {
    await fs.writeFile(
      path.join(tempDir, "MyProject.csproj"),
      "<Project></Project>"
    );
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("csharp");
  });

  it("should detect csharp from .sln file", async () => {
    await fs.writeFile(path.join(tempDir, "Driver.sln"), "\n");
    const lang = await detectLanguage(tempDir);
    expect(lang).toBe("csharp");
  });

  it("should return null when no language detected", async () => {
    const lang = await detectLanguage(tempDir);
    expect(lang).toBeNull();
  });
});

