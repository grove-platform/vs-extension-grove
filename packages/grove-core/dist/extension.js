"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../shared/dist/types.js
var require_types = __commonJS({
  "../shared/dist/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../shared/dist/project-detection.js
var require_project_detection = __commonJS({
  "../shared/dist/project-detection.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.detectGroveProjects = detectGroveProjects2;
    exports2.detectLanguage = detectLanguage2;
    exports2.validateSnipConfig = validateSnipConfig;
    exports2.findProjectForFile = findProjectForFile3;
    var path7 = __importStar(require("path"));
    var fs6 = __importStar(require("fs/promises"));
    async function detectGroveProjects2(workspacePath) {
      const projects = [];
      const snipFiles = await findSnipFiles(workspacePath);
      for (const snipPath of snipFiles) {
        const projectRoot = path7.dirname(snipPath);
        const relativePath = path7.relative(workspacePath, projectRoot) || ".";
        const language = await detectLanguage2(projectRoot);
        const hasValidConfig = await validateSnipConfig(snipPath);
        projects.push({
          rootPath: projectRoot,
          relativePath,
          language,
          hasValidConfig
        });
      }
      return projects;
    }
    async function findSnipFiles(dir, maxDepth = 5) {
      const results = [];
      if (maxDepth <= 0) {
        return results;
      }
      try {
        const entries = await fs6.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path7.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) {
              continue;
            }
            const subResults = await findSnipFiles(fullPath, maxDepth - 1);
            results.push(...subResults);
          } else if (entry.name === "snip.js") {
            results.push(fullPath);
          }
        }
      } catch (error) {
      }
      return results;
    }
    async function detectLanguage2(projectPath) {
      try {
        const pkgPath = path7.join(projectPath, "package.json");
        const content = await fs6.readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.devDependencies?.jest || pkg.dependencies?.jest || pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
          return "nodejs";
        }
        if (pkg.name?.includes("mongosh")) {
          return "mongosh";
        }
      } catch {
      }
      try {
        await fs6.access(path7.join(projectPath, "pyproject.toml"));
        return "python";
      } catch {
        try {
          await fs6.access(path7.join(projectPath, "pytest.ini"));
          return "python";
        } catch {
        }
      }
      try {
        await fs6.access(path7.join(projectPath, "go.mod"));
        return "go";
      } catch {
      }
      try {
        await fs6.access(path7.join(projectPath, "pom.xml"));
        return "java";
      } catch {
        try {
          await fs6.access(path7.join(projectPath, "build.gradle"));
          return "java";
        } catch {
        }
      }
      try {
        const entries = await fs6.readdir(projectPath);
        if (entries.some((e) => e.endsWith(".csproj"))) {
          return "csharp";
        }
      } catch {
      }
      return null;
    }
    async function validateSnipConfig(snipPath) {
      try {
        const content = await fs6.readFile(snipPath, "utf-8");
        return content.includes("module.exports") || content.includes("export default");
      } catch {
        return false;
      }
    }
    function findProjectForFile3(filePath, projects) {
      const normalizedFile = path7.resolve(filePath);
      const matchingProjects = projects.filter((project) => {
        const normalizedRoot = path7.resolve(project.rootPath);
        return normalizedFile.startsWith(normalizedRoot + path7.sep);
      });
      if (matchingProjects.length === 0) {
        return void 0;
      }
      return matchingProjects.reduce((best, current) => current.rootPath.length > best.rootPath.length ? current : best);
    }
  }
});

// ../shared/dist/security.js
var require_security = __commonJS({
  "../shared/dist/security.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isPathWithinBoundary = isPathWithinBoundary;
    exports2.sanitizePath = sanitizePath;
    exports2.validateWorkspacePath = validateWorkspacePath2;
    var path7 = __importStar(require("path"));
    function isPathWithinBoundary(resolvedPath, basePath) {
      const normalizedResolved = path7.normalize(resolvedPath);
      const normalizedBase = path7.normalize(basePath);
      return normalizedResolved.startsWith(normalizedBase + path7.sep) || normalizedResolved === normalizedBase;
    }
    function sanitizePath(relativePath) {
      let sanitized = relativePath.replace(/\0/g, "");
      sanitized = sanitized.replace(/\\/g, "/");
      sanitized = sanitized.replace(/^\/+/, "");
      return sanitized;
    }
    function validateWorkspacePath2(filePath, workspacePath) {
      const resolvedPath = path7.resolve(filePath);
      return isPathWithinBoundary(resolvedPath, workspacePath);
    }
  }
});

// ../shared/dist/index.js
var require_dist = __commonJS({
  "../shared/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_types(), exports2);
    __exportStar(require_project_detection(), exports2);
    __exportStar(require_security(), exports2);
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate,
  getActiveProject: () => getActiveProject,
  getApi: () => getApi2,
  getDetectedProjects: () => getDetectedProjects
});
module.exports = __toCommonJS(extension_exports);
var vscode9 = __toESM(require("vscode"));
var import_shared3 = __toESM(require_dist());

