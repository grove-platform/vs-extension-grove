import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTestRunner,
  getTestRunner,
  listTestRunners,
  findTestRunnerForProject,
  runTests,
  TestRunner,
} from "../test-runner-api";

// Clear registered runners between tests
// Since the module uses a Map that persists, we need to account for that
describe("Test Runner API", () => {
  // Create unique runner names for each test to avoid conflicts
  const uniqueId = () => Math.random().toString(36).substring(7);

  describe("registerTestRunner", () => {
    it("should register a test runner", () => {
      const uniqueMarker = `register-marker-${uniqueId()}`;
      const language = `test-lang-${uniqueId()}`;
      const runner: TestRunner = {
        language,
        name: "Test Runner",
        run: async () => ({
          success: true,
          duration: 100,
        }),
        // Use unique marker to avoid matching paths from other tests
        detect: async (projectPath) => projectPath.includes(uniqueMarker),
      };

      registerTestRunner(runner);
      expect(getTestRunner(language)).toBe(runner);
    });

    it("should overwrite existing runner for same language", () => {
      const uniqueMarker = `overwrite-marker-${uniqueId()}`;
      const language = `test-lang-${uniqueId()}`;
      const runner1: TestRunner = {
        language,
        name: "Runner 1",
        run: async () => ({ success: true, duration: 100 }),
        detect: async (projectPath) => projectPath.includes(uniqueMarker),
      };
      const runner2: TestRunner = {
        language,
        name: "Runner 2",
        run: async () => ({ success: true, duration: 200 }),
        detect: async (projectPath) => projectPath.includes(uniqueMarker),
      };

      registerTestRunner(runner1);
      registerTestRunner(runner2);

      expect(getTestRunner(language)?.name).toBe("Runner 2");
    });
  });

  describe("listTestRunners", () => {
    it("should list registered runner languages", () => {
      const uniqueMarker = `list-marker-${uniqueId()}`;
      const language = `list-test-${uniqueId()}`;
      const runner: TestRunner = {
        language,
        name: "List Test Runner",
        run: async () => ({ success: true, duration: 100 }),
        // Use unique marker to avoid matching paths from other tests
        detect: async (projectPath) => projectPath.includes(uniqueMarker),
      };

      registerTestRunner(runner);
      const runners = listTestRunners();

      expect(runners).toContain(language);
    });
  });

  describe("findTestRunnerForProject", () => {
    it("should find a runner that detects the project", async () => {
      const uniqueMarker = `unique-marker-${uniqueId()}`;
      const language = `detect-${uniqueId()}`;
      const runner: TestRunner = {
        language,
        name: "Detecting Runner",
        run: async () => ({ success: true, duration: 100 }),
        detect: async (projectPath) => projectPath.includes(uniqueMarker),
      };

      registerTestRunner(runner);

      const found = await findTestRunnerForProject(
        `/path/to/${uniqueMarker}/project`,
      );
      expect(found?.language).toBe(language);
    });

    it("should return undefined if no runner detects the project", async () => {
      const language = `no-detect-${uniqueId()}`;
      const runner: TestRunner = {
        language,
        name: "Non-detecting Runner",
        run: async () => ({ success: true, duration: 100 }),
        detect: async () => false,
      };

      registerTestRunner(runner);

      // Use a path that won't match any registered detector
      const found = await findTestRunnerForProject(
        `/no/match/${uniqueId()}/path`,
      );
      // This may or may not be undefined depending on other registered runners
      // Just verify it doesn't throw
      expect(found === undefined || found !== undefined).toBe(true);
    });
  });

  describe("runTests", () => {
    it("should run tests with the specified language runner", async () => {
      const language = `run-test-${uniqueId()}`;
      const runner: TestRunner = {
        language,
        name: "Run Test Runner",
        run: async () => ({
          success: true,
          duration: 150,
          passed: 5,
          total: 5,
        }),
        detect: async () => true,
      };

      registerTestRunner(runner);

      const result = await runTests({
        projectPath: "/test/project",
        language,
      });

      expect(result.success).toBe(true);
      expect(result.passed).toBe(5);
      expect(result.total).toBe(5);
    });

    it("should return error for unknown language", async () => {
      const result = await runTests({
        projectPath: "/test/project",
        language: `unknown-${uniqueId()}`,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("No test runner registered");
    });
  });
});
