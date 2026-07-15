import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  isPathWithinBoundary,
  isPathWithinRealBoundary,
  sanitizePath,
  validateWorkspacePath,
} from "../security";

describe("isPathWithinBoundary", () => {
  it("should allow paths within boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/project/file.txt", "/home/user/project"),
    ).toBe(true);
  });

  it("should reject paths outside boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/other/file.txt", "/home/user/project"),
    ).toBe(false);
  });

  it("should reject path traversal", () => {
    expect(
      isPathWithinBoundary(
        "/home/user/project/../other/file.txt",
        "/home/user/project",
      ),
    ).toBe(false);
  });

  it("should allow the boundary path itself", () => {
    expect(
      isPathWithinBoundary("/home/user/project", "/home/user/project"),
    ).toBe(true);
  });

  it("should reject paths that start with boundary prefix but are different", () => {
    // e.g., /home/user/project-evil should not be allowed for /home/user/project
    expect(
      isPathWithinBoundary(
        "/home/user/project-evil/file.txt",
        "/home/user/project",
      ),
    ).toBe(false);
  });

  it("should reject sibling workspace paths that share a prefix", () => {
    expect(isPathWithinBoundary("/workspace-other", "/workspace")).toBe(false);
  });

  it("should handle nested subdirectories", () => {
    expect(
      isPathWithinBoundary(
        "/home/user/project/deep/nested/path/file.txt",
        "/home/user/project",
      ),
    ).toBe(true);
  });
});

describe("isPathWithinRealBoundary", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-realpath-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should allow real paths within the boundary", async () => {
    const filePath = path.join(tempDir, "src", "foo.test.ts");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "");

    expect(await isPathWithinRealBoundary(filePath, tempDir)).toBe(true);
  });

  it("should reject paths outside the boundary", async () => {
    const outsideDir = path.join(path.dirname(tempDir), `${path.basename(tempDir)}-outside`);
    await fs.mkdir(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, "secret.test.ts");
    await fs.writeFile(outsideFile, "");

    expect(await isPathWithinRealBoundary(outsideFile, tempDir)).toBe(false);

    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "should reject a candidate path that escapes via symlink",
    async () => {
      const projectRoot = path.join(tempDir, "project");
      const outsideDir = path.join(tempDir, "outside");
      const testsLink = path.join(projectRoot, "tests");
      const outsideFile = path.join(outsideDir, "secret.test.ts");

      await fs.mkdir(projectRoot, { recursive: true });
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.writeFile(outsideFile, "");
      await fs.symlink(outsideDir, testsLink, "dir");

      const candidate = path.join(testsLink, "secret.test.ts");

      expect(isPathWithinBoundary(candidate, projectRoot)).toBe(true);
      expect(await isPathWithinRealBoundary(candidate, projectRoot)).toBe(false);
    },
  );
});

describe("sanitizePath", () => {
  it("should remove null bytes", () => {
    expect(sanitizePath("file\0.txt")).toBe("file.txt");
  });

  it("should normalize backslashes", () => {
    expect(sanitizePath("dir\\file.txt")).toBe("dir/file.txt");
  });

  it("should remove leading slashes", () => {
    expect(sanitizePath("/etc/passwd")).toBe("etc/passwd");
  });

  it("should remove multiple leading slashes", () => {
    expect(sanitizePath("///etc/passwd")).toBe("etc/passwd");
  });

  it("should handle mixed path separators", () => {
    expect(sanitizePath("dir\\subdir/file.txt")).toBe("dir/subdir/file.txt");
  });

  it("should handle empty string", () => {
    expect(sanitizePath("")).toBe("");
  });

  it("should preserve relative paths", () => {
    expect(sanitizePath("./relative/path.txt")).toBe("./relative/path.txt");
  });

  it("should preserve parent directory references (normalized away later)", () => {
    // Note: sanitizePath doesn't remove .., that's handled by path.resolve + isPathWithinBoundary
    expect(sanitizePath("../parent/file.txt")).toBe("../parent/file.txt");
  });
});

describe("validateWorkspacePath", () => {
  it("should validate paths within workspace", () => {
    expect(
      validateWorkspacePath(
        "/home/user/project/file.txt",
        "/home/user/project",
      ),
    ).toBe(true);
  });

  it("should reject paths outside workspace", () => {
    expect(
      validateWorkspacePath("/home/user/other/file.txt", "/home/user/project"),
    ).toBe(false);
  });

  it("should reject path traversal attempts", () => {
    expect(
      validateWorkspacePath(
        "/home/user/project/../other/file.txt",
        "/home/user/project",
      ),
    ).toBe(false);
  });

  it("should allow the workspace path itself", () => {
    expect(
      validateWorkspacePath("/home/user/project", "/home/user/project"),
    ).toBe(true);
  });

  it("should handle nested subdirectories", () => {
    expect(
      validateWorkspacePath(
        "/home/user/project/a/b/c/file.txt",
        "/home/user/project",
      ),
    ).toBe(true);
  });
});
