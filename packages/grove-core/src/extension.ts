import * as vscode from "vscode";
import { detectGroveProjects } from "@grove/shared";
import type { GroveStatus } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";
import { GrovePanelProvider } from "./panel/GrovePanel";

let statusBarItem: vscode.StatusBarItem;
let currentStatus: GroveStatus | null = null;

async function getStatus(): Promise<GroveStatus> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection: { connected: false, clusterType: "unknown" },
    };
  }

  const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);

  currentStatus = {
    hasProject: projects.length > 0,
    activeProject: projects[0] ?? null,
    projects,
    mongoConnection: { connected: false, clusterType: "unknown" },
  };

  return currentStatus;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Grove extension activate() called");

  // Register Grove Panel
  const panelProvider = new GrovePanelProvider(context.extensionUri, getStatus);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GrovePanelProvider.viewType,
      panelProvider,
    ),
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.refreshPanel", () => {
      panelProvider.refresh();
    }),
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  // Detect Grove projects and update status
  const status = await getStatus();

  if (status.hasProject && status.activeProject) {
    // Update status bar
    statusBarItem.text = `$(tree) Grove: ${status.activeProject.relativePath}`;
    statusBarItem.tooltip = `Grove project detected\n${status.projects.length} project(s) found`;
    statusBarItem.show();

    // Start MCP server
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      await startMcpServer(context, workspaceFolders[0].uri.fsPath);
    }
  }

  // Register commands
  registerCopyConfigCommand(context);

  // Log activation
  const outputChannel = vscode.window.createOutputChannel("Grove");
  outputChannel.appendLine(
    `Grove activated. Found ${status.projects.length} project(s).`,
  );
  context.subscriptions.push(outputChannel);
}

export function deactivate() {
  stopMcpServer();
}
