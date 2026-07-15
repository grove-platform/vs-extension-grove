import { describe, it, expect } from "vitest";
import { isRunnableNodeTestFile } from "../test-file";

describe("isRunnableNodeTestFile", () => {
  it("accepts common Jest test file names", () => {
    expect(
      isRunnableNodeTestFile("/project/src/foo.test.ts"),
    ).toBe(true);
    expect(
      isRunnableNodeTestFile("/project/src/foo.spec.js"),
    ).toBe(true);
  });

  it("accepts files under tests directories", () => {
    expect(
      isRunnableNodeTestFile("/project/tests/integration/api.js"),
    ).toBe(true);
    expect(
      isRunnableNodeTestFile("/project/src/__tests__/api.test.ts"),
    ).toBe(true);
  });

  it("rejects non-file schemes and non-test files", () => {
    expect(
      isRunnableNodeTestFile("output:test", "output"),
    ).toBe(false);
    expect(
      isRunnableNodeTestFile("/project/src/index.ts"),
    ).toBe(false);
  });
});
