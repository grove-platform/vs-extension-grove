import * as path from "path";

/** Whether the active document is a Node.js test file Grove can run. */
export function isRunnableNodeTestFile(
  filePath: string,
  scheme = "file",
): boolean {
  if (scheme !== "file") {
    return false;
  }

  const base = path.basename(filePath);
  const posix = filePath.replaceAll("\\", "/");

  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(base) ||
    /\/tests?\//i.test(posix) ||
    /\/__tests__\//i.test(posix)
  );
}
