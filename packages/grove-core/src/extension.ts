import * as vscode from "vscode";
import { detectGroveProjects, findProjectForFile } from "@grove/shared";
import type { GroveStatus } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";
import { GrovePanelProvider } from "./panel/GrovePanel";
import { getApi, runTests, findTestRunnerForProject } from "./test-runner-api";
export { getApi } from "./test-runner-api";

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

  // Register run tests command (delegates to language-specific runner)
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.runTests", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Determine project path from active file or use first detected project
      let projectPath = workspaceRoot;
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

      if (activeFile) {
        const projects = await detectGroveProjects(workspaceRoot);
        const project = findProjectForFile(activeFile, projects);
        if (project) {
          projectPath = project.rootPath;
        }
      }

      const runner = await findTestRunnerForProject(projectPath);

      if (!runner) {
        vscode.window.showWarningMessage(
          "No test runner found. Install a Grove language extension (e.g., Grove for Node.js).",
        );
        return;
      }

      const outputChannel = vscode.window.createOutputChannel("Grove Tests");

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running ${runner.name} tests...`,
          cancellable: false,
        },
        async () => {
          const result = await runTests({ projectPath });

          // Always log output to channel
          if (result.output) {
            outputChannel.clear();
            outputChannel.appendLine(`=== Grove Test Results ===`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            outputChannel.appendLine(`Success: ${result.success}`);
            outputChannel.appendLine(``);
            outputChannel.appendLine(result.output);
          }

          if (result.success) {
            vscode.window.showInformationMessage(
              `Tests passed: ${result.passed ?? 0}/${result.total ?? 0}`,
            );
          } else {
            // Show error with "Show Output" button
            const message =
              result.total === 0
                ? `Test runner failed. Check output for details.`
                : `Tests failed: ${result.failed ?? 0}/${result.total ?? 0}`;

            const action = await vscode.window.showErrorMessage(
              message,
              "Show Output",
            );
            if (action === "Show Output") {
              outputChannel.show();
            }
          }
        },
      );
    }),
  );

  // Log activation
  const outputChannel = vscode.window.createOutputChannel("Grove");
  outputChannel.appendLine(
    `Grove activated. Found ${status.projects.length} project(s).`,
  );
  context.subscriptions.push(outputChannel);

  // Return API for language extensions
  return getApi();
}

export function deactivate() {
  stopMcpServer();
}