// src/panel/GrovePanel.ts
var vscode = __toESM(require("vscode"));
var GrovePanelProvider = class {
  constructor(_extensionUri, _getStatus) {
    this._extensionUri = _extensionUri;
    this._getStatus = _getStatus;
  }
  static viewType = "grove.panel";
  _view;
  _status = null;
  async resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtml();
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "refresh":
          await this.refresh();
          break;
        case "copyMcpConfig":
          vscode.commands.executeCommand("grove.copyMcpConfig");
          break;
        case "runTests":
          vscode.commands.executeCommand("grove.runTests");
          break;
        case "connectMongo":
          vscode.commands.executeCommand("grove.connectMongo");
          break;
        case "disconnectMongo":
          vscode.commands.executeCommand("grove.disconnectMongo");
          break;
        case "showDatabases":
          vscode.commands.executeCommand("grove.showDatabases");
          break;
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });
    await this.refresh();
  }
  async refresh() {
    if (!this._view) return;
    this._status = await this._getStatus();
    this._view.webview.postMessage({
      command: "updateStatus",
      status: this._status
    });
  }
  _getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Grove</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .section { margin-bottom: 16px; }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-textLink-foreground);
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }
    .status-icon { width: 16px; text-align: center; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .setup-wizard {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      padding: 12px;
      margin-bottom: 16px;
    }
    .setup-wizard h3 { margin: 0 0 8px 0; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div id="loading">Loading Grove status...</div>
  <div id="content" class="hidden"></div>
  <script>
    const vscode = acquireVsCodeApi();
    let currentStatus = null;

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateStatus') {
        currentStatus = message.status;
        render();
      }
    });

    function render() {
      const loading = document.getElementById('loading');
      const content = document.getElementById('content');
      if (!currentStatus) {
        loading.classList.remove('hidden');
        content.classList.add('hidden');
        return;
      }
      loading.classList.add('hidden');
      content.classList.remove('hidden');
      let html = '';
      if (!currentStatus.hasProject) {
        html += '<div class="setup-wizard"><h3>No Grove Project Detected</h3><p>Create a snip.js file to get started, or open a folder containing one.</p></div>';
      } else {
        html += '<div class="section"><div class="section-title">Projects</div>';
        html += currentStatus.projects.map(p =>
          '<div class="status-row"><span class="status-icon">' + (p.hasValidConfig ? '\u2713' : '!') + '</span><span>' + (p.relativePath || 'Root') + '</span><span>(' + (p.language || 'unknown') + ')</span></div>'
        ).join('');
        html += '</div>';
        // MongoDB section with connection status and actions
        html += '<div class="section"><div class="section-title">MongoDB</div>';
        const mongoConnected = currentStatus.mongoConnection.connected;
        const clusterType = currentStatus.mongoConnection.clusterType;
        html += '<div class="status-row"><span class="status-icon">' + (mongoConnected ? '\u2713' : '\u25CB') + '</span>';
        html += '<span>' + (mongoConnected ? 'Connected (' + clusterType + ')' : 'Not connected') + '</span></div>';
        html += '<div class="actions" style="margin-top: 8px;">';
        if (mongoConnected) {
          html += '<button onclick="showDatabases()">Show Databases</button>';
          html += '<button onclick="disconnectMongo()">Disconnect</button>';
        } else {
          html += '<button onclick="connectMongo()" style="grid-column: span 2;">Connect to MongoDB</button>';
        }
        html += '</div></div>';
        // Actions section
        html += '<div class="section"><div class="section-title">Actions</div><div class="actions"><button onclick="runTests()">Run Tests</button><button onclick="refresh()">Refresh</button></div></div>';
      }
      html += '<div class="section"><div class="section-title">AI Integration</div><button onclick="copyMcpConfig()" style="width: 100%;">Copy MCP Config for Augment</button></div>';
      content.innerHTML = html;
    }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function copyMcpConfig() { vscode.postMessage({ command: 'copyMcpConfig' }); }
    function runTests() { vscode.postMessage({ command: 'runTests' }); }
    function connectMongo() { vscode.postMessage({ command: 'connectMongo' }); }
    function disconnectMongo() { vscode.postMessage({ command: 'disconnectMongo' }); }
    function showDatabases() { vscode.postMessage({ command: 'showDatabases' }); }
    refresh();
  </script>
</body>
</html>`;
  }
};

// src/test-runner-api.ts
var registeredRunners = /* @__PURE__ */ new Map();
function registerTestRunner(runner) {
  registeredRunners.set(runner.language, runner);
  console.log(`Grove: Registered test runner "${runner.name}" for ${runner.language}`);
}
function getTestRunner(language) {
  return registeredRunners.get(language);
}
function listTestRunners() {
  return Array.from(registeredRunners.keys());
}
async function findTestRunnerForProject(projectPath) {
  for (const runner of registeredRunners.values()) {
    try {
      if (await runner.detect(projectPath)) {
        return runner;
      }
    } catch {
    }
  }
  return void 0;
}
async function runTests(options) {
  const { language, ...runOptions } = options;
  let runner;
  if (language) {
    runner = getTestRunner(language);
    if (!runner) {
      return {
        success: false,
        duration: 0,
        output: `No test runner registered for language: ${language}. Available: ${listTestRunners().join(", ") || "none"}`
      };
    }
  } else {
    runner = await findTestRunnerForProject(runOptions.projectPath);
    if (!runner) {
      return {
        success: false,
        duration: 0,
        output: `Could not detect test runner for project. Registered runners: ${listTestRunners().join(", ") || "none"}`
      };
    }
  }
  return runner.run(runOptions);
}
function getApi() {
  return {
    registerTestRunner,
    getTestRunner,
    listTestRunners,
    findTestRunnerForProject,
    runTests
  };
}

// src/diagnostics.ts
var vscode2 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs/promises"));
var diagnosticCollection;
function initDiagnostics(context) {
  diagnosticCollection = vscode2.languages.createDiagnosticCollection("grove");
  context.subscriptions.push(diagnosticCollection);
  return diagnosticCollection;
}
async function checkSymlinks(project, workspacePath) {
  const diagnostics = [];
  const symlinkPaths = [
    "source/code-examples/tested",
    "content/code-examples/tested"
  ];
  for (const symlinkRelPath of symlinkPaths) {
    const symlinkPath = path.join(workspacePath, symlinkRelPath);
    try {
      const stats = await fs.lstat(symlinkPath);
      if (stats.isSymbolicLink()) {
        try {
          await fs.access(symlinkPath);
        } catch {
          diagnostics.push(
            new vscode2.Diagnostic(
              new vscode2.Range(0, 0, 0, 0),
              `Broken symlink: ${symlinkRelPath} points to a non-existent target`,
              vscode2.DiagnosticSeverity.Error
            )
          );
        }
      }
    } catch {
      const isDocsProject = await looksLikeDocsProject(workspacePath);
      if (isDocsProject) {
        diagnostics.push(
          new vscode2.Diagnostic(
            new vscode2.Range(0, 0, 0, 0),
            `Missing symlink: ${symlinkRelPath}. Run "Grove: Create Symlink" to create it.`,
            vscode2.DiagnosticSeverity.Warning
          )
        );
      }
    }
  }
  return diagnostics;
}
async function looksLikeDocsProject(workspacePath) {
  const docIndicators = ["snooty.toml", "source/conf.py", "source/index.txt"];
  for (const indicator of docIndicators) {
    try {
      await fs.access(path.join(workspacePath, indicator));
      return true;
    } catch {
    }
  }
  return false;
}
async function refreshDiagnostics(project, workspacePath) {
  if (!diagnosticCollection) {
    return;
  }
  const snipUri = vscode2.Uri.file(path.join(project.rootPath, "snip.js"));
  diagnosticCollection.delete(snipUri);
  const symlinkDiagnostics = await checkSymlinks(project, workspacePath);
  if (symlinkDiagnostics.length > 0) {
    diagnosticCollection.set(snipUri, symlinkDiagnostics);
  }
}
async function refreshAllDiagnostics(projects, workspacePath) {
  diagnosticCollection?.clear();
  for (const project of projects) {
    await refreshDiagnostics(project, workspacePath);
  }
}

// src/language-status.ts
var vscode3 = __toESM(require("vscode"));
var import_shared = __toESM(require_dist());
var languageStatusItem;
function initLanguageStatus(context) {
  languageStatusItem = vscode3.languages.createLanguageStatusItem(
    "grove.status",
    { pattern: "**/*" }
    // Apply to all files
  );
  languageStatusItem.name = "Grove Project";
  languageStatusItem.text = "$(tree) Grove";
  languageStatusItem.detail = "No Grove project";
  languageStatusItem.severity = vscode3.LanguageStatusSeverity.Information;
  languageStatusItem.command = {
    title: "Open Grove Panel",
    command: "workbench.view.extension.grove"
  };
  context.subscriptions.push(languageStatusItem);
  return languageStatusItem;
}
function updateLanguageStatus(projects, activeFile) {
  if (!languageStatusItem) {
    return;
  }
  if (!activeFile || projects.length === 0) {
    languageStatusItem.text = "$(tree) Grove";
    languageStatusItem.detail = "No Grove project";
    languageStatusItem.severity = vscode3.LanguageStatusSeverity.Information;
    return;
  }
  const project = (0, import_shared.findProjectForFile)(activeFile, projects);
  if (project) {
    const langIcon = getLanguageIcon(project.language);
    const langName = project.language ?? "unknown";
    languageStatusItem.text = `${langIcon} ${project.relativePath || "root"}`;
    languageStatusItem.detail = `Grove project (${langName})`;
    languageStatusItem.severity = project.hasValidConfig ? vscode3.LanguageStatusSeverity.Information : vscode3.LanguageStatusSeverity.Warning;
  } else {
    languageStatusItem.text = "$(tree) Grove";
    languageStatusItem.detail = "Not in a Grove project";
    languageStatusItem.severity = vscode3.LanguageStatusSeverity.Information;
  }
}
function getLanguageIcon(language) {
  switch (language) {
    case "nodejs":
      return "$(symbol-method)";
    // JS-like icon
    case "python":
      return "$(symbol-namespace)";
    // Python-like icon
    case "go":
      return "$(symbol-interface)";
    // Go-like icon
    case "java":
      return "$(symbol-class)";
    // Java-like icon
    case "csharp":
      return "$(symbol-struct)";
    // C#-like icon
    case "mongosh":
      return "$(terminal)";
    // Shell icon
    default:
      return "$(tree)";
  }
}
function registerLanguageStatusHandlers(context, getProjects) {
  context.subscriptions.push(
    vscode3.window.onDidChangeActiveTextEditor((editor) => {
      updateLanguageStatus(
        getProjects(),
        editor?.document.uri.fsPath
      );
    })
  );
  const activeEditor = vscode3.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(getProjects(), activeEditor.document.uri.fsPath);
  }
}

// src/symlink.ts
var vscode4 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs/promises"));
var import_shared2 = __toESM(require_dist());
async function createSymlink(symlinkPath, targetPath, workspacePath) {
  if (!(0, import_shared2.validateWorkspacePath)(symlinkPath, workspacePath)) {
    throw new Error("Symlink path must be within the workspace");
  }
  if (!(0, import_shared2.validateWorkspacePath)(targetPath, workspacePath)) {
    throw new Error("Target path must be within the workspace");
  }
  try {
    await fs2.access(targetPath);
  } catch {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }
  const symlinkDir = path2.dirname(symlinkPath);
  await fs2.mkdir(symlinkDir, { recursive: true });
  const relativeTarget = path2.relative(symlinkDir, targetPath);
  await fs2.symlink(relativeTarget, symlinkPath);
}
function registerSymlinkCommand(context) {
  context.subscriptions.push(
    vscode4.commands.registerCommand("grove.createSymlink", async () => {
      const workspaceFolders = vscode4.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode4.window.showErrorMessage("No workspace folder open");
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const symlinkRelPath = await vscode4.window.showInputBox({
        title: "Grove: Create Symlink",
        prompt: "Enter the relative path for the symlink",
        value: "source/code-examples/tested",
        validateInput: (value) => {
          if (!value) return "Path is required";
          if (path2.isAbsolute(value)) return "Path must be relative";
          return void 0;
        }
      });
      if (!symlinkRelPath) {
        return;
      }
      const targetRelPath = await vscode4.window.showInputBox({
        title: "Grove: Create Symlink",
        prompt: "Enter the relative path to the target directory",
        value: "../code-example-tests/content/code-examples/tested",
        validateInput: (value) => {
          if (!value) return "Path is required";
          return void 0;
        }
      });
      if (!targetRelPath) {
        return;
      }
      const symlinkPath = path2.join(workspacePath, symlinkRelPath);
      const targetPath = path2.resolve(path2.dirname(symlinkPath), targetRelPath);
      try {
        await createSymlink(symlinkPath, targetPath, workspacePath);
        vscode4.window.showInformationMessage(
          `Created symlink: ${symlinkRelPath} \u2192 ${targetRelPath}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode4.window.showErrorMessage(`Failed to create symlink: ${message}`);
      }
    })
  );
}

