import { readFile } from "fs/promises";
import * as path from "path";

/**
 * Parse a .env file into key/value pairs.
 */
export async function parseEnvFile(
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
    if (line === "" || line.startsWith("#")) {
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
    const isQuoted =
      (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"));

    if (isQuoted) {
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
 * Load CONNECTION_STRING and other vars from .env files.
 * Checks project/.env, project/src/.env, then parent/.env (e.g. java/.env).
 */
export async function resolveJavaTestEnv(
  projectPath: string,
): Promise<Record<string, string>> {
  const candidates = [
    path.join(projectPath, ".env"),
    path.join(projectPath, "src", ".env"),
    path.join(projectPath, "..", ".env"),
  ];

  for (const candidate of candidates) {
    const env = await parseEnvFile(candidate);
    if (env && Object.keys(env).length > 0) {
      return env;
    }
  }

  return {};
}
