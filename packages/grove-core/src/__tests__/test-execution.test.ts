import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GroveProject } from "@grove/shared";

let isTrusted = true;

const mockShowErrorMessage = vi.fn();
const mockShowWarningMessage = vi.fn();
const mockWorkspaceFolders = vi.fn();
const mockWithProgress = vi.fn(
  async (_options: unknown, task: () => Promise<void>) => task(),
);

vi.mock("vscode", () => ({
  window: {
    showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
    showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
    showInformationMessage: vi.fn(),
    withProgress: (...args: unknown[]) => mockWithProgress(...args),
    activeTextEditor: undefined,
  },
  workspace: {
    get isTrusted() {
      return isTrusted;
    },
    get workspaceFolders() {
      return mockWorkspaceFolders();
    },
  },
  ProgressLocation: { Notification: 15 },
}));

vi.mock("../project-cache", () => ({
  getCachedProjects: vi.fn(),
}));

vi.mock("../test-runner-api", () => ({
  getTestRunner: vi.fn(),
  resolveRunnerForProject: vi.fn(),
  runTests: vi.fn(),
}));

vi.mock("../test-env", () => ({
  resolveTestEnv: vi.fn().mockResolvedValue({}),
}));

vi.mock("../logger", () => ({
  getTestOutputChannel: vi.fn(() => ({
    clear: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock("@grove/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grove/shared")>();
  return {
    ...actual,
    isPathWithinRealBoundary: vi.fn(),
  };
});

import { getCachedProjects } from "../project-cache";
import { getTestRunner, resolveRunnerForProject, runTests } from "../test-runner-api";
import { isPathWithinRealBoundary } from "@grove/shared";
import * as testExecution from "../test-execution";

const mockGetCachedProjects = vi.mocked(getCachedProjects);
const mockGetTestRunner = vi.mocked(getTestRunner);
const mockResolveRunnerForProject = vi.mocked(resolveRunnerForProject);
const mockRunTests = vi.mocked(runTests);
const mockIsPathWithinRealBoundary = vi.mocked(isPathWithinRealBoundary);

function makeProject(
  language: GroveProject["language"],
  rootPath: string,
  relativePath: string,
): GroveProject {
  return {
    rootPath,
    relativePath,
    displayName: relativePath,
    language,
    supportsEnvInjection: language !== "nodejs",
  };
}

describe("resolveProjectForLanguage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isTrusted = true;
    mockWorkspaceFolders.mockReturnValue([
      { uri: { fsPath: "/workspace" } },
    ]);
    mockGetTestRunner.mockImplementation((language: string) => ({
      language,
      name: language === "csharp" ? "C#" : language,
      run: vi.fn(),
      detect: vi.fn(),
    }));
  });

  it("returns the project containing the active file", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await testExecution.resolveProjectForLanguage(
      "csharp",
      "/workspace/csharp/Tests/FooTests.cs",
    );

    expect(resolved?.project.rootPath).toBe("/workspace/csharp");
  });

  it("returns the workspace-root project when it matches the language", async () => {
    mockWorkspaceFolders.mockReturnValue([
      { uri: { fsPath: "/workspace/csharp" } },
    ]);
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "."),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await testExecution.resolveProjectForLanguage("csharp");

    expect(resolved?.project.rootPath).toBe("/workspace/csharp");
  });

  it("returns the only project when exactly one matches the language", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await testExecution.resolveProjectForLanguage("csharp");

    expect(resolved?.project.rootPath).toBe("/workspace/csharp");
  });

  it("fails when no project matches the requested language", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await testExecution.resolveProjectForLanguage("csharp");

    expect(resolved).toBeUndefined();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("No Grove C# project found"),
    );
  });

  it("reports ambiguity when multiple language projects exist", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp-a", "csharp-a"),
      makeProject("csharp", "/workspace/csharp-b", "csharp-b"),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await testExecution.resolveProjectForLanguage("csharp");

    expect(resolved).toBeUndefined();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      "Multiple Grove C# projects found. Open a file inside the project you want to test. Detected projects: csharp-a, csharp-b",
    );
  });
});

describe("runGroveTests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isTrusted = true;
    mockWorkspaceFolders.mockReturnValue([
      { uri: { fsPath: "/workspace" } },
    ]);
    testExecution.initTestExecution({
      getUiConnectionString: () => undefined,
    });
  });

  it("blocks execution in an untrusted workspace", async () => {
    isTrusted = false;

    await testExecution.runGroveTests({ language: "csharp" });

    expect(mockWithProgress).not.toHaveBeenCalled();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("untrusted workspace"),
    );
  });

  it("warns when testFileScope is set without an active file", async () => {
    await testExecution.runGroveTests({ language: "csharp", testFileScope: true });

    expect(mockWithProgress).not.toHaveBeenCalled();
    expect(mockShowWarningMessage).toHaveBeenCalledWith("No active file");
  });

  it("rejects non-file URIs for single-file runs", async () => {
    await testExecution.runGroveTests({
      language: "csharp",
      testFileScope: true,
      activeFilePath: "README.md",
      documentScheme: "output",
    });

    expect(mockWithProgress).not.toHaveBeenCalled();
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      "Open a file on disk before running this command.",
    );
  });

  it("rejects non-runnable test files", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
    ]);
    mockGetTestRunner.mockReturnValue({
      language: "csharp",
      name: "C#",
      run: vi.fn(),
      detect: vi.fn(),
      isRunnableTestFile: () => false,
      runnableTestFileMessage:
        "Open a C# test file (for example InsertTests.cs) before running this command.",
    });

    await testExecution.runGroveTests({
      language: "csharp",
      testFileScope: true,
      activeFilePath: "/workspace/csharp/README.md",
      documentScheme: "file",
    });

    expect(mockWithProgress).not.toHaveBeenCalled();
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("C# test file"),
    );
  });

  it("rejects test files outside the project boundary", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
    ]);
    mockGetTestRunner.mockReturnValue({
      language: "csharp",
      name: "C#",
      run: vi.fn(),
      detect: vi.fn(),
      isRunnableTestFile: () => true,
    });
    mockIsPathWithinRealBoundary.mockResolvedValue(false);

    await testExecution.runGroveTests({
      language: "csharp",
      testFileScope: true,
      activeFilePath: "/workspace/csharp/Tests/FooTests.cs",
      documentScheme: "file",
    });

    expect(mockWithProgress).not.toHaveBeenCalled();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      "Test file is outside the Grove project.",
    );
  });

  it("runs tests when guards pass", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
    ]);
    mockGetTestRunner.mockReturnValue({
      language: "csharp",
      name: "C#",
      run: vi.fn(),
      detect: vi.fn(),
      isRunnableTestFile: () => true,
    });
    mockIsPathWithinRealBoundary.mockResolvedValue(true);
    mockResolveRunnerForProject.mockResolvedValue({
      language: "csharp",
      name: "C#",
      run: vi.fn(),
      detect: vi.fn(),
    });
    mockRunTests.mockResolvedValue({
      success: true,
      duration: 1,
      output: "ok",
    });

    await testExecution.runGroveTests({
      language: "csharp",
      testFileScope: true,
      activeFilePath: "/workspace/csharp/Tests/FooTests.cs",
      documentScheme: "file",
    });

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
    expect(mockWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Running tests for Tests/FooTests.cs...",
      }),
      expect.any(Function),
    );
  });
});