// src/mongo/credentials.ts
var SECRET_KEY = "grove.mongoConnectionString";
async function storeConnectionString(secrets, connectionString) {
  await secrets.store(SECRET_KEY, connectionString);
}
async function getConnectionString(secrets) {
  return secrets.get(SECRET_KEY);
}
async function deleteConnectionString(secrets) {
  await secrets.delete(SECRET_KEY);
}
function validateConnectionString(connectionString) {
  if (!connectionString || connectionString.trim().length === 0) {
    return { valid: false, error: "Connection string cannot be empty" };
  }
  const trimmed = connectionString.trim();
  if (!trimmed.startsWith("mongodb://") && !trimmed.startsWith("mongodb+srv://")) {
    return {
      valid: false,
      error: "Connection string must start with mongodb:// or mongodb+srv://"
    };
  }
  try {
    const urlForParsing = trimmed.replace(/^mongodb(\+srv)?:\/\//, "https://");
    new URL(urlForParsing);
  } catch {
    return { valid: false, error: "Invalid connection string format" };
  }
  return { valid: true };
}
function maskConnectionString(connectionString) {
  try {
    return connectionString.replace(
      /(:\/\/[^:]+:)([^@]+)(@)/,
      "$1****$3"
    );
  } catch {
    return "mongodb://****";
  }
}

// src/mongo/connection.ts
var MongoConnectionManager = class {
  constructor(secrets) {
    this.secrets = secrets;
  }
  client = null;
  connectionString = null;
  _status = {
    connected: false,
    clusterType: "unknown"
  };
  /**
   * Get current connection status.
   */
  get status() {
    return { ...this._status };
  }
  /**
   * Connect to MongoDB using a connection string.
   * Stores the connection string securely if connection succeeds.
   */
  async connect(connectionString) {
    const validation = validateConnectionString(connectionString);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    if (this.client) {
      await this.disconnect();
    }
    try {
      const { MongoClient: MC } = await import("mongodb");
      this.client = new MC(connectionString, {
        serverSelectionTimeoutMS: 1e4,
        appName: "grove-vscode"
      });
      await this.client.connect();
      this.connectionString = connectionString;
      const clusterType = this.detectClusterType(connectionString);
      const host = this.extractHost(connectionString);
      this._status = {
        connected: true,
        clusterType,
        host
      };
      await storeConnectionString(this.secrets, connectionString);
    } catch (error) {
      this._status = {
        connected: false,
        clusterType: "unknown",
        error: error instanceof Error ? error.message : String(error)
      };
      throw error;
    }
  }
  /**
   * Disconnect from MongoDB and clear session.
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
      }
      this.client = null;
    }
    this.connectionString = null;
    this._status = {
      connected: false,
      clusterType: "unknown"
    };
  }
  /**
   * Disconnect and also clear stored credentials.
   */
  async disconnectAndClear() {
    await this.disconnect();
    await deleteConnectionString(this.secrets);
  }
  /**
   * Attempt to reconnect using stored credentials.
   */
  async reconnect() {
    const stored = await getConnectionString(this.secrets);
    if (!stored) {
      return false;
    }
    try {
      await this.connect(stored);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * List all databases on the connected MongoDB instance.
   */
  async listDatabases() {
    if (!this.client) {
      throw new Error("Not connected to MongoDB");
    }
    const admin = this.client.db().admin();
    const result = await admin.listDatabases();
    return result.databases.map((db) => db.name);
  }
  /**
   * Get sample databases (sample_* databases used in Grove tests).
   */
  async getSampleDatabases() {
    const databases = await this.listDatabases();
    const sampleDatabases = [];
    const sampleDbDescriptions = {
      sample_mflix: "Movie data with users, comments, and theaters",
      sample_airbnb: "Airbnb listings and reviews",
      sample_analytics: "Customer and account analytics",
      sample_geospatial: "Shipwreck data with geospatial indexes",
      sample_guides: "Planet data for guided examples",
      sample_restaurants: "NYC restaurant inspection data",
      sample_supplies: "Office supply sales data",
      sample_training: "Training data with various collections",
      sample_weatherdata: "Weather station measurements"
    };
    for (const name of databases) {
      if (name.startsWith("sample_")) {
        sampleDatabases.push({
          name,
          description: sampleDbDescriptions[name] ?? "Sample database"
        });
      }
    }
    return sampleDatabases;
  }
  /**
   * Get the masked connection string for display.
   */
  getMaskedConnectionString() {
    if (!this.connectionString) {
      return null;
    }
    return maskConnectionString(this.connectionString);
  }
  /**
   * Detect cluster type from connection string.
   */
  detectClusterType(connectionString) {
    if (connectionString.includes("mongodb+srv://")) {
      return "atlas";
    }
    if (connectionString.includes("localhost") || connectionString.includes("127.0.0.1")) {
      return "local";
    }
    return "unknown";
  }
  /**
   * Extract host from connection string for display.
   */
  extractHost(connectionString) {
    try {
      const match = connectionString.match(/@([^/]+)/);
      if (match) {
        return match[1];
      }
      const hostMatch = connectionString.match(/:\/\/([^/]+)/);
      if (hostMatch) {
        return hostMatch[1];
      }
    } catch {
    }
    return "unknown";
  }
};

// src/mongo/commands.ts
var vscode5 = __toESM(require("vscode"));
function registerMongoCommands(context, connectionManager, onConnectionChange) {
  context.subscriptions.push(
    vscode5.commands.registerCommand("grove.connectMongo", async () => {
      const connectionString = await vscode5.window.showInputBox({
        prompt: "Enter MongoDB connection string",
        placeHolder: "mongodb+srv://user:password@cluster.mongodb.net/database",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Connection string cannot be empty";
          }
          if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
            return "Connection string must start with mongodb:// or mongodb+srv://";
          }
          return null;
        }
      });
      if (!connectionString) {
        return;
      }
      try {
        await vscode5.window.withProgress(
          {
            location: vscode5.ProgressLocation.Notification,
            title: "Connecting to MongoDB...",
            cancellable: false
          },
          async () => {
            await connectionManager.connect(connectionString);
          }
        );
        vscode5.window.showInformationMessage(
          `Connected to MongoDB (${connectionManager.status.clusterType})`
        );
        onConnectionChange();
      } catch (error) {
        vscode5.window.showErrorMessage(
          `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("grove.disconnectMongo", async () => {
      if (!connectionManager.status.connected) {
        vscode5.window.showInformationMessage("Not connected to MongoDB");
        return;
      }
      const choice = await vscode5.window.showQuickPick(
        [
          {
            label: "Disconnect",
            description: "Disconnect but keep credentials for later"
          },
          {
            label: "Disconnect and Clear",
            description: "Disconnect and remove stored credentials"
          },
          { label: "Cancel", description: "Cancel" }
        ],
        { placeHolder: "Choose disconnect option" }
      );
      if (!choice || choice.label === "Cancel") {
        return;
      }
      if (choice.label === "Disconnect and Clear") {
        await connectionManager.disconnectAndClear();
      } else {
        await connectionManager.disconnect();
      }
      vscode5.window.showInformationMessage("Disconnected from MongoDB");
      onConnectionChange();
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("grove.showDatabases", async () => {
      if (!connectionManager.status.connected) {
        const connect = await vscode5.window.showInformationMessage(
          "Not connected to MongoDB. Connect now?",
          "Connect",
          "Cancel"
        );
        if (connect === "Connect") {
          await vscode5.commands.executeCommand("grove.connectMongo");
        }
        return;
      }
      try {
        const databases = await connectionManager.listDatabases();
        const sampleDbs = await connectionManager.getSampleDatabases();
        const items = databases.map((name) => {
          const sampleDb = sampleDbs.find((s) => s.name === name);
          return {
            label: name,
            description: sampleDb ? `$(database) ${sampleDb.description}` : ""
          };
        });
        const selected = await vscode5.window.showQuickPick(items, {
          placeHolder: `${databases.length} database(s) found`,
          title: "MongoDB Databases"
        });
        if (selected) {
          vscode5.window.showInformationMessage(
            `Selected database: ${selected.label}`
          );
        }
      } catch (error) {
        vscode5.window.showErrorMessage(
          `Failed to list databases: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

// src/rst/LiteralIncludeProviders.ts
var vscode7 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));

// src/rst/literalinclude-parser.ts
var vscode6 = __toESM(require("vscode"));
function parseLiteralIncludes(document) {
  const refs = [];
  const directivePattern = /^(\s*)\.\.\s+literalinclude::\s+(.+?)\s*$/;
  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    const match = line.text.match(directivePattern);
    if (!match) {
      continue;
    }
    const indent = match[1];
    const targetPath = match[2].trim();
    const pathStartChar = line.text.indexOf(targetPath);
    const pathStart = new vscode6.Position(lineNum, pathStartChar);
    const pathEnd = new vscode6.Position(
      lineNum,
      pathStartChar + targetPath.length
    );
    const ref = {
      range: new vscode6.Range(
        new vscode6.Position(lineNum, 0),
        new vscode6.Position(lineNum, line.text.length)
      ),
      pathRange: new vscode6.Range(pathStart, pathEnd),
      targetPath
    };
    const optionIndent = indent + "   ";
    let nextLineNum = lineNum + 1;
    while (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (!nextLine.startsWith(optionIndent) || !nextLine.includes(":")) {
        if (nextLine.trim() === "" || nextLine.startsWith(indent + "   ")) {
          nextLineNum++;
          continue;
        }
        break;
      }
      const optionMatch = nextLine.match(/^\s+:([a-z-]+):\s*(.*)$/);
      if (optionMatch) {
        const [, optionName, optionValue] = optionMatch;
        switch (optionName) {
          case "snippet":
            ref.snippetName = optionValue.trim();
            break;
          case "start-after":
            ref.startAfter = optionValue.trim();
            break;
          case "end-before":
            ref.endBefore = optionValue.trim();
            break;
          case "lines":
            ref.lines = optionValue.trim();
            break;
          case "language":
            ref.language = optionValue.trim();
            break;
          case "emphasize-lines":
            ref.emphasizeLines = optionValue.trim();
            break;
          case "dedent":
            const dedentVal = parseInt(optionValue.trim(), 10);
            if (!isNaN(dedentVal)) {
              ref.dedent = dedentVal;
            }
            break;
        }
      }
      nextLineNum++;
    }
    refs.push(ref);
  }
  return refs;
}
function findLiteralIncludeAtPosition(document, position) {
  const refs = parseLiteralIncludes(document);
  for (const ref of refs) {
    if (ref.range.contains(position) || ref.pathRange.contains(position)) {
      return ref;
    }
  }
  return void 0;
}

// src/rst/path-resolver.ts
var path3 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));
function findSourceDir(startPath) {
  let current = startPath;
  const root = path3.parse(current).root;
  while (current !== root) {
    const snootyPath = path3.join(current, "snooty.toml");
    if (fs3.existsSync(snootyPath)) {
      const sourceDir = path3.join(current, "source");
      if (fs3.existsSync(sourceDir)) {
        return sourceDir;
      }
      return current;
    }
    current = path3.dirname(current);
  }
  return void 0;
}
async function resolveLiteralIncludePath(rstFilePath, targetPath, workspaceRoot) {
  if (targetPath.startsWith("/")) {
    const sourceDir2 = findSourceDir(rstFilePath);
    if (sourceDir2) {
      const absolutePath = path3.join(sourceDir2, targetPath);
      return checkPathExists(absolutePath, workspaceRoot);
    }
    if (workspaceRoot) {
      const absolutePath = path3.join(workspaceRoot, targetPath);
      return checkPathExists(absolutePath, workspaceRoot);
    }
    return {
      absolutePath: targetPath,
      exists: false,
      error: "Cannot resolve absolute path without source directory"
    };
  }
  const rstDir = path3.dirname(rstFilePath);
  const relativePath = path3.resolve(rstDir, targetPath);
  if (fs3.existsSync(relativePath)) {
    return {
      absolutePath: relativePath,
      exists: true
    };
  }
  const symlinkResult = await resolveSymlinkPath(rstDir, targetPath);
  if (symlinkResult.exists) {
    return symlinkResult;
  }
  const sourceDir = findSourceDir(rstFilePath);
  if (sourceDir) {
    const sourcePath = path3.resolve(sourceDir, targetPath);
    if (fs3.existsSync(sourcePath)) {
      return {
        absolutePath: sourcePath,
        exists: true
      };
    }
  }
  return {
    absolutePath: relativePath,
    exists: false,
    error: `File not found: ${targetPath}`
  };
}
function checkPathExists(absolutePath, workspaceRoot) {
  if (workspaceRoot) {
    const normalizedPath = path3.normalize(absolutePath);
    const normalizedRoot = path3.normalize(workspaceRoot);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return {
        absolutePath,
        exists: false,
        error: "Path is outside workspace boundaries"
      };
    }
  }
  const exists = fs3.existsSync(absolutePath);
  return {
    absolutePath,
    exists,
    error: exists ? void 0 : `File not found: ${absolutePath}`
  };
}
async function resolveSymlinkPath(startDir, targetPath) {
  const parts = targetPath.split(path3.sep);
  let currentDir = startDir;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const possibleSymlink = path3.join(currentDir, part);
    try {
      const stats = await fs3.promises.lstat(possibleSymlink);
      if (stats.isSymbolicLink()) {
        const realPath = await fs3.promises.realpath(possibleSymlink);
        const remainingPath = parts.slice(i + 1).join(path3.sep);
        const fullPath = path3.join(realPath, remainingPath);
        if (fs3.existsSync(fullPath)) {
          return {
            absolutePath: fullPath,
            exists: true,
            symlinkPath: possibleSymlink
          };
        }
      }
      currentDir = possibleSymlink;
    } catch {
      break;
    }
  }
  return {
    absolutePath: path3.join(startDir, targetPath),
    exists: false
  };
}

