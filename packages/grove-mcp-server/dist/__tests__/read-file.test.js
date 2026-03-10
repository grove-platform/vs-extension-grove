import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleReadFile } from "../tools/read-file.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
describe("grove_read_file tool", () => {
    let tempDir;
    const originalEnv = process.env.GROVE_WORKSPACE;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
        process.env.GROVE_WORKSPACE = tempDir;
    });
    afterEach(async () => {
        process.env.GROVE_WORKSPACE = originalEnv;
        await fs.rm(tempDir, { recursive: true });
    });
    it("should read a file within workspace", async () => {
        await fs.writeFile(path.join(tempDir, "test.txt"), "Hello, Grove!");
        const result = await handleReadFile({ path: "test.txt" });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("Hello, Grove!");
    });
    it("should reject path traversal attempts", async () => {
        const result = await handleReadFile({ path: "../../../etc/passwd" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Path traversal denied");
    });
    it("should reject files over 100KB", async () => {
        const largeContent = "x".repeat(101 * 1024);
        await fs.writeFile(path.join(tempDir, "large.txt"), largeContent);
        const result = await handleReadFile({ path: "large.txt" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("File too large");
    });
    it("should return error for non-existent files", async () => {
        const result = await handleReadFile({ path: "nonexistent.txt" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("File not found");
    });
    it("should support projectPath parameter", async () => {
        await fs.mkdir(path.join(tempDir, "subproject"));
        await fs.writeFile(path.join(tempDir, "subproject", "file.txt"), "In subproject");
        const result = await handleReadFile({
            path: "file.txt",
            projectPath: "subproject",
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("In subproject");
    });
    it("should return error when GROVE_WORKSPACE is not set", async () => {
        delete process.env.GROVE_WORKSPACE;
        const result = await handleReadFile({ path: "test.txt" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("GROVE_WORKSPACE");
    });
    it("should return error when path parameter is missing", async () => {
        const result = await handleReadFile({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Missing required parameter");
    });
    it("should sanitize paths with null bytes", async () => {
        await fs.writeFile(path.join(tempDir, "test.txt"), "Content");
        const result = await handleReadFile({ path: "test\0.txt" });
        // After sanitization, it becomes "test.txt" which should exist
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("Content");
    });
    it("should reject absolute paths disguised as relative", async () => {
        const result = await handleReadFile({ path: "/etc/passwd" });
        // After sanitization (leading slash removed), becomes "etc/passwd"
        // which would be inside workspace but shouldn't exist
        expect(result.isError).toBe(true);
    });
});
//# sourceMappingURL=read-file.test.js.map