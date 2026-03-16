/**
 * Diagnostics Collector
 *
 * Collects system and extension diagnostic information for feedback submissions.
 * This information helps the DevDocs team debug issues and understand the user's environment.
 */

import * as vscode from "vscode";
import * as os from "os";
import type { DiagnosticInfo } from "./types";

/** Extension ID for Grove core */
const GROVE_EXTENSION_ID = "mongodb.grove-core";

/**
 * Get the Grove extension version from package.json.
 * @returns The extension version or "unknown" if not found.
 */
function getGroveVersion(): string {
  try {
    const extension = vscode.extensions.getExtension(GROVE_EXTENSION_ID);
    return extension?.packageJSON?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Get the operating system information.
 * @returns A string with platform and release information.
 */
function getOSInfo(): string {
  try {
    return `${os.platform()} ${os.release()}`;
  } catch {
    return "unknown";
  }
}

/**
 * Get the names of detected Grove projects in the workspace.
 * @returns An array of project names/paths.
 */
async function getDetectedProjectNames(): Promise<string[]> {
  try {
    // Import dynamically to avoid circular dependencies
    const { getCachedProjects } = await import("../project-cache");
    const projects = await getCachedProjects();
    return projects.map((p) => p.name || p.rootPath);
  } catch {
    return [];
  }
}

/**
 * Collect all diagnostic information for a feedback submission.
 * This function gathers non-sensitive system information to help with debugging.
 *
 * @returns A promise that resolves to the diagnostic information.
 */
export async function collectDiagnostics(): Promise<DiagnosticInfo> {
  const [detectedProjects] = await Promise.all([getDetectedProjectNames()]);

  return {
    groveVersion: getGroveVersion(),
    vscodeVersion: vscode.version,
    os: getOSInfo(),
    nodeVersion: process.version,
    detectedProjects,
    timestamp: new Date().toISOString(),
  };
}