// src/rst/LiteralIncludeProviders.ts
function getWorkspaceRoot(document) {
  const workspaceFolder = vscode7.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder?.uri.fsPath;
}
function resolveTestFilePath(resolvedSnippetPath, workspaceRoot) {
  if (!workspaceRoot) {
    return void 0;
  }
  const filename = path4.basename(resolvedSnippetPath);
  const snippetPattern = /^(.+)\.snippet\.([^.]+)(\.[^.]+)$/;
  const snippetMatch = filename.match(snippetPattern);
  if (!snippetMatch) {
    return void 0;
  }
  const snippetName = snippetMatch[2];
  const testedMatch = resolvedSnippetPath.match(
    /[/\\]code-examples[/\\]tested[/\\](.+)$/
  );
  if (!testedMatch) {
    return void 0;
  }
  const testedRelPath = testedMatch[1];
  const driverMatch = testedRelPath.match(/^([^/\\]+[/\\]driver)[/\\](.+)$/);
  if (!driverMatch) {
    return void 0;
  }
  const langDriver = driverMatch[1];
  const restOfPath = driverMatch[2];
  const dir = path4.dirname(restOfPath);
  const originalFilename = `${snippetMatch[1]}${snippetMatch[3]}`;
  const testFilePath = path4.join(
    workspaceRoot,
    "code-example-tests",
    langDriver,
    "examples",
    dir,
    originalFilename
  );
  return { testFilePath, snippetName };
}
var LiteralIncludeCodeLensProvider = class {
  _onDidChangeCodeLenses = new vscode7.EventEmitter();
  onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  async provideCodeLenses(document) {
    const refs = parseLiteralIncludes(document);
    const lenses = [];
    const workspaceRoot = getWorkspaceRoot(document);
    for (const ref of refs) {
      const resolved = await resolveLiteralIncludePath(
        document.uri.fsPath,
        ref.targetPath,
        workspaceRoot
      );
      const directiveLine = ref.range.start.line;
      console.log(
        `[Grove Debug] Lens for "${ref.targetPath}" at line ${directiveLine} (0-indexed), editor line ${directiveLine + 1}`
      );
      const lensRange = new vscode7.Range(
        new vscode7.Position(directiveLine, 0),
        new vscode7.Position(directiveLine, 0)
      );
      if (resolved.exists) {
        lenses.push(
          new vscode7.CodeLens(lensRange, {
            title: "\u{1F4C4} view",
            command: "grove.literalinclude.view",
            arguments: [resolved.absolutePath, ref.snippetName, ref.startAfter]
          })
        );
        const testFileResult = resolveTestFilePath(
          resolved.absolutePath,
          workspaceRoot
        );
        if (testFileResult && fs4.existsSync(testFileResult.testFilePath)) {
          lenses.push(
            new vscode7.CodeLens(lensRange, {
              title: `\u{1F9EA} test: ${testFileResult.snippetName}`,
              command: "grove.literalinclude.view",
              arguments: [testFileResult.testFilePath, ref.snippetName]
            })
          );
        }
      } else {
        lenses.push(
          new vscode7.CodeLens(lensRange, {
            title: `\u26A0\uFE0F ${resolved.error || "File not found"}`,
            command: ""
          })
        );
      }
    }
    return lenses;
  }
  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
};
var LiteralIncludeDefinitionProvider = class {
  async provideDefinition(document, position) {
    const ref = findLiteralIncludeAtPosition(document, position);
    if (!ref) {
      return void 0;
    }
    const workspaceRoot = getWorkspaceRoot(document);
    const resolved = await resolveLiteralIncludePath(
      document.uri.fsPath,
      ref.targetPath,
      workspaceRoot
    );
    if (!resolved.exists) {
      return void 0;
    }
    const targetUri = vscode7.Uri.file(resolved.absolutePath);
    if (ref.snippetName) {
      const lineNumber = await findSnippetLine(
        resolved.absolutePath,
        ref.snippetName
      );
      if (lineNumber !== void 0) {
        return new vscode7.Location(
          targetUri,
          new vscode7.Position(lineNumber, 0)
        );
      }
    }
    if (ref.startAfter) {
      const lineNumber = await findMarkerLine(
        resolved.absolutePath,
        ref.startAfter
      );
      if (lineNumber !== void 0) {
        return new vscode7.Location(
          targetUri,
          new vscode7.Position(lineNumber, 0)
        );
      }
    }
    return new vscode7.Location(targetUri, new vscode7.Position(0, 0));
  }
};
var LiteralIncludeLinkProvider = class {
  async provideDocumentLinks(document) {
    const refs = parseLiteralIncludes(document);
    const links = [];
    const workspaceRoot = getWorkspaceRoot(document);
    for (const ref of refs) {
      const resolved = await resolveLiteralIncludePath(
        document.uri.fsPath,
        ref.targetPath,
        workspaceRoot
      );
      if (resolved.exists) {
        const link = new vscode7.DocumentLink(
          ref.pathRange,
          vscode7.Uri.file(resolved.absolutePath)
        );
        link.tooltip = `Open ${path4.basename(resolved.absolutePath)}`;
        links.push(link);
      } else {
        const link = new vscode7.DocumentLink(ref.pathRange);
        link.tooltip = resolved.error || "File not found";
        links.push(link);
      }
    }
    return links;
  }
};
async function findSnippetLine(filePath, snippetName) {
  try {
    const content = await fs4.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const snippetPattern = new RegExp(
      `[:;#/]\\s*:snippet-start:\\s*${escapeRegex(snippetName)}\\s*$`
    );
    for (let i = 0; i < lines.length; i++) {
      if (snippetPattern.test(lines[i])) {
        return i;
      }
    }
  } catch {
  }
  return void 0;
}
async function findMarkerLine(filePath, marker) {
  try {
    const content = await fs4.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) {
        return i + 1;
      }
    }
  } catch {
  }
  return void 0;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function registerLiteralIncludeProviders(context) {
  const rstSelector = { language: "restructuredtext" };
  const txtSelector = {
    language: "plaintext",
    pattern: "**/*.txt"
  };
  const selectors = [rstSelector, txtSelector];
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "grove.literalinclude.view",
      async (filePath, snippetName, startAfter) => {
        const uri = vscode7.Uri.file(filePath);
        const document = await vscode7.workspace.openTextDocument(uri);
        const editor = await vscode7.window.showTextDocument(document, {
          viewColumn: vscode7.ViewColumn.Beside,
          preview: true
        });
        if (snippetName) {
          const lineNumber = await findSnippetLine(filePath, snippetName);
          if (lineNumber !== void 0) {
            const position = new vscode7.Position(lineNumber, 0);
            editor.selection = new vscode7.Selection(position, position);
            editor.revealRange(
              new vscode7.Range(position, position),
              vscode7.TextEditorRevealType.InCenter
            );
          }
        } else if (startAfter) {
          const lineNumber = await findMarkerLine(filePath, startAfter);
          if (lineNumber !== void 0) {
            const position = new vscode7.Position(lineNumber, 0);
            editor.selection = new vscode7.Selection(position, position);
            editor.revealRange(
              new vscode7.Range(position, position),
              vscode7.TextEditorRevealType.InCenter
            );
          }
        }
      }
    )
  );
  for (const selector of selectors) {
    context.subscriptions.push(
      vscode7.languages.registerCodeLensProvider(
        selector,
        new LiteralIncludeCodeLensProvider()
      ),
      vscode7.languages.registerDefinitionProvider(
        selector,
        new LiteralIncludeDefinitionProvider()
      ),
      vscode7.languages.registerDocumentLinkProvider(
        selector,
        new LiteralIncludeLinkProvider()
      )
    );
  }
}

