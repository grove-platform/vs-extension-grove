import * as vscode from "vscode";
import type { GroveStatus, GroveProject } from "@grove/shared";
import { GrovePanelProvider } from "./panel/GrovePanel";
import { ProfilerPanel } from "./panel/ProfilerPanel";
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
  profile,
  mark,
  measure,
  exportReport,
  importReport,
  compareReports,
  formatComparison,
  type ProfileReport,
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

// ============================================================================
// Profiler Report Helpers
// ============================================================================

const PROFILER_REPORTS_DIR = "profiler-reports";

/**
 * Get the profiler reports directory in the extension's storage.
 * Reports are saved in the extension directory, not the user's workspace.
 */
function getReportsDir(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.extensionUri, PROFILER_REPORTS_DIR);
}

/**
 * Get git information for the current workspace.
 */
async function getGitInfo(): Promise<{
  commit?: string;
  branch?: string;
}> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return {};

    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (!gitExt) return {};

    const git = gitExt.exports.getAPI(1);
    const repo = git.repositories[0];
    if (!repo) return {};

    return {
      commit: repo.state.HEAD?.commit?.slice(0, 8),
      branch: repo.state.HEAD?.name,
    };
  } catch {
    return {};
  }
}

/**
 * Save the current profiling data to a report file.
 */
