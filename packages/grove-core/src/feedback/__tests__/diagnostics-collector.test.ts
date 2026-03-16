/**
 * Tests for diagnostics-collector module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectDiagnostics } from "../diagnostics-collector";

// Mock vscode
vi.mock("vscode", () => ({
  extensions: {
    getExtension: vi.fn(() => ({
      packageJSON: {
        version: "1.2.3",
      },
    })),
  },
  version: "1.85.0",
}));

// Mock project-cache module
vi.mock("../../project-cache", () => ({
  getCachedProjects: vi.fn(() =>
    Promise.resolve([
      { name: "test-project-1", rootPath: "/path/to/project1" },
      { name: "test-project-2", rootPath: "/path/to/project2" },
    ]),
  ),
}));

describe("diagnostics-collector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collectDiagnostics", () => {
    it("should collect all diagnostic fields", async () => {
      const diagnostics = await collectDiagnostics();

      expect(diagnostics).toHaveProperty("groveVersion");
      expect(diagnostics).toHaveProperty("vscodeVersion");
      expect(diagnostics).toHaveProperty("os");
      expect(diagnostics).toHaveProperty("nodeVersion");
      expect(diagnostics).toHaveProperty("detectedProjects");
      expect(diagnostics).toHaveProperty("timestamp");
    });

    it("should return valid version strings", async () => {
      const diagnostics = await collectDiagnostics();

      expect(typeof diagnostics.groveVersion).toBe("string");
      expect(typeof diagnostics.vscodeVersion).toBe("string");
      expect(diagnostics.groveVersion).toBe("1.2.3"); // From mock
      expect(diagnostics.vscodeVersion).toBe("1.85.0"); // From mock
    });

    it("should return valid OS info", async () => {
      const diagnostics = await collectDiagnostics();

      expect(typeof diagnostics.os).toBe("string");
      expect(diagnostics.os.length).toBeGreaterThan(0);
      // Should contain platform info (darwin, win32, linux, etc.)
      expect(diagnostics.os).toMatch(/darwin|win32|linux|freebsd/);
    });

    it("should return valid Node.js version", async () => {
      const diagnostics = await collectDiagnostics();

      expect(typeof diagnostics.nodeVersion).toBe("string");
      // Node versions start with 'v'
      expect(diagnostics.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("should return valid timestamp", async () => {
      const diagnostics = await collectDiagnostics();

      expect(() => new Date(diagnostics.timestamp)).not.toThrow();
      // Timestamp should be recent (within last minute)
      const timestamp = new Date(diagnostics.timestamp);
      const now = new Date();
      const diff = now.getTime() - timestamp.getTime();
      expect(diff).toBeLessThan(60000); // Less than 1 minute
    });

    it("should return array for detectedProjects", async () => {
      const diagnostics = await collectDiagnostics();

      expect(Array.isArray(diagnostics.detectedProjects)).toBe(true);
    });

    it("should include detected project names", async () => {
      const diagnostics = await collectDiagnostics();

      expect(diagnostics.detectedProjects).toContain("test-project-1");
      expect(diagnostics.detectedProjects).toContain("test-project-2");
    });
  });
});