// src/preview/BluehawkPreview.ts
var path6 = __toESM(require("path"));

// src/preview/bluehawk-runner.ts
var vscode8 = __toESM(require("vscode"));
var import_child_process = require("child_process");
var import_util = require("util");
var path5 = __toESM(require("path"));
var fs5 = __toESM(require("fs"));
var os = __toESM(require("os"));
var execAsync = (0, import_util.promisify)(import_child_process.exec);
function getBluehawkCommand() {
  const config = vscode8.workspace.getConfiguration("grove");
  const customPath = config.get("bluehawkPath", "");
  if (customPath && customPath.trim().length > 0) {
    return customPath;
  }
  return "npx bluehawk";
}
function containsBluehawkDirectives(content) {
  const markers = [
    ":snippet-start:",
    ":snippet-end:",
    ":remove-start:",
    ":remove-end:",
    ":replace-start:",
    ":replace-end:",
    ":uncomment-start:",
    ":uncomment-end:",
    ":emphasize-start:",
    ":emphasize-end:"
  ];
  return markers.some((marker) => content.includes(marker));
}
async function runBluehawkDryRun(filePath) {
  const bluehawk = getBluehawkCommand();
  const workingDir = path5.dirname(filePath);
  const tempDir = await fs5.promises.mkdtemp(
    path5.join(os.tmpdir(), "grove-bluehawk-")
  );
  try {
    await execAsync(`${bluehawk} snip -o "${tempDir}" "${filePath}"`, {
      cwd: workingDir,
      timeout: 3e4
      // 30 second timeout
    });
    const snippets = await readSnippetsFromDir(tempDir, filePath);
    return {
      success: true,
      snippets
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("not found") || errorMessage.includes("ENOENT")) {
      return {
        success: false,
        snippets: [],
        error: "Bluehawk CLI not found. Install with: npm install -g bluehawk"
      };
    }
    if (errorMessage.includes("No snippets found")) {
      return {
        success: true,
        snippets: []
      };
    }
    return {
      success: false,
      snippets: [],
      error: `Bluehawk execution failed: ${errorMessage}`
    };
  } finally {
    try {
      await fs5.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
}
async function readSnippetsFromDir(dir, sourcePath) {
  const snippets = [];
  try {
    const entries = await fs5.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path5.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subSnippets = await readSnippetsFromDir(fullPath, sourcePath);
        snippets.push(...subSnippets);
      } else if (entry.isFile()) {
        const content = await fs5.promises.readFile(fullPath, "utf-8");
        const ext = path5.extname(entry.name);
        const name = path5.basename(entry.name, ext);
        snippets.push({
          name,
          content,
          sourcePath,
          language: detectLanguage(sourcePath)
        });
      }
    }
  } catch {
  }
  return snippets;
}
function detectLanguage(filePath) {
  const ext = path5.extname(filePath).toLowerCase();
  const languageMap = {
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascriptreact",
    ".tsx": "typescriptreact",
    ".py": "python",
    ".java": "java",
    ".kt": "kotlin",
    ".cs": "csharp",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".m": "objective-c",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".sh": "shell",
    ".bash": "shell",
    ".md": "markdown",
    ".rst": "restructuredtext"
  };
  return languageMap[ext] || "plaintext";
}

