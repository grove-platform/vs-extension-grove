import { describe, it, expect } from "vitest";
import { isRunnableJavaTestFile } from "../test-file";

describe("isRunnableJavaTestFile", () => {
  it("accepts JUnit test classes under src/test/java", () => {
    expect(
      isRunnableJavaTestFile(
        "/proj/driver-sync/src/test/java/aggregation/pipelines/TutorialTests.java",
      ),
    ).toBe(true);
  });

  it("rejects non-java documents", () => {
    expect(
      isRunnableJavaTestFile(
        "extension-output-GrovePlatform.grove-platform-java",
        "output",
      ),
    ).toBe(false);
  });

  it("rejects main source files", () => {
    expect(
      isRunnableJavaTestFile(
        "/proj/driver-sync/src/main/java/aggregation/pipelines/AggTutorial.java",
      ),
    ).toBe(false);
  });
});
