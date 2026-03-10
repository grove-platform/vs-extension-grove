"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const security_1 = require("../security");
(0, vitest_1.describe)("isPathWithinBoundary", () => {
    (0, vitest_1.it)("should allow paths within boundary", () => {
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/project/file.txt", "/home/user/project")).toBe(true);
    });
    (0, vitest_1.it)("should reject paths outside boundary", () => {
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/other/file.txt", "/home/user/project")).toBe(false);
    });
    (0, vitest_1.it)("should reject path traversal", () => {
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/project/../other/file.txt", "/home/user/project")).toBe(false);
    });
    (0, vitest_1.it)("should allow the boundary path itself", () => {
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/project", "/home/user/project")).toBe(true);
    });
    (0, vitest_1.it)("should reject paths that start with boundary prefix but are different", () => {
        // e.g., /home/user/project-evil should not be allowed for /home/user/project
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/project-evil/file.txt", "/home/user/project")).toBe(false);
    });
    (0, vitest_1.it)("should handle nested subdirectories", () => {
        (0, vitest_1.expect)((0, security_1.isPathWithinBoundary)("/home/user/project/deep/nested/path/file.txt", "/home/user/project")).toBe(true);
    });
});
(0, vitest_1.describe)("sanitizePath", () => {
    (0, vitest_1.it)("should remove null bytes", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("file\0.txt")).toBe("file.txt");
    });
    (0, vitest_1.it)("should normalize backslashes", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("dir\\file.txt")).toBe("dir/file.txt");
    });
    (0, vitest_1.it)("should remove leading slashes", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("/etc/passwd")).toBe("etc/passwd");
    });
    (0, vitest_1.it)("should remove multiple leading slashes", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("///etc/passwd")).toBe("etc/passwd");
    });
    (0, vitest_1.it)("should handle mixed path separators", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("dir\\subdir/file.txt")).toBe("dir/subdir/file.txt");
    });
    (0, vitest_1.it)("should handle empty string", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("")).toBe("");
    });
    (0, vitest_1.it)("should preserve relative paths", () => {
        (0, vitest_1.expect)((0, security_1.sanitizePath)("./relative/path.txt")).toBe("./relative/path.txt");
    });
    (0, vitest_1.it)("should preserve parent directory references (normalized away later)", () => {
        // Note: sanitizePath doesn't remove .., that's handled by path.resolve + isPathWithinBoundary
        (0, vitest_1.expect)((0, security_1.sanitizePath)("../parent/file.txt")).toBe("../parent/file.txt");
    });
});
//# sourceMappingURL=security.test.js.map