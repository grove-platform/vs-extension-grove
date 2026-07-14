import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseEnvFile, resolveJavaTestEnv } from "../env";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("parseEnvFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-env-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should parse CONNECTION_STRING from .env", async () => {
    await fs.writeFile(
      path.join(tempDir, ".env"),
      'CONNECTION_STRING="mongodb://localhost:27017"\n',
    );

    expect(await parseEnvFile(path.join(tempDir, ".env"))).toEqual({
      CONNECTION_STRING: "mongodb://localhost:27017",
    });
  });
});

describe("resolveJavaTestEnv", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-env-resolve-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should load driver-sync/.env first", async () => {
    const driverSync = path.join(tempDir, "driver-sync");
    await fs.mkdir(driverSync, { recursive: true });
    await fs.writeFile(
      path.join(driverSync, ".env"),
      'CONNECTION_STRING="mongodb://driver-sync"\n',
    );
    await fs.writeFile(
      path.join(tempDir, ".env"),
      'CONNECTION_STRING="mongodb://parent"\n',
    );

    expect(await resolveJavaTestEnv(driverSync)).toEqual({
      CONNECTION_STRING: "mongodb://driver-sync",
    });
  });

  it("should fall back to parent java/.env", async () => {
    const driverSync = path.join(tempDir, "driver-sync");
    await fs.mkdir(driverSync, { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".env"),
      'CONNECTION_STRING="mongodb://parent"\n',
    );

    expect(await resolveJavaTestEnv(driverSync)).toEqual({
      CONNECTION_STRING: "mongodb://parent",
    });
  });

  it("should load project/src/.env", async () => {
    const driverSync = path.join(tempDir, "driver-sync");
    await fs.mkdir(path.join(driverSync, "src"), { recursive: true });
    await fs.writeFile(
      path.join(driverSync, "src", ".env"),
      'CONNECTION_STRING="mongodb://src-env"\n',
    );

    expect(await resolveJavaTestEnv(driverSync)).toEqual({
      CONNECTION_STRING: "mongodb://src-env",
    });
  });
});
