import * as path from "path";

/** Whether the active document is a Python test file Grove can run. */
export function isRunnablePythonTestFile(
  filePath: string,
  scheme = "file",
): boolean {
  if (scheme !== "file") {
    return false;
  }

  if (!/\.py$/i.test(filePath)) {
    return false;
  }

  const base = path.basename(filePath);
  const posix = filePath.replaceAll("\\", "/");

  return (
    /^test_.+\.py$/i.test(base) ||
    /_test\.py$/i.test(base) ||
    /\/tests?\//i.test(posix) ||
    /\/tests_package\//i.test(posix)
  );
}
