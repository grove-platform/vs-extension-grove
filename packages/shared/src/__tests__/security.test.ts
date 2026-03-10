import { describe, it, expect } from "vitest";
import { isPathWithinBoundary, sanitizePath } from "../security";

describe("isPathWithinBoundary", () => {
  it("should allow paths within boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/project/file.txt", "/home/user/project")
    ).toBe(true);
  });

  it("should reject paths outside boundary", () => {
    expect(
      isPathWithinBoundary("/home/user/other/file.txt", "/home/user/project")
    ).toBe(false);
  });

  it("should reject path traversal", () => {
    expect(
      isPathWithinBoundary(
        "/home/user/project/../other/file.txt",
        "/home/user/project"
      )
    ).toBe(false);
  });

  it("should allow the boundary path itself", () => {
    expect(
      isPathWithinBoundary("/home/user/project", "/home/user/project")
    ).toBe(true);
  });

  it("should reject paths that start with boundary prefix but are different", () => {
    // e.g., /home/user/project-evil should not be allowed for /home/user/project
    expect(
      isPathWithinBoundary("/home/user/project-evil/file.txt", "/home/user/project")
    ).toBe(false);
  });

  it("should handle nested subdirectories", () => {
    expect(
      isPathWithinBoundary(
        "/home/user/project/deep/nested/path/file.txt",
        "/home/user/project"
      )
    ).toBe(true);
  });
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

