import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GroveProject } from "@grove/shared";

const mockShowErrorMessage = vi.fn();
const mockWorkspaceFolders = vi.fn();

vi.mock("vscode", () => ({
  window: {
    showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
    showWarningMessage: vi.fn(),
    withProgress: vi.fn(
      async (
        _options: unknown,
        task: () => Promise<void>,
      ) => task(),
    ),
    activeTextEditor: undefined,
  },
  workspace: {
    get isTrusted() {
      return true;
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

import { getCachedProjects } from "../project-cache";
import { resolveProjectForLanguage } from "../test-execution";

const mockGetCachedProjects = vi.mocked(getCachedProjects);

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
    mockWorkspaceFolders.mockReturnValue([
      { uri: { fsPath: "/workspace" } },
    ]);
  });

  it("returns the project containing the active file", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await resolveProjectForLanguage(
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

    const resolved = await resolveProjectForLanguage("csharp");

    expect(resolved?.project.rootPath).toBe("/workspace/csharp");
  });

  it("returns the only project when exactly one matches the language", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("csharp", "/workspace/csharp", "csharp"),
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await resolveProjectForLanguage("csharp");

    expect(resolved?.project.rootPath).toBe("/workspace/csharp");
  });

  it("fails when no project matches the requested language", async () => {
    mockGetCachedProjects.mockResolvedValue([
      makeProject("nodejs", "/workspace/nodejs", "nodejs"),
    ]);

    const resolved = await resolveProjectForLanguage("csharp");

    expect(resolved).toBeUndefined();
    expect(mockShowErrorMessage).toHaveBeenCalled();
  });
});
