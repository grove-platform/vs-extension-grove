import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";

let mcpProcess: ChildProcess | null = null;
let restartCount = 0;
const MAX_RESTARTS = 3;

/**
 * Resolve the MCP server path, following symlinks if necessary.
 */
function resolveMcpServerPath(extensionPath: string): string {
  const symlinkPath = path.join(
    extensionPath,
    "node_modules",
    "@mongodb",
    "grove-mcp",
    "dist",
    "index.js",
  );

  try {
    // Follow symlinks to get the real path (needed for pnpm workspaces)
    return fs.realpathSync(symlinkPath);
  } catch {
    // Fallback to the symlink path if realpath fails
    return symlinkPath;
  }
}

/**
 * Start the MCP server as a child process.
 */
export async function startMcpServer(
  context: vscode.ExtensionContext,
  workspacePath: string,
): Promise<void> {
  const serverPath = resolveMcpServerPath(context.extensionPath);

  mcpProcess = spawn("node", [serverPath], {
    env: {
      ...process.env,
      GROVE_WORKSPACE: workspacePath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  mcpProcess.on("exit", (code) => {
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      const delay = Math.pow(2, restartCount) * 1000; // Exponential backoff
      setTimeout(() => startMcpServer(context, workspacePath), delay);
    }
  });

  mcpProcess.stderr?.on("data", (data) => {
    console.error(`Grove MCP server error: ${data}`);
  });
}

/**
 * Stop the MCP server.
 */
export function stopMcpServer(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}

/**
 * Get the MCP server configuration JSON for Augment.
 */
export function getMcpConfig(extensionPath: string): object {
  return {
    mcpServers: {
      grove: {
        command: "node",
        args: [resolveMcpServerPath(extensionPath)],
        env: {
          GROVE_WORKSPACE: "${workspaceFolder}",
        },
      },
    },
  };
}
