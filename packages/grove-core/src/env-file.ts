import { readFile } from "fs/promises";
import path from "path";

/**
 * Parses a .env file from the given project directory and returns all
 * key/value pairs as a plain object.
 *
 * Returns `null` if the file does not exist, or `{}` if it exists but
 * contains no parseable pairs.
 */
export async function loadEnvFile(
  projectPath: string
): Promise<Record<string, string> | null> {
  const filePath = path.join(projectPath, ".env");

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

    // Skip blank lines
    if (line === "") {
      continue;
    }

    // Skip comments
    if (line.startsWith("#")) {
      continue;
    }

    // Must contain '='
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (key === "") {
      continue;
    }

    let value = line.slice(eqIndex + 1);

    // Check if the value is quoted
    const trimmedValue = value.trim();
    const isDoubleQuoted =
      trimmedValue.startsWith('"') && trimmedValue.endsWith('"');
    const isSingleQuoted =
      trimmedValue.startsWith("'") && trimmedValue.endsWith("'");

    if (isDoubleQuoted || isSingleQuoted) {
      // Strip outer quotes
      value = trimmedValue.slice(1, -1);
    } else {
      // Strip inline comments (only outside of quotes): ` #` pattern
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
  connectionString: string
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
