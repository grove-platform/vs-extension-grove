import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadEnvFile, extractHost } from "../env-file";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "fs/promises";

const mockReadFile = vi.mocked(readFile);

describe("loadEnvFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when .env file does not exist", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockReadFile.mockRejectedValue(err);

    const result = await loadEnvFile("/project");
    expect(result).toBeNull();
  });

  it("returns {} when file is empty", async () => {
    mockReadFile.mockResolvedValue("");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({});
  });

  it("parses KEY=value (bare value)", async () => {
    mockReadFile.mockResolvedValue("KEY=value");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value" });
  });

  it('parses KEY="value with spaces" (double-quoted)', async () => {
    mockReadFile.mockResolvedValue('KEY="value with spaces"');

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value with spaces" });
  });

  it("parses KEY='value' (single-quoted)", async () => {
    mockReadFile.mockResolvedValue("KEY='value'");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value" });
  });

  it("parses TZ=UTC correctly (bare, no quotes)", async () => {
    mockReadFile.mockResolvedValue("TZ=UTC");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ TZ: "UTC" });
  });

  it("skips lines starting with #", async () => {
    mockReadFile.mockResolvedValue("# comment\nKEY=value");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value" });
  });

  it("skips blank lines", async () => {
    mockReadFile.mockResolvedValue("KEY=value\n\nKEY2=value2");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value", KEY2: "value2" });
  });

  it("splits on first = only — KEY=val=ue gives value val=ue", async () => {
    mockReadFile.mockResolvedValue("KEY=val=ue");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "val=ue" });
  });

  it("returns multiple keys from a multi-line file", async () => {
    mockReadFile.mockResolvedValue("A=1\nB=2\nC=3");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ A: "1", B: "2", C: "3" });
  });

  it("skips malformed lines that have no =", async () => {
    mockReadFile.mockResolvedValue("NOEQUALS\nKEY=value");

    const result = await loadEnvFile("/project");
    expect(result).toEqual({ KEY: "value" });
  });
});

describe("extractHost", () => {
  it("extracts hostname from mongodb+srv connection string", () => {
    expect(
      extractHost("mongodb+srv://user:pass@cluster0.abc.mongodb.net/db")
    ).toBe("cluster0.abc.mongodb.net");
  });

  it("extracts hostname from mongodb://localhost:27017", () => {
    expect(extractHost("mongodb://localhost:27017")).toBe("localhost");
  });

  it("returns undefined for an empty string", () => {
    expect(extractHost("")).toBeUndefined();
  });

  it("returns undefined for a non-URL string", () => {
    expect(extractHost("garbage")).toBeUndefined();
  });
});