// src/preview/BluehawkPreview.ts
var BluehawkPreviewProvider = class {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  static viewType = "grove.bluehawkPreview";
  _view;
  _currentDocument;
  _updateTimeout;
  _debounceMs = 500;
  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtml();
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "refresh" && this._currentDocument) {
        await this.updatePreview(this._currentDocument);
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._currentDocument) {
        this.updatePreview(this._currentDocument);
      }
    });
  }
  /**
   * Update preview for the given document.
   */
  async updatePreview(document) {
    if (!this._view) {
      return;
    }
    this._currentDocument = document;
    const content = document.getText();
    if (!containsBluehawkDirectives(content)) {
      this._view.webview.postMessage({
        command: "noDirectives",
        fileName: path6.basename(document.uri.fsPath)
      });
      return;
    }
    this._view.webview.postMessage({
      command: "loading",
      fileName: path6.basename(document.uri.fsPath)
    });
    const result = await runBluehawkDryRun(document.uri.fsPath);
    this._view.webview.postMessage({
      command: "preview",
      result,
      fileName: path6.basename(document.uri.fsPath)
    });
  }
  /**
   * Update preview with debouncing (for active editing).
   */
  debouncedUpdate(document) {
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
    }
    this._updateTimeout = setTimeout(() => {
      this.updatePreview(document);
    }, this._debounceMs);
  }
  /**
   * Clear the preview pane.
   */
  clear() {
    this._currentDocument = void 0;
    if (this._view) {
      this._view.webview.postMessage({ command: "clear" });
    }
  }
  _getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Bluehawk Preview</title>
  <style>
    body {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-foreground);
      padding: 0;
      margin: 0;
    }
    .header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .file-name {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .snippet {
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 8px;
    }
    .snippet-header {
      padding: 8px 12px;
      background: var(--vscode-editor-lineHighlightBackground);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .snippet-name {
      font-weight: bold;
    }
    .snippet-content {
      padding: 12px;
      background: var(--vscode-editor-background);
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      user-select: none;
      -webkit-user-select: none;
      cursor: default;
    }
    .loading, .empty, .error {
      padding: 20px;
      text-align: center;
    }
    .error {
      color: var(--vscode-errorForeground);
    }
    .removed {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .refresh-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="content">
    <div class="empty">Open a file with Bluehawk directives to see preview</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', event => {
      const message = event.data;
      const content = document.getElementById('content');

      switch (message.command) {
        case 'loading':
          content.innerHTML = '<div class="loading">Loading preview for ' + escapeHtml(message.fileName) + '...</div>';
          break;

        case 'noDirectives':
          content.innerHTML = '<div class="empty">' + escapeHtml(message.fileName) + ' does not contain Bluehawk directives</div>';
          break;

        case 'clear':
          content.innerHTML = '<div class="empty">No file selected</div>';
          break;

        case 'preview':
          renderPreview(message.result, message.fileName);
          break;
      }
    });

    function renderPreview(result, fileName) {
      const content = document.getElementById('content');

      if (!result.success) {
        content.innerHTML = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div><div class="error">' + escapeHtml(result.error) + '</div>';
        return;
      }

      if (result.snippets.length === 0) {
        content.innerHTML = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div><div class="empty">No snippets extracted</div>';
        return;
      }

      let html = '<div class="header"><span class="file-name">' + escapeHtml(fileName) + '</span><button class="refresh-btn" onclick="refresh()">Refresh</button></div>';

      for (let i = 0; i < result.snippets.length; i++) {
        const snippet = result.snippets[i];
        const escapedContent = escapeHtml(snippet.content);
        html += '<div class="snippet">';
        html += '<div class="snippet-header"><span class="snippet-name">' + escapeHtml(snippet.name) + '</span></div>';
        html += '<div class="snippet-content">' + escapedContent + '</div>';
        html += '</div>';
      }

      content.innerHTML = html;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }
};

