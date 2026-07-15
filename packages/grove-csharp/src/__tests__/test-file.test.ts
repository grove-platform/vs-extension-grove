import { describe, it, expect } from "vitest";
import { isRunnableCSharpTestFile } from "../test-file";

describe("isRunnableCSharpTestFile", () => {
  it("accepts common C# test file names", () => {
    expect(
      isRunnableCSharpTestFile("/project/Tests/InsertTests.cs"),
    ).toBe(true);
    expect(
      isRunnableCSharpTestFile("/project/Tests/AggregationTest.cs"),
    ).toBe(true);
  });

  it("accepts files under tests directories", () => {
    expect(
      isRunnableCSharpTestFile("/project/tests/integration/Helper.cs"),
    ).toBe(true);
  });

  it("rejects non-file schemes and non-test files", () => {
    expect(
      isRunnableCSharpTestFile("output:README.md", "output"),
    ).toBe(false);
    expect(
      isRunnableCSharpTestFile("/project/Program.cs"),
    ).toBe(false);
    expect(
      isRunnableCSharpTestFile("/project/README.md"),
    ).toBe(false);
  });
});
