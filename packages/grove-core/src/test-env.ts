import type { GroveProject } from "@grove/shared";

/**
 * Builds the environment variables for a test run by reading the project's
 * `.env` file and conditionally overriding `CONNECTION_STRING` with the
 * Grove UI connection string when the project supports env injection.
 */
export async function resolveTestEnv(
  project: GroveProject,
  uiConnectionString?: string,
): Promise<Record<string, string>> {
  const { loadEnvFile } = await import("./env-file");
  const envFromFile = (await loadEnvFile(project.rootPath)) ?? {};

  if (project.supportsEnvInjection && uiConnectionString) {
    return { ...envFromFile, CONNECTION_STRING: uiConnectionString };
  }

  return envFromFile;
}