// src/extension.ts
var statusBarItem;
var currentStatus = null;
var outputChannel;
var mongoConnectionManager;
function getDetectedProjects() {
  return currentStatus?.projects ?? [];
}
function getActiveProject() {
  return currentStatus?.activeProject ?? null;
}
function getApi2() {
  return {
    // Test runner API
    ...getApi(),
    // Project detection API
    getDetectedProjects,
    getActiveProject
  };
}
function getConfig() {
  const config = vscode9.workspace.getConfiguration("grove");
  return {
    autoDetect: config.get("autoDetect", true),
    bluehawkPath: config.get("bluehawkPath", ""),
    showStatusBar: config.get("showStatusBar", true)
  };
}
async function getStatus() {
  const workspaceFolders = vscode9.workspace.workspaceFolders;
  const mongoStatus = mongoConnectionManager?.status ?? {
    connected: false,
    clusterType: "unknown"
  };
  const mongoConnection = {
    connected: mongoStatus.connected,
    clusterType: mongoStatus.clusterType
  };
  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection
    };
  }
  const projects = await (0, import_shared3.detectGroveProjects)(workspaceFolders[0].uri.fsPath);
  currentStatus = {
    hasProject: projects.length > 0,
    activeProject: projects[0] ?? null,
    projects,
    mongoConnection
  };
  return currentStatus;
}
async function detectProjectsWithProgress(workspacePath) {
  return vscode9.window.withProgress(
    {
      location: vscode9.ProgressLocation.Window,
      title: "Grove: Detecting projects..."
    },
    async (progress) => {
      progress.report({ increment: 0 });
      const projects = await (0, import_shared3.detectGroveProjects)(workspacePath);
      progress.report({ increment: 100 });
      return projects;
    }
  );
}
async function activate(context) {
  outputChannel = vscode9.window.createOutputChannel("Grove", { log: true });
  context.subscriptions.push(outputChannel);
  outputChannel.info("Grove extension activating...");
  const config = getConfig();
  const panelProvider = new GrovePanelProvider(context.extensionUri, getStatus);
  context.subscriptions.push(
    vscode9.window.registerWebviewViewProvider(
      GrovePanelProvider.viewType,
      panelProvider
    )
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("grove.refreshPanel", () => {
      panelProvider.refresh();
    })
  );
  statusBarItem = vscode9.window.createStatusBarItem(
    vscode9.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);
  const workspaceFolders = vscode9.workspace.workspaceFolders;
  let status;
  if (config.autoDetect && workspaceFolders) {
    const projects = await detectProjectsWithProgress(
      workspaceFolders[0].uri.fsPath
    );
    currentStatus = {
      hasProject: projects.length > 0,
      activeProject: projects[0] ?? null,
      projects,
      mongoConnection: { connected: false, clusterType: "unknown" }
    };
    status = currentStatus;
    outputChannel.info(`Detected ${projects.length} Grove project(s)`);
  } else {
    status = await getStatus();
  }
  if (status.hasProject && status.activeProject) {
    if (config.showStatusBar) {
      statusBarItem.text = `$(tree) Grove: ${status.activeProject.relativePath}`;
      statusBarItem.tooltip = `Grove project detected
${status.projects.length} project(s) found`;
      statusBarItem.show();
    }
  }
  context.subscriptions.push(
    vscode9.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("grove.showStatusBar")) {
        const newConfig = getConfig();
        if (newConfig.showStatusBar && currentStatus?.hasProject) {
          statusBarItem.show();
        } else {
          statusBarItem.hide();
        }
      }
    })
  );
  initDiagnostics(context);
  if (workspaceFolders && status.projects.length > 0) {
    await refreshAllDiagnostics(
      status.projects,
      workspaceFolders[0].uri.fsPath
    );
  }
  initLanguageStatus(context);
  registerLanguageStatusHandlers(context, getDetectedProjects);
  const activeEditor = vscode9.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(status.projects, activeEditor.document.uri.fsPath);
  }
  registerSymlinkCommand(context);
  mongoConnectionManager = new MongoConnectionManager(context.secrets);
  registerMongoCommands(context, mongoConnectionManager, () => {
    panelProvider.refresh();
  });
  mongoConnectionManager.reconnect().then((connected) => {
    if (connected) {
      outputChannel.info("Reconnected to MongoDB using stored credentials");
      panelProvider.refresh();
    }
  });
  registerLiteralIncludeProviders(context);
  outputChannel.info("Registered literalinclude providers for RST files");
  const bluehawkPreviewProvider = new BluehawkPreviewProvider(
    context.extensionUri
  );
  context.subscriptions.push(
    vscode9.window.registerWebviewViewProvider(
      BluehawkPreviewProvider.viewType,
      bluehawkPreviewProvider
    )
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("grove.openBluehawkPreview", async () => {
      const editor = vscode9.window.activeTextEditor;
      if (!editor) {
        vscode9.window.showWarningMessage("No active editor");
        return;
      }
      await bluehawkPreviewProvider.updatePreview(editor.document);
      await vscode9.commands.executeCommand("grove.bluehawkPreview.focus");
    }),
    vscode9.commands.registerCommand(
      "grove.refreshBluehawkPreview",
      async () => {
        const editor = vscode9.window.activeTextEditor;
        if (editor) {
          await bluehawkPreviewProvider.updatePreview(editor.document);
        }
      }
    )
  );
  context.subscriptions.push(
    vscode9.workspace.onDidSaveTextDocument(async (document) => {
      if (containsBluehawkDirectives(document.getText())) {
        await bluehawkPreviewProvider.updatePreview(document);
      }
    })
  );
  context.subscriptions.push(
    vscode9.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && containsBluehawkDirectives(editor.document.getText())) {
        bluehawkPreviewProvider.debouncedUpdate(editor.document);
      }
    })
  );
  outputChannel.info("Registered Bluehawk preview provider");
  context.subscriptions.push(
    vscode9.commands.registerCommand("grove.runTests", async () => {
      const workspaceFolders2 = vscode9.workspace.workspaceFolders;
      if (!workspaceFolders2) {
        vscode9.window.showErrorMessage("No workspace folder open");
        return;
      }
      const workspaceRoot = workspaceFolders2[0].uri.fsPath;
      let projectPath = workspaceRoot;
      const activeFile = vscode9.window.activeTextEditor?.document.uri.fsPath;
      if (activeFile) {
        const projects = await (0, import_shared3.detectGroveProjects)(workspaceRoot);
        const project = (0, import_shared3.findProjectForFile)(activeFile, projects);
        if (project) {
          projectPath = project.rootPath;
        }
      }
      const runner = await findTestRunnerForProject(projectPath);
      if (!runner) {
        vscode9.window.showWarningMessage(
          "No test runner found. Install a Grove language extension (e.g., Grove for Node.js)."
        );
        return;
      }
      const testOutputChannel = vscode9.window.createOutputChannel("Grove Tests");
      vscode9.window.withProgress(
        {
          location: vscode9.ProgressLocation.Notification,
          title: `Running ${runner.name} tests...`,
          cancellable: false
        },
        async () => {
          const result = await runTests({ projectPath });
          if (result.output) {
            testOutputChannel.clear();
            testOutputChannel.appendLine(`=== Grove Test Results ===`);
            testOutputChannel.appendLine(`Duration: ${result.duration}ms`);
            testOutputChannel.appendLine(`Success: ${result.success}`);
            testOutputChannel.appendLine(``);
            testOutputChannel.appendLine(result.output);
          }
          if (result.success) {
            vscode9.window.showInformationMessage(
              `Tests passed: ${result.passed ?? 0}/${result.total ?? 0}`
            );
          } else {
            const message = result.total === 0 ? `Test runner failed. Check output for details.` : `Tests failed: ${result.failed ?? 0}/${result.total ?? 0}`;
            const action = await vscode9.window.showErrorMessage(
              message,
              "Show Output"
            );
            if (action === "Show Output") {
              testOutputChannel.show();
            }
          }
        }
      );
    })
  );
  outputChannel.info(
    `Grove activated. Found ${status.projects.length} project(s).`
  );
  return getApi2();
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate,
  getActiveProject,
  getApi,
  getDetectedProjects
});
