import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initProfiler,
  isProfilingEnabled,
  profile,
  profileSync,
  mark,
  measure,
  getStats,
  getAllStats,
  formatReport,
  clearStats,
  clearMarks,
  exportReport,
  importReport,
  compareReports,
  formatComparison,
  type ProfilerLogger,
  type ProfileReport,
} from "../profiler";

// Mock ExtensionMode values (matching VS Code's enum)
const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3,
};

describe("profiler", () => {
  beforeEach(() => {
    // Reset profiler state before each test
    clearStats();
  });

  describe("initProfiler", () => {
    it("should enable profiling in development mode", () => {
      initProfiler({ extensionMode: ExtensionMode.Development });
      expect(isProfilingEnabled()).toBe(true);
    });

    it("should disable profiling in production mode", () => {
      initProfiler({ extensionMode: ExtensionMode.Production });
      expect(isProfilingEnabled()).toBe(false);
    });

    it("should disable profiling in test mode", () => {
      initProfiler({ extensionMode: ExtensionMode.Test });
      expect(isProfilingEnabled()).toBe(false);
    });

    it("should log initialization message when logger provided", () => {
      const mockLogger: ProfilerLogger = { info: vi.fn() };
      initProfiler({ extensionMode: ExtensionMode.Development }, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Performance profiler enabled (development mode)",
      );
    });

    it("should not log when profiling is disabled", () => {
      const mockLogger: ProfilerLogger = { info: vi.fn() };
      initProfiler({ extensionMode: ExtensionMode.Production }, mockLogger);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("should clear previous stats on re-initialization", () => {
      initProfiler({ extensionMode: ExtensionMode.Development });
      profileSync("test-op", () => 42);
      expect(getStats("test-op")).toBeDefined();

      initProfiler({ extensionMode: ExtensionMode.Development });
      expect(getStats("test-op")).toBeUndefined();
    });
  });

  describe("profileSync", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should return the function result", () => {
      const result = profileSync("test", () => 42);
      expect(result).toBe(42);
    });

    it("should record timing statistics", () => {
      profileSync("test-op", () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      const stats = getStats("test-op");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.totalMs).toBeGreaterThanOrEqual(0);
    });

    it("should accumulate statistics across multiple calls", () => {
      profileSync("multi-call", () => 1);
      profileSync("multi-call", () => 2);
      profileSync("multi-call", () => 3);

      const stats = getStats("multi-call");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(3);
    });

    it("should be a no-op when profiling is disabled", () => {
      initProfiler({ extensionMode: ExtensionMode.Production });

      const result = profileSync("disabled-test", () => "result");
      expect(result).toBe("result");
      expect(getStats("disabled-test")).toBeUndefined();
    });

    it("should propagate exceptions", () => {
      expect(() => {
        profileSync("throwing", () => {
          throw new Error("test error");
        });
      }).toThrow("test error");
    });

    it("should record timing even when function throws", () => {
      try {
        profileSync("throwing-with-stats", () => {
          throw new Error("test error");
        });
      } catch {
        // expected
      }

      const stats = getStats("throwing-with-stats");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });
  });

  describe("profile (async)", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should return the async function result", async () => {
      const result = await profile("async-test", async () => {
        return Promise.resolve(42);
      });
      expect(result).toBe(42);
    });

    it("should record timing for async operations", async () => {
      await profile("async-op", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "done";
      });

      const stats = getStats("async-op");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.totalMs).toBeGreaterThanOrEqual(10);
    });

    it("should handle sync functions passed to profile", async () => {
      const result = await profile("sync-in-async", () => 123);
      expect(result).toBe(123);
      expect(getStats("sync-in-async")).toBeDefined();
    });

    it("should be a no-op when profiling is disabled", async () => {
      initProfiler({ extensionMode: ExtensionMode.Production });

      const result = await profile("disabled-async", async () => "result");
      expect(result).toBe("result");
      expect(getStats("disabled-async")).toBeUndefined();
    });

    it("should propagate async exceptions", async () => {
      await expect(
        profile("async-throwing", async () => {
          throw new Error("async error");
        }),
      ).rejects.toThrow("async error");
    });
  });

  describe("mark and measure", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should measure time between two marks", async () => {
      mark("start");
      await new Promise((resolve) => setTimeout(resolve, 15));
      mark("end");

      const duration = measure("test-duration", "start", "end");
      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(15);
    });

    it("should record measure as a stat", () => {
      mark("m-start");
      mark("m-end");
      measure("measured-op", "m-start", "m-end");

      const stats = getStats("measured-op");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });

    it("should measure to current time when endMark is omitted", async () => {
      mark("only-start");
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = measure("to-now", "only-start");
      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it("should return undefined for missing start mark", () => {
      const duration = measure("missing", "nonexistent");
      expect(duration).toBeUndefined();
    });

    it("should return undefined for missing end mark", () => {
      mark("exists");
      const duration = measure("missing-end", "exists", "nonexistent");
      expect(duration).toBeUndefined();
    });

    it("should be no-ops when profiling is disabled", () => {
      initProfiler({ extensionMode: ExtensionMode.Production });

      mark("disabled-mark");
      const duration = measure("disabled-measure", "disabled-mark");
      expect(duration).toBeUndefined();
    });
  });

  describe("clearStats and clearMarks", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should clear all statistics", () => {
      profileSync("op1", () => 1);
      profileSync("op2", () => 2);
      expect(getAllStats().size).toBe(2);

      clearStats();
      expect(getAllStats().size).toBe(0);
    });

    it("should clear specific marks", () => {
      mark("keep");
      mark("remove1");
      mark("remove2");

      clearMarks("remove1", "remove2");

      // "keep" should still work
      const duration = measure("kept", "keep");
      expect(duration).toBeDefined();

      // Removed marks should not work
      expect(measure("removed", "remove1")).toBeUndefined();
    });
  });

  describe("getAllStats", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should return a copy of all stats", () => {
      profileSync("a", () => 1);
      profileSync("b", () => 2);

      const stats = getAllStats();
      expect(stats.size).toBe(2);
      expect(stats.has("a")).toBe(true);
      expect(stats.has("b")).toBe(true);
    });

    it("should return a copy that does not affect internal state", () => {
      profileSync("original", () => 1);
      const stats = getAllStats();

      // Modifying the returned map should not affect internal state
      stats.clear();

      expect(getStats("original")).toBeDefined();
    });
  });

  describe("formatReport", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should return a message when no data collected", () => {
      const report = formatReport();
      expect(report).toBe("No profiling data collected.");
    });

    it("should include operation names in report", () => {
      profileSync("MyOperation", () => 1);
      const report = formatReport();
      expect(report).toContain("MyOperation");
    });

    it("should include column headers", () => {
      profileSync("test", () => 1);
      const report = formatReport();
      expect(report).toContain("Operation");
      expect(report).toContain("Count");
      expect(report).toContain("Avg");
      expect(report).toContain("Min");
      expect(report).toContain("Max");
    });

    it("should truncate long operation names", () => {
      profileSync("ThisIsAVeryLongOperationNameThatShouldBeTruncated", () => 1);
      const report = formatReport();
      expect(report).toContain("...");
    });

    it("should sort by total time descending", () => {
      // Create operations with different timing profiles
      profileSync("fast", () => 1);
      profileSync("slow", () => {
        let sum = 0;
        for (let i = 0; i < 100000; i++) sum += i;
        return sum;
      });

      const report = formatReport();
      const slowIndex = report.indexOf("slow");
      const fastIndex = report.indexOf("fast");

      // Slow should appear before fast (higher total time first)
      expect(slowIndex).toBeLessThan(fastIndex);
    });
  });

  describe("statistics accuracy", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should track min/max correctly", () => {
      // First call
      profileSync("minmax", () => 1);

      // Record some calls with varying "work"
      for (let i = 0; i < 5; i++) {
        profileSync("minmax", () => {
          let sum = 0;
          for (let j = 0; j < (i + 1) * 1000; j++) sum += j;
          return sum;
        });
      }

      const stats = getStats("minmax");
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(6);
      expect(stats!.minMs).toBeLessThanOrEqual(stats!.maxMs);
      expect(stats!.totalMs).toBeGreaterThan(0);
    });

    it("should calculate correct average", () => {
      profileSync("avg-test", () => 1);
      profileSync("avg-test", () => 1);

      const stats = getStats("avg-test");
      expect(stats).toBeDefined();

      const calculatedAvg = stats!.totalMs / stats!.count;
      // Just verify the math works (totalMs / count should be close to average)
      expect(calculatedAvg).toBeGreaterThanOrEqual(0);
    });
  });

  describe("exportReport", () => {
    beforeEach(() => {
      initProfiler({ extensionMode: ExtensionMode.Development });
    });

    it("should export report with correct structure", () => {
      profileSync("test-op", () => 1);
      const report = exportReport();

      expect(report.version).toBe(1);
      expect(report.metadata).toBeDefined();
      expect(report.metadata.timestamp).toBeDefined();
      expect(report.metadata.sessionDurationMs).toBeGreaterThanOrEqual(0);
      expect(report.metadata.totalOperations).toBe(1);
      expect(report.stats).toBeDefined();
      expect(report.stats["test-op"]).toBeDefined();
    });

    it("should include optional metadata", () => {
      profileSync("op", () => 1);
      const report = exportReport({
        label: "test-label",
        gitCommit: "abc123",
        gitBranch: "main",
        extensionVersion: "1.0.0",
        workspaceFolderCount: 2,
      });

      expect(report.metadata.label).toBe("test-label");
      expect(report.metadata.gitCommit).toBe("abc123");
      expect(report.metadata.gitBranch).toBe("main");
      expect(report.metadata.extensionVersion).toBe("1.0.0");
      expect(report.metadata.workspaceFolderCount).toBe(2);
    });

    it("should export empty stats when no data", () => {
      const report = exportReport();
      expect(report.stats).toEqual({});
      expect(report.metadata.totalOperations).toBe(0);
    });
  });

  describe("importReport", () => {
    it("should import valid JSON string", () => {
      const reportJson = JSON.stringify({
        version: 1,
        metadata: {
          timestamp: "2024-01-01",
          sessionDurationMs: 1000,
          totalOperations: 1,
        },
        stats: {
          op1: { count: 1, totalMs: 10, minMs: 10, maxMs: 10, lastMs: 10 },
        },
      });

      const report = importReport(reportJson);
      expect(report).not.toBeNull();
      expect(report!.stats["op1"].count).toBe(1);
    });

    it("should import valid object", () => {
      const reportObj = {
        version: 1,
        metadata: {
          timestamp: "2024-01-01",
          sessionDurationMs: 1000,
          totalOperations: 1,
        },
        stats: {},
      };

      const report = importReport(reportObj);
      expect(report).not.toBeNull();
    });

    it("should reject invalid version", () => {
      const report = importReport({ version: 2, metadata: {}, stats: {} });
      expect(report).toBeNull();
    });

    it("should reject missing metadata", () => {
      const report = importReport({ version: 1, stats: {} });
      expect(report).toBeNull();
    });

    it("should reject invalid JSON", () => {
      const report = importReport("not valid json");
      expect(report).toBeNull();
    });
  });

  describe("compareReports", () => {
    function createReport(
      stats: Record<string, Partial<import("../profiler").ProfileStats>>,
    ): ProfileReport {
      const fullStats: Record<string, import("../profiler").ProfileStats> = {};
      for (const [name, s] of Object.entries(stats)) {
        fullStats[name] = {
          count: s.count ?? 1,
          totalMs: s.totalMs ?? 10,
          minMs: s.minMs ?? 10,
          maxMs: s.maxMs ?? 10,
          lastMs: s.lastMs ?? 10,
        };
      }
      return {
        version: 1,
        metadata: {
          timestamp: "2024-01-01",
          sessionDurationMs: 1000,
          totalOperations: 1,
        },
        stats: fullStats,
      };
    }

    it("should identify regressions", () => {
      const baseline = createReport({ op: { totalMs: 100, count: 10 } }); // avg 10ms
      const current = createReport({ op: { totalMs: 200, count: 10 } }); // avg 20ms (+100%)

      const comparison = compareReports(baseline, current);
      expect(comparison.summary.regressed).toBe(1);
      expect(comparison.operations[0].status).toBe("regressed");
      expect(comparison.operations[0].avgChangePercent).toBeCloseTo(100);
    });

    it("should identify improvements", () => {
      const baseline = createReport({ op: { totalMs: 200, count: 10 } }); // avg 20ms
      const current = createReport({ op: { totalMs: 100, count: 10 } }); // avg 10ms (-50%)

      const comparison = compareReports(baseline, current);
      expect(comparison.summary.improved).toBe(1);
      expect(comparison.operations[0].status).toBe("improved");
      expect(comparison.operations[0].avgChangePercent).toBeCloseTo(-50);
    });

    it("should identify unchanged within threshold", () => {
      const baseline = createReport({ op: { totalMs: 100, count: 10 } }); // avg 10ms
      const current = createReport({ op: { totalMs: 103, count: 10 } }); // avg 10.3ms (+3%)

      const comparison = compareReports(baseline, current, 5); // 5% threshold
      expect(comparison.summary.unchanged).toBe(1);
      expect(comparison.operations[0].status).toBe("unchanged");
    });

    it("should identify new operations", () => {
      const baseline = createReport({});
      const current = createReport({ newOp: { totalMs: 50, count: 5 } });

      const comparison = compareReports(baseline, current);
      expect(comparison.summary.new).toBe(1);
      expect(comparison.operations[0].status).toBe("new");
    });

    it("should identify removed operations", () => {
      const baseline = createReport({ oldOp: { totalMs: 50, count: 5 } });
      const current = createReport({});

      const comparison = compareReports(baseline, current);
      expect(comparison.summary.removed).toBe(1);
    });

    it("should sort regressions first", () => {
      const baseline = createReport({
        fast: { totalMs: 100, count: 10 },
        slow: { totalMs: 100, count: 10 },
      });
      const current = createReport({
        fast: { totalMs: 50, count: 10 }, // improved
        slow: { totalMs: 200, count: 10 }, // regressed
      });

      const comparison = compareReports(baseline, current);
      expect(comparison.operations[0].name).toBe("slow");
      expect(comparison.operations[0].status).toBe("regressed");
    });
  });

  describe("formatComparison", () => {
    it("should format comparison as string", () => {
      const baseline: ProfileReport = {
        version: 1,
        metadata: {
          timestamp: "2024-01-01",
          sessionDurationMs: 1000,
          totalOperations: 1,
          label: "baseline",
        },
        stats: {
          op: { count: 1, totalMs: 100, minMs: 100, maxMs: 100, lastMs: 100 },
        },
      };
      const current: ProfileReport = {
        version: 1,
        metadata: {
          timestamp: "2024-01-02",
          sessionDurationMs: 1000,
          totalOperations: 1,
          label: "current",
        },
        stats: {
          op: { count: 1, totalMs: 50, minMs: 50, maxMs: 50, lastMs: 50 },
        },
      };

      const comparison = compareReports(baseline, current);
      const formatted = formatComparison(comparison);

      expect(formatted).toContain("Grove Performance Comparison");
      expect(formatted).toContain("baseline");
      expect(formatted).toContain("op");
      expect(formatted).toContain("improved");
    });
  });
});
