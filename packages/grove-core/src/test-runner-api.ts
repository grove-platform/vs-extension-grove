/**
 * Test Runner Registration API
 *
 * Language extensions (grove-nodejs, grove-python, etc.) register their
 * test runners with grove-core using this API.
 */

import { getLogChannel, isLoggerInitialized } from "./logger";

export interface TestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  /** Additional environment variables to inject into the test process */
  env?: Record<string, string>;
  /** Test name pattern for filtering tests (passed to --testNamePattern in Jest, -g in Mocha) */
  testNamePattern?: string;
}

export interface TestResult {
  success: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  output?: string;
  duration: number;
}

export interface TestRunner {
  /** Language identifier (e.g., "nodejs", "python") */
  language: string;
  /** Display name (e.g., "Jest", "pytest") */
  name: string;
  /** Run tests and return results */
  run: (options: TestRunOptions) => Promise<TestResult>;
  /** Detect if this runner applies to a project */
  detect: (projectPath: string) => Promise<boolean>;
}

const registeredRunners: Map<string, TestRunner> = new Map();

/**
 * Register a test runner for a language.
 * Called by language extensions during activation.
 */
export function registerTestRunner(runner: TestRunner): void {
  registeredRunners.set(runner.language, runner);
  // Only log if logger is initialized (not in tests)
  if (isLoggerInitialized()) {
    getLogChannel().info(
      `Registered test runner "${runner.name}" for ${runner.language}`,
    );
  }
}

/**
 * Get the test runner for a specific language.
 */
export function getTestRunner(language: string): TestRunner | undefined {
  return registeredRunners.get(language);
}

/**
 * List all registered test runner languages.
 */
export function listTestRunners(): string[] {
  return Array.from(registeredRunners.keys());
}

/**
 * Find a test runner that can handle a project.
 * Tries each registered runner's detect() function.
 */
export async function findTestRunnerForProject(
  projectPath: string,
): Promise<TestRunner | undefined> {
  for (const runner of registeredRunners.values()) {
    try {
      if (await runner.detect(projectPath)) {
        return runner;
      }
    } catch {
      // Ignore detection errors
    }
  }
  return undefined;
}

/**
 * Run tests for a project using the appropriate runner.
 * Auto-detects the runner if language is not specified.
 */
export async function runTests(
  options: TestRunOptions & { language?: string },
): Promise<TestResult> {
  const { language, ...runOptions } = options;

  let runner: TestRunner | undefined;

  if (language) {
    runner = getTestRunner(language);
    if (!runner) {
      return {
        success: false,
        duration: 0,
        output: `No test runner registered for language: ${language}. Available: ${listTestRunners().join(", ") || "none"}`,
      };
    }
  } else {
    runner = await findTestRunnerForProject(runOptions.projectPath);
    if (!runner) {
      return {
        success: false,
        duration: 0,
        output: `Could not detect test runner for project. Registered runners: ${listTestRunners().join(", ") || "none"}`,
      };
    }
  }

  return runner.run(runOptions);
}

/**
 * Grove Core API exported to language extensions.
 */
export function getApi() {
  return {
    registerTestRunner,
    getTestRunner,
    listTestRunners,
    findTestRunnerForProject,
    runTests,
  };
}
