import * as vscode from "vscode";
import { detectGroveProjects, findProjectForFile } from "@grove/shared";
import type { GroveStatus, GroveProject } from "@grove/shared";
import { startMcpServer, stopMcpServer } from "./mcp-bridge";
import { registerCopyConfigCommand } from "./commands/copy-config";
import { GrovePanelProvider } from "./panel/GrovePanel";
import {
  getApi as getTestRunnerApi,
  runTests,
  findTestRunnerForProject,
} from "./test-runner-api";
import { initDiagnostics, refreshAllDiagnostics } from "./diagnostics";
import {
  initLanguageStatus,
  registerLanguageStatusHandlers,
  updateLanguageStatus,
} from "./language-status";
import { registerSymlinkCommand } from "./symlink";

let statusBarItem: vscode.StatusBarItem;
let currentStatus: GroveStatus | null = null;
let outputChannel: vscode.LogOutputChannel;

/**
 * Get the current detected projects.
 * Exposed via the extension API for other extensions.
 */
export function getDetectedProjects(): GroveProject[] {
  return currentStatus?.projects ?? [];
}

/**
 * Get the currently active project.
 * Exposed via the extension API for other extensions.
 */
export function getActiveProject(): GroveProject | null {
  return currentStatus?.activeProject ?? null;
}

/**
 * Grove Core API exported to language extensions.
 * Combines test runner API with project detection API.
 */
export function getApi() {
  return {
    // Test runner API
    ...getTestRunnerApi(),
    // Project detection API
    getDetectedProjects,
    getActiveProject,
  };
}

/**
 * Get Grove configuration settings.
 */
function getConfig() {
  const config = vscode.workspace.getConfiguration("grove");
  return {
    autoDetect: config.get<boolean>("autoDetect", true),
    bluehawkPath: config.get<string>("bluehawkPath", ""),
    showStatusBar: config.get<boolean>("showStatusBar", true),
  };
}

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

/**
 * Detect Grove projects with progress indicator.
 */
async function detectProjectsWithProgress(
  workspacePath: string,
): Promise<GroveProject[]> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Grove: Detecting projects...",
    },
    async (progress) => {
      progress.report({ increment: 0 });
      const projects = await detectGroveProjects(workspacePath);
      progress.report({ increment: 100 });
      return projects;
    },
  );
}

/**
 * Start MCP server with progress indicator.
 */
async function startMcpServerWithProgress(
  context: vscode.ExtensionContext,
  workspacePath: string,
): Promise<void> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Grove: Starting MCP server...",
    },
    async (progress) => {
      progress.report({ increment: 0 });
      await startMcpServer(context, workspacePath);
      progress.report({ increment: 100 });
    },
  );
}

export async function activate(context: vscode.ExtensionContext) {
  // Create log output channel
  outputChannel = vscode.window.createOutputChannel("Grove", { log: true });
  context.subscriptions.push(outputChannel);
  outputChannel.info("Grove extension activating...");

  const config = getConfig();

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

  // Detect Grove projects and update status (with progress indicator if auto-detect enabled)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let status: GroveStatus;

  if (config.autoDetect && workspaceFolders) {
    const projects = await detectProjectsWithProgress(
      workspaceFolders[0].uri.fsPath,
    );
    currentStatus = {
      hasProject: projects.length > 0,
      activeProject: projects[0] ?? null,
      projects,
      mongoConnection: { connected: false, clusterType: "unknown" },
    };
    status = currentStatus;
    outputChannel.info(`Detected ${projects.length} Grove project(s)`);
  } else {
    status = await getStatus();
  }

  if (status.hasProject && status.activeProject) {
    // Update status bar (respecting showStatusBar setting)
    if (config.showStatusBar) {
      statusBarItem.text = `$(tree) Grove: ${status.activeProject.relativePath}`;
      statusBarItem.tooltip = `Grove project detected\n${status.projects.length} project(s) found`;
      statusBarItem.show();
    }

    // Start MCP server with progress indicator
    if (workspaceFolders) {
      await startMcpServerWithProgress(context, workspaceFolders[0].uri.fsPath);
      outputChannel.info("MCP server started");
    }
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("grove.showStatusBar")) {
        const newConfig = getConfig();
        if (newConfig.showStatusBar && currentStatus?.hasProject) {
          statusBarItem.show();
        } else {
          statusBarItem.hide();
        }
      }
    }),
  );

  // Initialize diagnostics collection
  initDiagnostics(context);

  // Refresh diagnostics for all detected projects
  if (workspaceFolders && status.projects.length > 0) {
    await refreshAllDiagnostics(
      status.projects,
      workspaceFolders[0].uri.fsPath,
    );
  }

  // Initialize language status item
  initLanguageStatus(context);

  // Register language status handlers (updates on editor change)
  registerLanguageStatusHandlers(context, getDetectedProjects);

  // Update language status for current editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(status.projects, activeEditor.document.uri.fsPath);
  }

  // Register commands
  registerCopyConfigCommand(context);
  registerSymlinkCommand(context);

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

      const testOutputChannel =
        vscode.window.createOutputChannel("Grove Tests");

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
            testOutputChannel.clear();
            testOutputChannel.appendLine(`=== Grove Test Results ===`);
            testOutputChannel.appendLine(`Duration: ${result.duration}ms`);
            testOutputChannel.appendLine(`Success: ${result.success}`);
            testOutputChannel.appendLine(``);
            testOutputChannel.appendLine(result.output);
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
              testOutputChannel.show();
            }
          }
        },
      );
    }),
  );

  outputChannel.info(
    `Grove activated. Found ${status.projects.length} project(s).`,
  );

  // Return API for language extensions
  return getApi();
}

export function deactivate() {
  stopMcpServer();
}
