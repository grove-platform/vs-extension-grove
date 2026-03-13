import * as vscode from "vscode";
import type { GroveStatus, GroveProject } from "@grove/shared";
import { GrovePanelProvider } from "./panel/GrovePanel";
import { getApi as getTestRunnerApi } from "./test-runner-api";
import {
  resolveProject,
  executeTests,
  displayTestResults,
} from "./test-execution";
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
import { registerSnippetCodeLens } from "./snippet-codelens";
import { initLogger, getLogChannel } from "./logger";
import {
  initProjectCache,
  getCachedProjects,
  invalidate as invalidateProjectCache,
} from "./project-cache";
import {
  initProfiler,
  isProfilingEnabled,
  formatReport,
  clearStats,
} from "@grove/shared";

let currentStatus: GroveStatus | null = null;
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

  const projects = await getCachedProjects();

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
  _workspacePath: string,
): Promise<GroveProject[]> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Grove: Detecting projects...",
    },
    async (progress) => {
      progress.report({ increment: 0 });
      const projects = await getCachedProjects();
      progress.report({ increment: 100 });
      return projects;
    },
  );
}

export async function activate(context: vscode.ExtensionContext) {
  // Initialize centralized logger
  initLogger(context);
  const outputChannel = getLogChannel();
  outputChannel.info("Grove extension activating...");

  // Initialize performance profiler (only active in development mode)
  initProfiler(context, outputChannel);

  // Initialize project cache with file-system watcher
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    initProjectCache(context, workspaceRoot);
  }

  const config = getConfig();

  // Register Grove Panel
  const panelProvider = new GrovePanelProvider(context.extensionUri, getStatus);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GrovePanelProvider.viewType,
      panelProvider,
    ),
  );

  // Register refresh command (invalidates cache for fresh detection)
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.refreshPanel", () => {
      invalidateProjectCache();
      panelProvider.refresh();
    }),
  );

  // Detect Grove projects and update status (with progress indicator if auto-detect enabled)
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

  // Initialize diagnostics collection
  initDiagnostics(context);

  // Refresh diagnostics asynchronously — don't block activation
  if (workspaceFolders && status.projects.length > 0) {
    refreshAllDiagnostics(
      status.projects,
      workspaceFolders[0].uri.fsPath,
    ).catch((err) => {
      outputChannel.error("Failed to refresh diagnostics on startup", err);
    });
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

  // Register cleanup for MongoDB connection on deactivation
  context.subscriptions.push({
    dispose: () => {
      mongoConnectionManager.disconnect().catch(() => {
        // Ignore disconnect errors during cleanup
      });
    },
  });

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

  // Register snippet CodeLens providers for Bluehawk snippets
  registerSnippetCodeLens(context);
  outputChannel.info("Registered snippet CodeLens providers");

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
      const resolved = await resolveProject();
      if (!resolved) return;

      const projectPath = resolved.project.rootPath;

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

      // Build progress title with indicator if using UI connection
      const progressTitle = usingUiConnection
        ? "Running tests (using Grove MongoDB connection)..."
        : "Running tests...";

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: progressTitle,
          cancellable: false,
        },
        async () => {
          const outcome = await executeTests(projectPath, { env });
          if (!outcome) return;

          // Sanitize output to mask connection string if it appears
          let sanitizedOutput = outcome.result.output ?? "";
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

          const extraLines = usingUiConnection
            ? ["MongoDB: Using Grove extension connection"]
            : undefined;

          displayTestResults(
            sanitizedOutput,
            outcome.result,
            outcome.runner.name,
            extraLines,
          );
        },
      );
    }),
  );

  // Register profiler commands (only functional in development mode)
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.showPerformanceReport", () => {
      if (!isProfilingEnabled()) {
        vscode.window.showInformationMessage(
          "Performance profiling is only available in development mode.",
        );
        return;
      }
      const report = formatReport();
      outputChannel.info("\n" + report);
      outputChannel.show();
      vscode.window.showInformationMessage(
        "Performance report logged to Grove output channel.",
      );
    }),
    vscode.commands.registerCommand("grove.clearPerformanceStats", () => {
      if (!isProfilingEnabled()) {
        vscode.window.showInformationMessage(
          "Performance profiling is only available in development mode.",
        );
        return;
      }
      clearStats();
      vscode.window.showInformationMessage("Performance statistics cleared.");
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
