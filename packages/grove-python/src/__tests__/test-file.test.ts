import { describe, it, expect } from "vitest";
import { isRunnablePythonTestFile } from "../test-file";

describe("isRunnablePythonTestFile", () => {
  it("accepts pytest-style test modules", () => {
    expect(
      isRunnablePythonTestFile("/project/tests/test_foo.py"),
    ).toBe(true);
    expect(
      isRunnablePythonTestFile("/project/foo_test.py"),
    ).toBe(true);
  });

  it("accepts files under tests directories", () => {
    expect(
      isRunnablePythonTestFile("/project/tests_package/test_bar.py"),
    ).toBe(true);
    expect(
      isRunnablePythonTestFile("/project/tests/integration/test_api.py"),
    ).toBe(true);
  });

  it("rejects non-file schemes and non-test files", () => {
    expect(
      isRunnablePythonTestFile("output:test.py", "output"),
    ).toBe(false);
    expect(
      isRunnablePythonTestFile("/project/src/main.py"),
    ).toBe(false);
  });
});
