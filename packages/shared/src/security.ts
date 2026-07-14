import * as path from "path";

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export function isPathWithinBoundary(
  resolvedPath: string,
  basePath: string,
): boolean {
  const resolved = path.resolve(resolvedPath);
  const base = path.resolve(basePath);
  const relative = path.relative(base, resolved);

  if (relative === "") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Sanitize a relative path by removing dangerous components.
 */
export function sanitizePath(relativePath: string): string {
  // Remove null bytes
  let sanitized = relativePath.replace(/\0/g, "");

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove leading slashes (prevent absolute paths)
  sanitized = sanitized.replace(/^\/+/, "");

  return sanitized;
}

/**
 * Validate that a path is within the workspace boundary.
 * Resolves the path and checks it's within the workspace.
 */
export function validateWorkspacePath(
  filePath: string,
  workspacePath: string,
): boolean {
  const resolvedPath = path.resolve(filePath);
  return isPathWithinBoundary(resolvedPath, workspacePath);
}
