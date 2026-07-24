import { readFile } from "fs/promises";
import path from "path";
import { isPathWithinBoundary } from "./security";

export interface LoadEnvFileOptions {
  /**
   * When set, the parent-directory candidate (`../.env`) is only considered
   * if it lies within one of these roots. Prevents inheriting env vars from
   * outside the open workspace in monorepos or multi-root layouts.
   */
  workspaceRoots?: string[];
}

/**
 * Parses a .env file from the given project directory and returns all
 * key/value pairs as a plain object.
 *
 * Checks `project/.env`, `project/src/.env`, then `parent/.env`.
 * Returns `null` if no file exists, or skips files that contain no parseable pairs.
 */
export async function loadEnvFile(
  projectPath: string,
  options: LoadEnvFileOptions = {},
): Promise<Record<string, string> | null> {
  const parentEnvPath = path.join(projectPath, "..", ".env");
  const candidates = [
    path.join(projectPath, ".env"),
    path.join(projectPath, "src", ".env"),
    parentEnvPath,
  ];

  for (const filePath of candidates) {
    if (
      filePath === parentEnvPath &&
      options.workspaceRoots?.length &&
      !isWithinAnyWorkspaceRoot(filePath, options.workspaceRoots)
    ) {
      continue;
    }

    const parsed = await parseEnvFileAt(filePath);
    if (parsed && Object.keys(parsed).length > 0) {
      return parsed;
    }
  }

  return null;
}

function isWithinAnyWorkspaceRoot(
  candidatePath: string,
  workspaceRoots: string[],
): boolean {
  const resolved = path.resolve(candidatePath);
  return workspaceRoots.some((root) =>
    isPathWithinBoundary(resolved, path.resolve(root)),
  );
}

async function parseEnvFileAt(
  filePath: string,
): Promise<Record<string, string> | null> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }

  const result: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line === "") {
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (key === "") {
      continue;
    }

    let value = line.slice(eqIndex + 1);

    const trimmedValue = value.trim();
    const isDoubleQuoted =
      trimmedValue.startsWith('"') && trimmedValue.endsWith('"');
    const isSingleQuoted =
      trimmedValue.startsWith("'") && trimmedValue.endsWith("'");

    if (isDoubleQuoted || isSingleQuoted) {
      value = trimmedValue.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex);
      }
      value = value.trim();
    }

    result[key] = value;
  }

  return result;
}

/**
 * Extracts the hostname from a MongoDB connection string.
 * Handles both `mongodb://` and `mongodb+srv://` schemes.
 * Returns `undefined` if parsing fails.
 */
export function extractHost(
  connectionString: string,
): string | undefined {
  try {
    const url = new URL(connectionString);
    if (
      url.protocol !== "mongodb:" &&
      url.protocol !== "mongodb+srv:"
    ) {
      return undefined;
    }
    return url.hostname || undefined;
  } catch {
    return undefined;
  }
}
