import * as vscode from "vscode";
import { detectGroveProjects } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove extension activate() called");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  // Detect Grove projects
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);

  if (projects.length > 0) {
    // Update status bar
    statusBarItem.text = `$(tree) Grove: ${projects[0].relativePath}`;
    statusBarItem.tooltip = `Grove project detected\n${projects.length} project(s) found`;
    statusBarItem.show();

    // Start MCP server
    await startMcpServer(context, workspaceFolders[0].uri.fsPath);
  }

  // Register commands
  registerCopyConfigCommand(context);

  // Log activation
  const outputChannel = vscode.window.createOutputChannel("Grove");
  outputChannel.appendLine(
    `Grove activated. Found ${projects.length} project(s).`,
  );
  context.subscriptions.push(outputChannel);
}

export function deactivate() {
  stopMcpServer();
}
