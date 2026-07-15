import * as path from "path";

/** Whether the active document is a C# test file Grove can run. */
export function isRunnableCSharpTestFile(
  filePath: string,
  scheme = "file",
): boolean {
  if (scheme !== "file") {
    return false;
  }

  if (!/\.cs$/i.test(filePath)) {
    return false;
  }

  const base = path.basename(filePath);
  const posix = filePath.replaceAll("\\", "/");

  return /Tests?\.cs$/i.test(base) || /\/tests?\//i.test(posix);
}