async function savePerformanceReport(
  context: vscode.ExtensionContext,
  outputChannel: vscode.LogOutputChannel,
): Promise<void> {
  const reportsDir = getReportsDir(context);

  // Ask for an optional label
  const label = await vscode.window.showInputBox({
    prompt: "Enter a label for this report (optional)",
    placeHolder: "e.g., before-optimization, baseline",
  });

  // Get git info
  const gitInfo = await getGitInfo();

  // Export the report
  const report = exportReport({
    label: label || undefined,
    gitCommit: gitInfo.commit,
    gitBranch: gitInfo.branch,
    extensionVersion: context.extension.packageJSON.version,
    workspaceFolderCount: vscode.workspace.workspaceFolders?.length ?? 0,
  });

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const labelPart = label ? `_${label.replace(/[^a-zA-Z0-9-]/g, "-")}` : "";
  const filename = `${timestamp}${labelPart}.json`;

  // Ensure directory exists and write file
  try {
    await vscode.workspace.fs.createDirectory(reportsDir);
    const fileUri = vscode.Uri.joinPath(reportsDir, filename);
    const content = JSON.stringify(report, null, 2);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));

    outputChannel.info(`Performance report saved: ${filename}`);
    vscode.window
      .showInformationMessage(
        `Performance report saved: ${filename}`,
        "Open File",
      )
      .then((action) => {
        if (action === "Open File") {
          vscode.window.showTextDocument(fileUri);
        }
      });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to save report: ${err}`);
  }
}

/**
 * Compare two saved profiling reports.
 */
async function comparePerformanceReports(
  context: vscode.ExtensionContext,
  outputChannel: vscode.LogOutputChannel,
): Promise<void> {
  const reportsDir = getReportsDir(context);

  // List available reports
  let files: [string, vscode.FileType][];
  try {
    files = await vscode.workspace.fs.readDirectory(reportsDir);
  } catch {
    vscode.window.showInformationMessage(
      "No saved reports found. Save a report first with 'Grove: Save Performance Report'.",
    );
    return;
  }

  const jsonFiles = files
    .filter(
      ([name, type]) => type === vscode.FileType.File && name.endsWith(".json"),
    )
    .map(([name]) => name)
    .sort()
    .reverse(); // Most recent first

  if (jsonFiles.length < 2) {
    vscode.window.showInformationMessage(
      "Need at least 2 saved reports to compare. Save more reports first.",
    );
    return;
  }

  // Select baseline report
  const baselineFile = await vscode.window.showQuickPick(jsonFiles, {
    placeHolder: "Select BASELINE report (older)",
  });
  if (!baselineFile) return;

  // Select current report (exclude baseline)
  const currentOptions = jsonFiles.filter((f) => f !== baselineFile);
  const currentFile = await vscode.window.showQuickPick(
    ["[Current Session]", ...currentOptions],
    { placeHolder: "Select CURRENT report (newer) or use current session" },
  );
  if (!currentFile) return;

  // Load reports
  let baseline: ProfileReport;
  let current: ProfileReport;

  try {
    const baselineUri = vscode.Uri.joinPath(reportsDir, baselineFile);
    const baselineData = await vscode.workspace.fs.readFile(baselineUri);
    const parsed = importReport(new TextDecoder().decode(baselineData));
    if (!parsed) throw new Error("Invalid baseline report format");
    baseline = parsed;
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load baseline report: ${err}`);
    return;
  }

  if (currentFile === "[Current Session]") {
    current = exportReport();
  } else {
    try {
      const currentUri = vscode.Uri.joinPath(reportsDir, currentFile);
      const currentData = await vscode.workspace.fs.readFile(currentUri);
      const parsed = importReport(new TextDecoder().decode(currentData));
      if (!parsed) throw new Error("Invalid current report format");
      current = parsed;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load current report: ${err}`);
      return;
    }
  }

  // Compare and display results
  const comparison = compareReports(baseline, current);
  const formattedReport = formatComparison(comparison);

  outputChannel.info("\n" + formattedReport);
  outputChannel.show();

  // Show summary notification
  const { summary } = comparison;
  if (summary.regressed > 0) {
    vscode.window.showWarningMessage(
      `⚠️ ${summary.regressed} operation(s) regressed, ${summary.improved} improved`,
    );
  } else if (summary.improved > 0) {
    vscode.window.showInformationMessage(
      `✅ ${summary.improved} operation(s) improved, no regressions`,
    );
  } else {
    vscode.window.showInformationMessage("No significant changes detected.");
  }
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
  mark("activation.start");

  // Initialize centralized logger
  initLogger(context);
  const outputChannel = getLogChannel();
  outputChannel.info("Grove extension activating...");

  // Initialize performance profiler (only active in development mode)
  initProfiler(context, outputChannel);
  mark("activation.profilerReady");

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
    const projects = await profile("activation.detectProjects", () =>
      detectProjectsWithProgress(workspaceFolders[0].uri.fsPath),
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
  mark("activation.projectsDetected");

  // Initialize diagnostics collection
  initDiagnostics(context);

  // Refresh diagnostics asynchronously — don't block activation
  if (workspaceFolders && status.projects.length > 0) {
    profile("activation.refreshDiagnostics", () =>
      refreshAllDiagnostics(status.projects, workspaceFolders[0].uri.fsPath),
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
  profile("activation.mongoReconnect", () =>
    mongoConnectionManager.reconnect(),
  ).then((connected) => {
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
  mark("activation.providersRegistered");

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
    vscode.commands.registerCommand("grove.savePerformanceReport", async () => {
      if (!isProfilingEnabled()) {
        vscode.window.showInformationMessage(
          "Performance profiling is only available in development mode.",
        );
        return;
      }
      await savePerformanceReport(context, outputChannel);
    }),
    vscode.commands.registerCommand(
      "grove.comparePerformanceReports",
      async () => {
        if (!isProfilingEnabled()) {
          vscode.window.showInformationMessage(
            "Performance profiling is only available in development mode.",
          );
          return;
        }
        await comparePerformanceReports(context, outputChannel);
      },
    ),
    vscode.commands.registerCommand("grove.openProfilerPanel", () => {
      ProfilerPanel.createOrShow(context.extensionUri);
    }),
  );

  // Record activation timing
  mark("activation.complete");
  measure("activation.total", "activation.start", "activation.complete");
  measure(
    "activation.initialization",
    "activation.start",
    "activation.profilerReady",
  );
  measure(
    "activation.projectDetection",
    "activation.profilerReady",
    "activation.projectsDetected",
  );
  measure(
    "activation.providerRegistration",
    "activation.projectsDetected",
    "activation.providersRegistered",
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
