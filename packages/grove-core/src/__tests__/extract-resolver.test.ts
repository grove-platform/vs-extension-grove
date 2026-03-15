import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  resolveExtract,
  getRefNameFromPath,
  clearExtractCache,
} from "../rst/extract-resolver";

describe("extract-resolver", () => {
  let tempDir: string;
  let includesDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    // Create temp directory structure mimicking docs repo
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
    sourceDir = path.join(tempDir, "source");
    includesDir = path.join(sourceDir, "includes");
    await fs.promises.mkdir(includesDir, { recursive: true });

    // Create a minimal snooty.toml so findSourceDir works
    await fs.promises.writeFile(
      path.join(tempDir, "snooty.toml"),
      'name = "test-project"\n'
    );

    // Create test extracts YAML file
    const extractsContent = `ref: test-extract-one
content: |
  This is test extract one.

---
ref: test-extract-two
content: |
  This is test extract two.
`;
    await fs.promises.writeFile(
      path.join(includesDir, "extracts-test.yaml"),
      extractsContent
    );

    clearExtractCache();
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    clearExtractCache();
  });

  describe("getRefNameFromPath", () => {
    it("extracts ref name from path with .rst extension", () => {
      expect(getRefNameFromPath("/includes/extracts/foo-bar.rst")).toBe(
        "foo-bar"
      );
    });

    it("extracts ref name from complex path", () => {
      expect(
        getRefNameFromPath("/includes/extracts/ssl-facts-x509-ca-file.rst")
      ).toBe("ssl-facts-x509-ca-file");
    });

    it("handles paths without .rst extension", () => {
      expect(getRefNameFromPath("/includes/extracts/foo-bar")).toBe("foo-bar");
    });
  });

  describe("resolveExtract", () => {
    it("resolves existing extract", async () => {
      const rstFile = path.join(sourceDir, "test.txt");
      const result = await resolveExtract(
        rstFile,
        "/includes/extracts/test-extract-one.rst"
      );

      expect(result.exists).toBe(true);
      expect(result.refName).toBe("test-extract-one");
      expect(result.yamlFilePath).toContain("extracts-test.yaml");
      expect(result.lineNumber).toBe(1);
    });

    it("resolves second extract in file", async () => {
      const rstFile = path.join(sourceDir, "test.txt");
      const result = await resolveExtract(
        rstFile,
        "/includes/extracts/test-extract-two.rst"
      );

      expect(result.exists).toBe(true);
      expect(result.refName).toBe("test-extract-two");
      expect(result.lineNumber).toBeGreaterThan(1);
    });

    it("returns error for non-existent extract", async () => {
      const rstFile = path.join(sourceDir, "test.txt");
      const result = await resolveExtract(
        rstFile,
        "/includes/extracts/nonexistent.rst"
      );

      expect(result.exists).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("caches results", async () => {
      const rstFile = path.join(sourceDir, "test.txt");

      // First call
      await resolveExtract(rstFile, "/includes/extracts/test-extract-one.rst");

      // Delete the file
      await fs.promises.unlink(path.join(includesDir, "extracts-test.yaml"));

      // Second call should still work (cached)
      const result = await resolveExtract(
        rstFile,
        "/includes/extracts/test-extract-one.rst"
      );
      expect(result.exists).toBe(true);
    });

    it("returns error when includes directory not found", async () => {
      // Create a file outside any snooty project
      const outsideFile = path.join(os.tmpdir(), "outside.txt");
      const result = await resolveExtract(
        outsideFile,
        "/includes/extracts/test.rst"
      );

      expect(result.exists).toBe(false);
      expect(result.error).toContain("includes directory");
    });
  });
});

