import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { looksLikeDocsProject } from "../diagnostics";

describe("Diagnostics utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-diag-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("looksLikeDocsProject", () => {
    it("should detect snooty.toml", async () => {
      // Create snooty.toml file
      await fs.writeFile(path.join(tempDir, "snooty.toml"), "");

      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(true);
    });

    it("should detect source/conf.py", async () => {
      // Create source/conf.py
      await fs.mkdir(path.join(tempDir, "source"));
      await fs.writeFile(path.join(tempDir, "source", "conf.py"), "");

      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(true);
    });

    it("should detect source/index.txt", async () => {
      // Create source/index.txt
      await fs.mkdir(path.join(tempDir, "source"));
      await fs.writeFile(path.join(tempDir, "source", "index.txt"), "");

      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(true);
    });

    it("should return false for non-docs projects", async () => {
      // Create a random file that's not a docs indicator
      await fs.writeFile(path.join(tempDir, "package.json"), "{}");

      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(false);
    });

    it("should return false for empty directories", async () => {
      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(false);
    });

    it("should detect with first matching indicator", async () => {
      // Create all indicators
      await fs.writeFile(path.join(tempDir, "snooty.toml"), "");
      await fs.mkdir(path.join(tempDir, "source"));
      await fs.writeFile(path.join(tempDir, "source", "conf.py"), "");

      const result = await looksLikeDocsProject(tempDir);
      expect(result).toBe(true);
    });
  });
});

