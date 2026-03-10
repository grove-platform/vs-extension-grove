import * as path from "path";

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export function isPathWithinBoundary(
  resolvedPath: string,
  basePath: string
): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedBase = path.normalize(basePath);

  return (
    normalizedResolved.startsWith(normalizedBase + path.sep) ||
    normalizedResolved === normalizedBase
  );
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

