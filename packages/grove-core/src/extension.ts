import * as vscode from "vscode";
import { detectGroveProjects, findProjectForFile } from "@grove/shared";
import type { GroveStatus, GroveProject } from "@grove/shared";
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
import { MongoConnectionManager } from "./mongo/connection";
import { registerMongoCommands } from "./mongo/commands";
import { maskConnectionString } from "./mongo/credentials";
import { registerLiteralIncludeProviders } from "./rst/LiteralIncludeProviders";
import { BluehawkPreviewProvider } from "./preview/BluehawkPreview";
import { containsBluehawkDirectives } from "./preview/bluehawk-runner";
import { registerTestCodeLens } from "./test-codelens";

let statusBarItem: vscode.StatusBarItem;
let currentStatus: GroveStatus | null = null;
let outputChannel: vscode.LogOutputChannel;
let mongoConnectionManager: MongoConnectionManager;

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

  // Get MongoDB connection status
  const mongoStatus = mongoConnectionManager?.status ?? {
    connected: false,
    clusterType: "unknown" as const,
  };
  const mongoConnection = {
    connected: mongoStatus.connected,
    clusterType: mongoStatus.clusterType,
  };

  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection,
    };
  }

  const projects = await detectGroveProjects(workspaceFolders[0].uri.fsPath);

  currentStatus = {
    hasProject: projects.length > 0,
    activeProject: projects[0] ?? null,
    projects,
    mongoConnection,
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
  registerSymlinkCommand(context);

  // Initialize MongoDB connection manager
  mongoConnectionManager = new MongoConnectionManager(context.secrets);

  // Register MongoDB commands with callback to refresh panel on connection changes
  registerMongoCommands(context, mongoConnectionManager, () => {
    panelProvider.refresh();
  });

  // Attempt to reconnect using stored credentials
  mongoConnectionManager.reconnect().then((connected) => {
    if (connected) {
      outputChannel.info("Reconnected to MongoDB using stored credentials");
      panelProvider.refresh();
    }
  });

  // Register literalinclude providers for RST files
  registerLiteralIncludeProviders(context);
  outputChannel.info("Registered literalinclude providers for RST files");

  // Register test CodeLens providers for test files
  registerTestCodeLens(context);
  outputChannel.info("Registered test CodeLens providers");

  // Register Bluehawk preview provider
  const bluehawkPreviewProvider = new BluehawkPreviewProvider(
    context.extensionUri,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BluehawkPreviewProvider.viewType,
      bluehawkPreviewProvider,
    ),
  );

  // Register Bluehawk preview commands
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.openBluehawkPreview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }
      await bluehawkPreviewProvider.updatePreview(editor.document);
      // Focus the Bluehawk preview panel
      await vscode.commands.executeCommand("grove.bluehawkPreview.focus");
    }),
    vscode.commands.registerCommand(
      "grove.refreshBluehawkPreview",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await bluehawkPreviewProvider.updatePreview(editor.document);
        }
      },
    ),
  );

  // Update Bluehawk preview on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (containsBluehawkDirectives(document.getText())) {
        await bluehawkPreviewProvider.updatePreview(document);
      }
    }),
  );

  // Update Bluehawk preview when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && containsBluehawkDirectives(editor.document.getText())) {
        bluehawkPreviewProvider.debouncedUpdate(editor.document);
      }
    }),
  );
  outputChannel.info("Registered Bluehawk preview provider");

  // Register run tests command (delegates to language-specific runner)
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.runTests", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Detect all Grove projects in the workspace
      const projects = await detectGroveProjects(workspaceRoot);

      if (projects.length === 0) {
        vscode.window.showErrorMessage(
          "No Grove project detected. Create a snip.js file to define a Grove project.",
        );
        return;
      }

      // Determine project path from active file
      let projectPath: string | undefined;
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

      if (activeFile) {
        const project = findProjectForFile(activeFile, projects);
        if (project) {
          projectPath = project.rootPath;
        }
      }

      // If no project found for active file, show error with guidance
      if (!projectPath) {
        const projectList = projects
          .map((p) => p.relativePath || "root")
          .join(", ");
        vscode.window.showErrorMessage(
          `Cannot determine which Grove project to test. Open a file within a Grove project and try again. Detected projects: ${projectList}`,
        );
        return;
      }

      const runner = await findTestRunnerForProject(projectPath);

      if (!runner) {
        vscode.window.showWarningMessage(
          "No test runner found. Install a Grove language extension (e.g., Grove for Node.js).",
        );
        return;
      }

      // Check if we have a MongoDB connection to inject
      let env: Record<string, string> | undefined;
      let connectionString: string | null = null;
      const usingUiConnection = mongoConnectionManager?.status.connected;

      if (usingUiConnection) {
        connectionString = mongoConnectionManager.getConnectionStringForTests();
        if (connectionString) {
          env = { CONNECTION_STRING: connectionString };
        }
      }

      const testOutputChannel =
        vscode.window.createOutputChannel("Grove Tests");

      // Build progress title with indicator if using UI connection
      const progressTitle = usingUiConnection
        ? `Running ${runner.name} tests (using Grove MongoDB connection)...`
        : `Running ${runner.name} tests...`;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: progressTitle,
          cancellable: false,
        },
        async () => {
          const result = await runTests({ projectPath, env });

          // Sanitize output to mask connection string if it appears
          let sanitizedOutput = result.output ?? "";
          if (connectionString && sanitizedOutput.includes(connectionString)) {
            const masked = maskConnectionString(connectionString);
            sanitizedOutput = sanitizedOutput.replaceAll(
              connectionString,
              masked,
            );
            outputChannel.warn(
              "Connection string was detected in test output and has been masked.",
            );
          }

          // Always log output to channel
          if (sanitizedOutput) {
            testOutputChannel.clear();
            testOutputChannel.appendLine(`=== Grove Test Results ===`);
            testOutputChannel.appendLine(`Duration: ${result.duration}ms`);
            testOutputChannel.appendLine(`Success: ${result.success}`);
            if (usingUiConnection) {
              testOutputChannel.appendLine(
                `MongoDB: Using Grove extension connection`,
              );
            }
            testOutputChannel.appendLine(``);
            testOutputChannel.appendLine(sanitizedOutput);
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
  // Extension cleanup (if needed in the future)
}
