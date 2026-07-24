import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadEnvFile } from "@grove/shared";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("loadEnvFile for Java projects", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-java-env-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("loads driver-sync/src/.env when project root has no .env", async () => {
    const driverSync = path.join(tempDir, "driver-sync");
    await fs.mkdir(path.join(driverSync, "src"), { recursive: true });
    await fs.writeFile(
      path.join(driverSync, "src", ".env"),
      'CONNECTION_STRING="mongodb://127.0.0.1:27017"\n',
    );

    expect(await loadEnvFile(driverSync)).toEqual({
      CONNECTION_STRING: "mongodb://127.0.0.1:27017",
    });
  });
});
