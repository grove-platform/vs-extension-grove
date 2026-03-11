import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { checkSymlinkStatus, createSymlink } from "../symlink";

describe("Symlink utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("checkSymlinkStatus", () => {
    it("should detect non-existent path", async () => {
      const result = await checkSymlinkStatus(
        path.join(tempDir, "nonexistent"),
      );

      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it("should detect valid symlink", async () => {
      // Create a target directory
      const targetDir = path.join(tempDir, "target");
      await fs.mkdir(targetDir);

      // Create a symlink
      const symlinkPath = path.join(tempDir, "link");
      await fs.symlink(targetDir, symlinkPath);

      const result = await checkSymlinkStatus(symlinkPath);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.target).toBeDefined();
    });

    it("should detect broken symlink", async () => {
      // Create a symlink to a non-existent target
      const symlinkPath = path.join(tempDir, "broken-link");
      await fs.symlink("/nonexistent/target", symlinkPath);

      const result = await checkSymlinkStatus(symlinkPath);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should detect non-symlink paths", async () => {
      // Create a regular file
      const filePath = path.join(tempDir, "regular-file.txt");
      await fs.writeFile(filePath, "content");

      const result = await checkSymlinkStatus(filePath);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("not a symlink");
    });
  });

  describe("createSymlink", () => {
    it("should create a symlink within workspace", async () => {
      // Create target directory
      const targetDir = path.join(tempDir, "target");
      await fs.mkdir(targetDir);

      // Create symlink
      const symlinkPath = path.join(tempDir, "new-link");
      await createSymlink(symlinkPath, targetDir, tempDir);

      // Verify symlink was created
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it("should create parent directories if needed", async () => {
      // Create target directory
      const targetDir = path.join(tempDir, "target");
      await fs.mkdir(targetDir);

      // Create symlink in nested directory
      const symlinkPath = path.join(tempDir, "nested", "deep", "link");
      await createSymlink(symlinkPath, targetDir, tempDir);

      // Verify symlink was created
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it("should reject symlink path outside workspace", async () => {
      const targetDir = path.join(tempDir, "target");
      await fs.mkdir(targetDir);

      const outsidePath = "/tmp/outside-workspace-link";

      await expect(
        createSymlink(outsidePath, targetDir, tempDir),
      ).rejects.toThrow("within the workspace");
    });

    it("should reject target path outside workspace", async () => {
      const symlinkPath = path.join(tempDir, "link");

      await expect(
        createSymlink(symlinkPath, "/etc/passwd", tempDir),
      ).rejects.toThrow("within the workspace");
    });

    it("should reject non-existent target", async () => {
      const symlinkPath = path.join(tempDir, "link");
      const nonexistentTarget = path.join(tempDir, "nonexistent");

      await expect(
        createSymlink(symlinkPath, nonexistentTarget, tempDir),
      ).rejects.toThrow("does not exist");
    });
  });
});

