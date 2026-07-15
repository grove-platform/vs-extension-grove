import * as vscode from "vscode";
import type { GroveStatus, GroveProject } from "@grove/shared";
import { findProjectForFile } from "@grove/shared";
import { GrovePanelProvider } from "./panel/GrovePanel";
import { getApi as getTestRunnerApi } from "./test-runner-api";
import {
  initTestExecution,
  runGroveTests,
} from "./test-execution";
import { initDiagnostics, refreshAllDiagnostics } from "./diagnostics";
import { registerEnvBannerCodeLens } from "./env-banner-codelens";
import { registerTestBannerCodeLens } from "./test-banner-codelens";
import {
  initLanguageStatus,
  registerLanguageStatusHandlers,
  updateLanguageStatus,
} from "./language-status";
import { registerSymlinkCommand } from "./symlink";
import { MongoConnectionManager } from "./mongo/connection";
import { registerMongoCommands } from "./mongo/commands";
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

async function registerTestCodeLensLazy(context: vscode.ExtensionContext): Promise<void> {
  const { registerTestCodeLens } = await import("./test-codelens");
  registerTestCodeLens(context);
}

async function registerSnippetCodeLensLazy(context: vscode.ExtensionContext): Promise<void> {
  const { registerSnippetCodeLens } = await import("./snippet-codelens");
  registerSnippetCodeLens(context);
}

async function registerRstProvidersLazy(context: vscode.ExtensionContext): Promise<void> {
  const { registerLiteralIncludeProviders } = await import("./rst/LiteralIncludeProviders");
  const { clearExtractCache } = await import("./rst/extract-resolver");

  registerLiteralIncludeProviders(context);

  const extractsWatcher = vscode.workspace.createFileSystemWatcher("**/extracts*.yaml");
  extractsWatcher.onDidChange(() => clearExtractCache());
  extractsWatcher.onDidCreate(() => clearExtractCache());
  extractsWatcher.onDidDelete(() => clearExtractCache());
  context.subscriptions.push(extractsWatcher);
}

