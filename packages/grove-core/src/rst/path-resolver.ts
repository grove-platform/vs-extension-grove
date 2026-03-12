/**
 * Grove RST Path Resolver
 *
 * Resolves literalinclude paths across symlinks and relative to snooty.toml.
 * Handles the various ways paths can be specified in RST documentation.
 */

import * as path from "path";
import * as fs from "fs";

export interface ResolvedPath {
  /** Absolute path to the resolved file */
  absolutePath: string;
  /** Whether the file exists */
  exists: boolean;
  /** If resolved through a symlink, the symlink path */
  symlinkPath?: string;
  /** Reason for resolution failure */
  error?: string;
}

/**
 * Find the documentation source directory by looking for snooty.toml.
 * In Snooty projects, the source root is the "source" subdirectory
 * adjacent to snooty.toml.
 */
export function findSourceDir(startPath: string): string | undefined {
  let current = startPath;
  const root = path.parse(current).root;

  while (current !== root) {
    const snootyPath = path.join(current, "snooty.toml");
    if (fs.existsSync(snootyPath)) {
      // Snooty projects use a "source" subdirectory
      const sourceDir = path.join(current, "source");
      if (fs.existsSync(sourceDir)) {
        return sourceDir;
      }
      // Fall back to the directory containing snooty.toml
      return current;
    }

    current = path.dirname(current);
  }

  return undefined;
}

/**
 * Resolve a literalinclude path to an absolute file path.
 *
 * Resolution order:
 * 1. Absolute path (starts with /) - relative to source directory
 * 2. Relative to RST file's directory
 * 3. Relative to source directory (where snooty.toml's source/ lives)
 * 4. Through symlinks in the directory tree
 */
export async function resolveLiteralIncludePath(
  rstFilePath: string,
  targetPath: string,
  workspaceRoot?: string,
): Promise<ResolvedPath> {
  // Handle absolute paths (relative to source root)
  if (targetPath.startsWith("/")) {
    const sourceDir = findSourceDir(rstFilePath);
    if (sourceDir) {
      const absolutePath = path.join(sourceDir, targetPath);
      return checkPathExists(absolutePath, workspaceRoot);
    }
    // Fall back to workspace root
    if (workspaceRoot) {
      const absolutePath = path.join(workspaceRoot, targetPath);
      return checkPathExists(absolutePath, workspaceRoot);
    }
    return {
      absolutePath: targetPath,
      exists: false,
      error: "Cannot resolve absolute path without source directory",
    };
  }

  // Try relative to RST file's directory
  const rstDir = path.dirname(rstFilePath);
  const relativePath = path.resolve(rstDir, targetPath);

  // Check if file exists at relative path
  if (fs.existsSync(relativePath)) {
    return {
      absolutePath: relativePath,
      exists: true,
    };
  }

  // Check if relative path goes through a symlink
  const symlinkResult = await resolveSymlinkPath(rstDir, targetPath);
  if (symlinkResult.exists) {
    return symlinkResult;
  }

  // Try relative to source directory
  const sourceDir = findSourceDir(rstFilePath);
  if (sourceDir) {
    const sourcePath = path.resolve(sourceDir, targetPath);
    if (fs.existsSync(sourcePath)) {
      return {
        absolutePath: sourcePath,
        exists: true,
      };
    }
  }

  // Return the best guess path with error
  return {
    absolutePath: relativePath,
    exists: false,
    error: `File not found: ${targetPath}`,
  };
}

/**
 * Check if a path exists and is within workspace boundaries.
 */
function checkPathExists(
  absolutePath: string,
  workspaceRoot?: string,
): ResolvedPath {
  // Security: Ensure path is within workspace
  if (workspaceRoot) {
    const normalizedPath = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(workspaceRoot);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return {
        absolutePath,
        exists: false,
        error: "Path is outside workspace boundaries",
      };
    }
  }

  const exists = fs.existsSync(absolutePath);
  return {
    absolutePath,
    exists,
    error: exists ? undefined : `File not found: ${absolutePath}`,
  };
}

/**
 * Resolve a path that may go through symlinks.
 */
async function resolveSymlinkPath(
  startDir: string,
  targetPath: string,
): Promise<ResolvedPath> {
  const parts = targetPath.split(path.sep);
  let currentDir = startDir;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const possibleSymlink = path.join(currentDir, part);

    try {
      const stats = await fs.promises.lstat(possibleSymlink);
      if (stats.isSymbolicLink()) {
        const realPath = await fs.promises.realpath(possibleSymlink);
        const remainingPath = parts.slice(i + 1).join(path.sep);
        const fullPath = path.join(realPath, remainingPath);

        if (fs.existsSync(fullPath)) {
          return {
            absolutePath: fullPath,
            exists: true,
            symlinkPath: possibleSymlink,
          };
        }
      }
      currentDir = possibleSymlink;
    } catch {
      // Path doesn't exist
      break;
    }
  }

  return {
    absolutePath: path.join(startDir, targetPath),
    exists: false,
  };
}
