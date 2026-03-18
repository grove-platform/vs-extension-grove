import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GroveProject } from "@grove/shared";

vi.mock("../env-file", () => ({
  loadEnvFile: vi.fn(),
}));

import { loadEnvFile } from "../env-file";
import { resolveTestEnv } from "../test-env";

const mockLoadEnvFile = vi.mocked(loadEnvFile);

function makeProject(overrides: Partial<GroveProject> = {}): GroveProject {
  return {
    rootPath: "/test/project",
    relativePath: "test/project",
    displayName: "Test Project",
    language: null,
    supportsEnvInjection: true,
    ...overrides,
  };
}

describe("resolveTestEnv", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns {} when .env is null and no UI connection", async () => {
    mockLoadEnvFile.mockResolvedValue(null);

    const result = await resolveTestEnv(makeProject());
    expect(result).toEqual({});
  });

  it("returns env file values unchanged when no UI connection", async () => {
    mockLoadEnvFile.mockResolvedValue({
      TZ: "UTC",
      CONNECTION_STRING: "mongodb://from-env",
    });

    const result = await resolveTestEnv(makeProject());
    expect(result).toEqual({
      TZ: "UTC",
      CONNECTION_STRING: "mongodb://from-env",
    });
  });

  it("overrides CONNECTION_STRING with UI connection when supportsEnvInjection is true", async () => {
    mockLoadEnvFile.mockResolvedValue({
      TZ: "UTC",
      CONNECTION_STRING: "mongodb://from-env",
    });

    const result = await resolveTestEnv(
      makeProject({ supportsEnvInjection: true }),
      "mongodb://from-ui",
    );
    expect(result).toEqual({
      TZ: "UTC",
      CONNECTION_STRING: "mongodb://from-ui",
    });
  });

  it("does NOT override CONNECTION_STRING when supportsEnvInjection is false", async () => {
    mockLoadEnvFile.mockResolvedValue({
      CONNECTION_STRING: "mongodb://from-env",
    });

    const result = await resolveTestEnv(
      makeProject({ supportsEnvInjection: false }),
      "mongodb://from-ui",
    );
    expect(result).toEqual({
      CONNECTION_STRING: "mongodb://from-env",
    });
  });

  it("returns { CONNECTION_STRING } when .env is null but supportsEnvInjection and UI connection provided", async () => {
    mockLoadEnvFile.mockResolvedValue(null);

    const result = await resolveTestEnv(
      makeProject({ supportsEnvInjection: true }),
      "mongodb://from-ui",
    );
    expect(result).toEqual({
      CONNECTION_STRING: "mongodb://from-ui",
    });
  });
});
