import { describe, it, expect } from "vitest";
import { extractHost, loadEnvFile } from "@grove/shared";

describe("grove-core env-file re-export", () => {
  it("re-exports loadEnvFile and extractHost from @grove/shared", () => {
    expect(typeof loadEnvFile).toBe("function");
    expect(typeof extractHost).toBe("function");
  });
});
