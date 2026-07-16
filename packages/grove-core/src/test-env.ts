import type { GroveProject } from "@grove/shared";
import * as vscode from "vscode";

function getWorkspaceRoots(): string[] | undefined {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
}

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
  const envFromFile =
    (await loadEnvFile(project.rootPath, {
      workspaceRoots: getWorkspaceRoots(),
    })) ?? {};

  if (project.supportsEnvInjection && uiConnectionString) {
    return { ...envFromFile, CONNECTION_STRING: uiConnectionString };
  }

  return envFromFile;
}
