import * as path from "path";

/**
 * Whether the active document is a Java test source file Grove can run.
 */
export function isRunnableJavaTestFile(
  filePath: string,
  scheme = "file",
): boolean {
  if (scheme !== "file") {
    return false;
  }

  if (!/\.java$/i.test(filePath)) {
    return false;
  }

  const base = path.basename(filePath);
  const posix = filePath.replaceAll("\\", "/");

  return (
    /Tests?\.java$/i.test(base) || /\/src\/test\//i.test(posix)
  );
}
