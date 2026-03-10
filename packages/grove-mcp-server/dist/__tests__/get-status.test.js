import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleGetStatus } from "../tools/get-status.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
describe("grove_get_status tool", () => {
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
    it("should return error when GROVE_WORKSPACE not set", async () => {
        delete process.env.GROVE_WORKSPACE;
        const result = await handleGetStatus({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("GROVE_WORKSPACE");
    });
    it("should return hasProject:false when no snip.js exists", async () => {
        const result = await handleGetStatus({});
        expect(result.isError).toBeUndefined();
        const status = JSON.parse(result.content[0].text);
        expect(status.hasProject).toBe(false);
        expect(status.projects).toHaveLength(0);
    });
    it("should return hasProject:true when snip.js exists", async () => {
        await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
        const result = await handleGetStatus({});
        const status = JSON.parse(result.content[0].text);
        expect(status.hasProject).toBe(true);
        expect(status.projects).toHaveLength(1);
    });
    it("should include mongoConnection status in response", async () => {
        const result = await handleGetStatus({});
        const status = JSON.parse(result.content[0].text);
        expect(status.mongoConnection).toBeDefined();
        expect(status.mongoConnection.connected).toBe(false);
        expect(status.mongoConnection.clusterType).toBe("unknown");
    });
    it("should detect language for project with package.json", async () => {
        await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
        await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ devDependencies: { jest: "^29.0.0" } }));
        const result = await handleGetStatus({});
        const status = JSON.parse(result.content[0].text);
        expect(status.projects[0].language).toBe("nodejs");
    });
});
//# sourceMappingURL=get-status.test.js.map