let currentStatus: GroveStatus | null = null;
let mongoConnectionManager: MongoConnectionManager;
/** Tracks whether the current connection was auto-established from a .env file */
let autoConnectedFromEnv = false;
/** Tracks whether the user explicitly disconnected — suppresses .env auto-reconnect */
let userDisconnected = false;

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
    // Shared test execution (.env, UI connection, Grove Tests output)
    runGroveTests,
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

  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection: {
        connected: mongoStatus.connected,
        clusterType: mongoStatus.clusterType,
        source: "none" as const,
      },
    };
  }

  const projects = await getCachedProjects();

  // Determine active project based on the currently open editor
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  const activeProject = (activeFile
    ? findProjectForFile(activeFile, projects)
    : projects[0]) ?? null;

  // Determine connection source and host for display.
  let source: "ui" | "env-file" | "connection-failed" | "none" = "none";
  let host: string | undefined;

  if (mongoStatus.connected) {
    // Already connected — determine whether it came from UI or .env auto-connect
    source = autoConnectedFromEnv ? "env-file" : "ui";
    const cs = mongoConnectionManager.getConnectionStringForTests();
    if (cs) {
      const { extractHost } = await import("./env-file");
      host = extractHost(cs);
    }
  } else if (activeProject && !userDisconnected) {
    // Not connected — check if the active project has a .env with CONNECTION_STRING
    // and auto-connect from it (unless user explicitly disconnected)
    const { loadEnvFile, extractHost } = await import("./env-file");
    const envVars = await loadEnvFile(activeProject.rootPath);
    if (envVars?.CONNECTION_STRING) {
      try {
        await mongoConnectionManager.connect(envVars.CONNECTION_STRING);
        source = "env-file";
        host = extractHost(envVars.CONNECTION_STRING);
        autoConnectedFromEnv = true;
      } catch {
        source = "connection-failed";
        host = extractHost(envVars.CONNECTION_STRING);
      }
    }
  }

  // Re-read status in case we auto-connected above
  const finalStatus = mongoConnectionManager?.status ?? mongoStatus;
  const mongoConnection = {
    connected: finalStatus.connected,
    clusterType: finalStatus.clusterType,
    source,
    host,
  };

  currentStatus = {
    hasProject: projects.length > 0,
    activeProject,
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
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const activeProject = (activeFile
      ? findProjectForFile(activeFile, projects)
      : projects[0]) ?? null;
    currentStatus = {
      hasProject: projects.length > 0,
      activeProject,
      projects,
      mongoConnection: { connected: false, clusterType: "unknown", source: "none" as const },
    };
    status = currentStatus;
    outputChannel.info(`Detected ${projects.length} Grove project(s)`);
  } else {
    status = await getStatus();
  }
  mark("activation.projectsDetected");

  // Initialize diagnostics collection
  initDiagnostics(context);

  // Register the "No .env detected" banner CodeLens eagerly so it works
  // across all Grove languages (Python, Java, C#, Go, Mongosh, JS/TS) —
  // lazy-loading based on `/tests/` path patterns would miss Java's
  // `src/test/` layout and Go's inline `_test.go` convention.
  registerEnvBannerCodeLens(context);

  // Register the "No test found" banner CodeLens eagerly — fires on source
  // files under examples/ that do not have a matching test file.
  // Like the env banner, it spans all Grove languages.
  registerTestBannerCodeLens(context);

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

  // Refresh panel when active editor changes (so MongoDB section reflects the active project)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      panelProvider.refresh();
    }),
  );

  // Update language status for current editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(status.projects, activeEditor.document.uri.fsPath);
  }

  // Register commands
  registerSymlinkCommand(context);

  // Initialize MongoDB connection manager
  mongoConnectionManager = new MongoConnectionManager(context.secrets);
  initTestExecution({
    getUiConnectionString: () =>
      mongoConnectionManager?.status.connected
        ? mongoConnectionManager.getConnectionStringForTests() ?? undefined
        : undefined,
  });

  // Register cleanup for MongoDB connection on deactivation
  context.subscriptions.push({
    dispose: () => {
      mongoConnectionManager.disconnect().catch(() => {
        // Ignore disconnect errors during cleanup
      });
    },
  });

  // Register MongoDB commands with callback to refresh panel on connection changes
  registerMongoCommands(context, mongoConnectionManager, (event?: "connect" | "disconnect") => {
    autoConnectedFromEnv = false;
    if (event === "disconnect") {
      userDisconnected = true;
    } else if (event === "connect") {
      userDisconnected = false;
    }
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

  // Lazily register RST providers — defer module load until first .rst/.txt file is opened
  {
    const rstLanguages = new Set(["restructuredtext", "plaintext"]);
    const rstExtensions = [".rst", ".txt"];

    const isRstDocument = (doc: vscode.TextDocument) =>
      rstLanguages.has(doc.languageId) ||
      rstExtensions.some((ext) => doc.uri.fsPath.endsWith(ext));

    const alreadyOpen = vscode.workspace.textDocuments.some(isRstDocument);

    if (alreadyOpen) {
      registerRstProvidersLazy(context).then(() => {
        outputChannel.info("Registered RST providers (file already open)");
      });
    } else {
      const disposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        if (isRstDocument(doc)) {
          disposable.dispose();
          registerRstProvidersLazy(context).then(() => {
            outputChannel.info("Registered RST providers (lazy, on first open)");
          });
        }
      });
      context.subscriptions.push(disposable);
    }
  }

  // Lazy test CodeLens — defer until first test/source file is opened
  {
    const testFilePatterns = [".test.js", ".test.ts", ".spec.js", ".spec.ts", ".test.mjs", ".spec.mjs"];
    const testDirPatterns = ["/tests/", "/tests_package/", "\\tests\\", "\\tests_package\\"];

    const isTestDocument = (doc: vscode.TextDocument) => {
      const p = doc.uri.fsPath;
      return (
        testFilePatterns.some((ext) => p.endsWith(ext)) ||
        testDirPatterns.some((dir) => p.includes(dir))
      );
    };

    const alreadyOpenTest = vscode.workspace.textDocuments.some(isTestDocument);
    if (alreadyOpenTest) {
      registerTestCodeLensLazy(context).then(() => {
        outputChannel.info("Registered test CodeLens providers (file already open)");
      });
    } else {
      const disposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        if (isTestDocument(doc)) {
          disposable.dispose();
          registerTestCodeLensLazy(context).then(() => {
            outputChannel.info("Registered test CodeLens providers (lazy)");
          });
        }
      });
      context.subscriptions.push(disposable);
    }
  }

  // Lazy snippet CodeLens — defer until first source code file is opened
  {
    const snippetSourceExtensions = [".js", ".ts", ".mjs", ".cjs", ".py", ".go", ".java", ".cs", ".sh"];

    const isSnippetSourceDocument = (doc: vscode.TextDocument) => {
      const p = doc.uri.fsPath;
      return snippetSourceExtensions.some((ext) => p.endsWith(ext));
    };

    const alreadyOpenSnippet = vscode.workspace.textDocuments.some(isSnippetSourceDocument);
    if (alreadyOpenSnippet) {
      registerSnippetCodeLensLazy(context).then(() => {
        outputChannel.info("Registered snippet CodeLens providers (file already open)");
      });
    } else {
      const disposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        if (isSnippetSourceDocument(doc)) {
          disposable.dispose();
          registerSnippetCodeLensLazy(context).then(() => {
            outputChannel.info("Registered snippet CodeLens providers (lazy)");
          });
        }
      });
      context.subscriptions.push(disposable);
    }
  }
  // mark represents "provider registration initiated" — lazy registrations may still be pending
  mark("activation.providersRegistered");

  // Lazy Bluehawk preview — defers module load until first use
  let _bluehawkProvider: import("./preview/BluehawkPreview").BluehawkPreviewProvider | undefined;

  async function getBluehawkProvider(): Promise<import("./preview/BluehawkPreview").BluehawkPreviewProvider> {
    if (!_bluehawkProvider) {
      const { BluehawkPreviewProvider } = await import("./preview/BluehawkPreview");
      _bluehawkProvider = new BluehawkPreviewProvider(context.extensionUri);
    }
    return _bluehawkProvider;
  }

  const lazyBluehawkProxy: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView, ctx, token) {
      getBluehawkProvider().then((provider) => {
        provider.resolveWebviewView(webviewView, ctx, token);
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "grove.bluehawkPreview",
      lazyBluehawkProxy,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("grove.openBluehawkPreview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }
      const provider = await getBluehawkProvider();
      await provider.updatePreview(editor.document);
      await vscode.commands.executeCommand("grove.bluehawkPreview.focus");
    }),
    vscode.commands.registerCommand("grove.refreshBluehawkPreview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const provider = await getBluehawkProvider();
        await provider.updatePreview(editor.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const { containsBluehawkDirectives } = await import("./preview/bluehawk-runner");
      if (containsBluehawkDirectives(document.getText())) {
        const provider = await getBluehawkProvider();
        await provider.updatePreview(document);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;
      const { containsBluehawkDirectives } = await import("./preview/bluehawk-runner");
      if (containsBluehawkDirectives(editor.document.getText())) {
        const provider = await getBluehawkProvider();
        provider.debouncedUpdate(editor.document);
      }
    }),
  );
  outputChannel.info("Registered Bluehawk preview provider (lazy)");

  // Register run tests command (delegates to language-specific runner)
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.runTests", () => runGroveTests()),

    vscode.commands.registerCommand("grove.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }

      await runGroveTests({
        activeFilePath: editor.document.uri.fsPath,
        documentScheme: editor.document.uri.scheme,
        testFileScope: true,
      });
    }),
  );

  // Register feedback command
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.sendFeedback", async () => {
      const { FeedbackPanel } = await import("./feedback/FeedbackPanel");
      FeedbackPanel.createOrShow(context.extensionUri);
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
    vscode.commands.registerCommand("grove.openProfilerPanel", async () => {
      const { ProfilerPanel } = await import("./panel/ProfilerPanel");
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
