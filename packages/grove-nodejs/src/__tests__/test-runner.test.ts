import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { detectJestProject } from "../test-runner";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("detectJestProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-nodejs-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should detect Jest in devDependencies", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
    );
    const result = await detectJestProject(tempDir);
    expect(result).toBe(true);
  });

  it("should detect Jest in dependencies", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { jest: "^29.0.0" } }),
    );
    const result = await detectJestProject(tempDir);
    expect(result).toBe(true);
  });

  it("should detect Vitest as alternative", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
    );
    const result = await detectJestProject(tempDir);
    expect(result).toBe(true);
  });

  it("should return false when no test framework found", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
    );
    const result = await detectJestProject(tempDir);
    expect(result).toBe(false);
  });

  it("should return false when package.json missing", async () => {
    const result = await detectJestProject(tempDir);
    expect(result).toBe(false);
  });

  it("should return false when package.json is invalid", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), "not valid json");
    const result = await detectJestProject(tempDir);
    expect(result).toBe(false);
  });
});

