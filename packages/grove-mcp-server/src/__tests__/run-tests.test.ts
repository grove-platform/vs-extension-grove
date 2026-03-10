import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleRunTests } from "../tools/run-tests.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("grove_run_tests tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
    vi.stubEnv("GROVE_WORKSPACE", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true });
  });

  it("should return error when GROVE_WORKSPACE is not set", async () => {
    vi.stubEnv("GROVE_WORKSPACE", "");
    const result = await handleRunTests({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("GROVE_WORKSPACE");
  });

  it("should reject unknown languages", async () => {
    const result = await handleRunTests({ language: "unknown-lang" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported");
  });

  it("should reject project paths outside workspace", async () => {
    const result = await handleRunTests({ projectPath: "../../../etc" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside workspace");
  });

  it("should reject test file paths outside workspace", async () => {
    // Need to provide a valid language to get past language detection
    const result = await handleRunTests({
      language: "nodejs",
      testFile: "../../../etc/passwd",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside workspace");
  });

  it("should sanitize paths with null bytes", async () => {
    // Providing an invalid path with null bytes
    // It should sanitize the path (removing null byte) and then
    // fail on language detection since there's no package.json
    const result = await handleRunTests({
      projectPath: "test\0path",
    });
    // Should fail on language detection, not crash on path handling
    expect(result.isError).toBe(true);
    // The sanitized path "testpath" doesn't exist, so it should fail language detection
    expect(result.content[0].text).toContain("Unsupported");
  });

  it("should list supported languages in error message", async () => {
    const result = await handleRunTests({ language: "fake" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nodejs");
    expect(result.content[0].text).toContain("python");
    expect(result.content[0].text).toContain("go");
  });

  it("should auto-detect nodejs language from package.json with jest", async () => {
    // Create a package.json with jest dependency
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        devDependencies: { jest: "^29.0.0" },
      }),
    );

    // The test will fail because jest isn't installed, but it should
    // at least try to run (not fail on language detection)
    // Use a short timeout since the actual test run will fail quickly
    const result = await handleRunTests({ timeout: 1 });

    // Result might be success=false from the test runner failing, but
    // critically it should NOT be an "unsupported language" error
    expect(result.content[0].text).not.toContain("Unsupported");
  }, 10000);
});
