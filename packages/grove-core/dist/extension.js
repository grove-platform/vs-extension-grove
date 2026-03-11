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
    exports2.detectLanguage = detectLanguage;
    exports2.validateSnipConfig = validateSnipConfig;
    exports2.findProjectForFile = findProjectForFile3;
    var path4 = __importStar(require("path"));
    var fs4 = __importStar(require("fs/promises"));
    async function detectGroveProjects2(workspacePath) {
      const projects = [];
      const snipFiles = await findSnipFiles(workspacePath);
      for (const snipPath of snipFiles) {
        const projectRoot = path4.dirname(snipPath);
        const relativePath = path4.relative(workspacePath, projectRoot) || ".";
        const language = await detectLanguage(projectRoot);
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
        const entries = await fs4.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path4.join(dir, entry.name);
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
    async function detectLanguage(projectPath) {
      try {
        const pkgPath = path4.join(projectPath, "package.json");
        const content = await fs4.readFile(pkgPath, "utf-8");
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
        await fs4.access(path4.join(projectPath, "pyproject.toml"));
        return "python";
      } catch {
        try {
          await fs4.access(path4.join(projectPath, "pytest.ini"));
          return "python";
        } catch {
        }
      }
      try {
        await fs4.access(path4.join(projectPath, "go.mod"));
        return "go";
      } catch {
      }
      try {
        await fs4.access(path4.join(projectPath, "pom.xml"));
        return "java";
      } catch {
        try {
          await fs4.access(path4.join(projectPath, "build.gradle"));
          return "java";
        } catch {
        }
      }
      try {
        const entries = await fs4.readdir(projectPath);
        if (entries.some((e) => e.endsWith(".csproj"))) {
          return "csharp";
        }
      } catch {
      }
      return null;
    }
    async function validateSnipConfig(snipPath) {
      try {
        const content = await fs4.readFile(snipPath, "utf-8");
        return content.includes("module.exports") || content.includes("export default");
      } catch {
        return false;
      }
    }
    function findProjectForFile3(filePath, projects) {
      const normalizedFile = path4.resolve(filePath);
      const matchingProjects = projects.filter((project) => {
        const normalizedRoot = path4.resolve(project.rootPath);
        return normalizedFile.startsWith(normalizedRoot + path4.sep);
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
    var path4 = __importStar(require("path"));
    function isPathWithinBoundary(resolvedPath, basePath) {
      const normalizedResolved = path4.normalize(resolvedPath);
      const normalizedBase = path4.normalize(basePath);
      return normalizedResolved.startsWith(normalizedBase + path4.sep) || normalizedResolved === normalizedBase;
    }
    function sanitizePath(relativePath) {
      let sanitized = relativePath.replace(/\0/g, "");
      sanitized = sanitized.replace(/\\/g, "/");
      sanitized = sanitized.replace(/^\/+/, "");
      return sanitized;
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
var vscode6 = __toESM(require("vscode"));
var import_shared3 = __toESM(require_dist());

// src/mcp-bridge.ts
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_child_process = require("child_process");
var mcpProcess = null;
var restartCount = 0;
var MAX_RESTARTS = 3;
function resolveMcpServerPath(extensionPath) {
  const symlinkPath = path.join(
    extensionPath,
    "node_modules",
    "@mongodb",
    "grove-mcp",
    "dist",
    "index.js"
  );
  try {
    return fs.realpathSync(symlinkPath);
  } catch {
    return symlinkPath;
  }
}
async function startMcpServer(context, workspacePath) {
  const serverPath = resolveMcpServerPath(context.extensionPath);
  mcpProcess = (0, import_child_process.spawn)("node", [serverPath], {
    env: {
      ...process.env,
      GROVE_WORKSPACE: workspacePath
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  mcpProcess.on("exit", (code) => {
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      const delay = Math.pow(2, restartCount) * 1e3;
      setTimeout(() => startMcpServer(context, workspacePath), delay);
    }
  });
  mcpProcess.stderr?.on("data", (data) => {
    console.error(`Grove MCP server error: ${data}`);
  });
}
function stopMcpServer() {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
}
function getMcpConfig(extensionPath) {
  return {
    mcpServers: {
      grove: {
        command: "node",
        args: [resolveMcpServerPath(extensionPath)],
        env: {
          GROVE_WORKSPACE: "${workspaceFolder}"
        }
      }
    }
  };
}

// src/commands/copy-config.ts
var vscode = __toESM(require("vscode"));
function registerCopyConfigCommand(context) {
  const command = vscode.commands.registerCommand(
    "grove.copyMcpConfig",
    async () => {
      const config = getMcpConfig(context.extensionPath);
      const json = JSON.stringify(config, null, 2);
      await vscode.env.clipboard.writeText(json);
      vscode.window.showInformationMessage(
        "Grove MCP config copied! Paste in Augment Settings \u2192 MCP \u2192 Import from JSON"
      );
    }
  );
  context.subscriptions.push(command);
}

// src/panel/GrovePanel.ts
var vscode2 = __toESM(require("vscode"));
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
          vscode2.commands.executeCommand("grove.copyMcpConfig");
          break;
        case "runTests":
          vscode2.commands.executeCommand("grove.runTests");
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
        html += '<div class="section"><div class="section-title">MongoDB</div><div class="status-row"><span class="status-icon">' + (currentStatus.mongoConnection.connected ? '\u2713' : '\u25CB') + '</span><span>' + (currentStatus.mongoConnection.connected ? 'Connected' : 'Not connected') + '</span></div></div>';
        html += '<div class="section"><div class="section-title">Actions</div><div class="actions"><button onclick="runTests()">Run Tests</button><button onclick="refresh()">Refresh</button></div></div>';
      }
      html += '<div class="section"><div class="section-title">AI Integration</div><button onclick="copyMcpConfig()" style="width: 100%;">Copy MCP Config for Augment</button></div>';
      content.innerHTML = html;
    }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function copyMcpConfig() { vscode.postMessage({ command: 'copyMcpConfig' }); }
    function runTests() { vscode.postMessage({ command: 'runTests' }); }
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
var vscode3 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs/promises"));
var diagnosticCollection;
function initDiagnostics(context) {
  diagnosticCollection = vscode3.languages.createDiagnosticCollection("grove");
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
    const symlinkPath = path2.join(workspacePath, symlinkRelPath);
    try {
      const stats = await fs2.lstat(symlinkPath);
      if (stats.isSymbolicLink()) {
        try {
          await fs2.access(symlinkPath);
        } catch {
          diagnostics.push(
            new vscode3.Diagnostic(
              new vscode3.Range(0, 0, 0, 0),
              `Broken symlink: ${symlinkRelPath} points to a non-existent target`,
              vscode3.DiagnosticSeverity.Error
            )
          );
        }
      }
    } catch {
      const isDocsProject = await looksLikeDocsProject(workspacePath);
      if (isDocsProject) {
        diagnostics.push(
          new vscode3.Diagnostic(
            new vscode3.Range(0, 0, 0, 0),
            `Missing symlink: ${symlinkRelPath}. Run "Grove: Create Symlink" to create it.`,
            vscode3.DiagnosticSeverity.Warning
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
      await fs2.access(path2.join(workspacePath, indicator));
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
  const snipUri = vscode3.Uri.file(path2.join(project.rootPath, "snip.js"));
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
var vscode4 = __toESM(require("vscode"));
var import_shared = __toESM(require_dist());
var languageStatusItem;
function initLanguageStatus(context) {
  languageStatusItem = vscode4.languages.createLanguageStatusItem(
    "grove.status",
    { pattern: "**/*" }
    // Apply to all files
  );
  languageStatusItem.name = "Grove Project";
  languageStatusItem.text = "$(tree) Grove";
  languageStatusItem.detail = "No Grove project";
  languageStatusItem.severity = vscode4.LanguageStatusSeverity.Information;
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
    languageStatusItem.severity = vscode4.LanguageStatusSeverity.Information;
    return;
  }
  const project = (0, import_shared.findProjectForFile)(activeFile, projects);
  if (project) {
    const langIcon = getLanguageIcon(project.language);
    const langName = project.language ?? "unknown";
    languageStatusItem.text = `${langIcon} ${project.relativePath || "root"}`;
    languageStatusItem.detail = `Grove project (${langName})`;
    languageStatusItem.severity = project.hasValidConfig ? vscode4.LanguageStatusSeverity.Information : vscode4.LanguageStatusSeverity.Warning;
  } else {
    languageStatusItem.text = "$(tree) Grove";
    languageStatusItem.detail = "Not in a Grove project";
    languageStatusItem.severity = vscode4.LanguageStatusSeverity.Information;
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
    vscode4.window.onDidChangeActiveTextEditor((editor) => {
      updateLanguageStatus(
        getProjects(),
        editor?.document.uri.fsPath
      );
    })
  );
  const activeEditor = vscode4.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(getProjects(), activeEditor.document.uri.fsPath);
  }
}

// src/symlink.ts
var vscode5 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var fs3 = __toESM(require("fs/promises"));
var import_shared2 = __toESM(require_dist());
async function createSymlink(symlinkPath, targetPath, workspacePath) {
  if (!(0, import_shared2.validateWorkspacePath)(symlinkPath, workspacePath)) {
    throw new Error("Symlink path must be within the workspace");
  }
  if (!(0, import_shared2.validateWorkspacePath)(targetPath, workspacePath)) {
    throw new Error("Target path must be within the workspace");
  }
  try {
    await fs3.access(targetPath);
  } catch {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }
  const symlinkDir = path3.dirname(symlinkPath);
  await fs3.mkdir(symlinkDir, { recursive: true });
  const relativeTarget = path3.relative(symlinkDir, targetPath);
  await fs3.symlink(relativeTarget, symlinkPath);
}
function registerSymlinkCommand(context) {
  context.subscriptions.push(
    vscode5.commands.registerCommand("grove.createSymlink", async () => {
      const workspaceFolders = vscode5.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode5.window.showErrorMessage("No workspace folder open");
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const symlinkRelPath = await vscode5.window.showInputBox({
        title: "Grove: Create Symlink",
        prompt: "Enter the relative path for the symlink",
        value: "source/code-examples/tested",
        validateInput: (value) => {
          if (!value) return "Path is required";
          if (path3.isAbsolute(value)) return "Path must be relative";
          return void 0;
        }
      });
      if (!symlinkRelPath) {
        return;
      }
      const targetRelPath = await vscode5.window.showInputBox({
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
      const symlinkPath = path3.join(workspacePath, symlinkRelPath);
      const targetPath = path3.resolve(path3.dirname(symlinkPath), targetRelPath);
      try {
        await createSymlink(symlinkPath, targetPath, workspacePath);
        vscode5.window.showInformationMessage(
          `Created symlink: ${symlinkRelPath} \u2192 ${targetRelPath}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode5.window.showErrorMessage(`Failed to create symlink: ${message}`);
      }
    })
  );
}

// src/extension.ts
var statusBarItem;
var currentStatus = null;
var outputChannel;
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
  const config = vscode6.workspace.getConfiguration("grove");
  return {
    autoDetect: config.get("autoDetect", true),
    bluehawkPath: config.get("bluehawkPath", ""),
    showStatusBar: config.get("showStatusBar", true)
  };
}
async function getStatus() {
  const workspaceFolders = vscode6.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return {
      hasProject: false,
      activeProject: null,
      projects: [],
      mongoConnection: { connected: false, clusterType: "unknown" }
    };
  }
  const projects = await (0, import_shared3.detectGroveProjects)(workspaceFolders[0].uri.fsPath);
  currentStatus = {
    hasProject: projects.length > 0,
    activeProject: projects[0] ?? null,
    projects,
    mongoConnection: { connected: false, clusterType: "unknown" }
  };
  return currentStatus;
}
async function detectProjectsWithProgress(workspacePath) {
  return vscode6.window.withProgress(
    {
      location: vscode6.ProgressLocation.Window,
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
async function startMcpServerWithProgress(context, workspacePath) {
  return vscode6.window.withProgress(
    {
      location: vscode6.ProgressLocation.Window,
      title: "Grove: Starting MCP server..."
    },
    async (progress) => {
      progress.report({ increment: 0 });
      await startMcpServer(context, workspacePath);
      progress.report({ increment: 100 });
    }
  );
}
async function activate(context) {
  outputChannel = vscode6.window.createOutputChannel("Grove", { log: true });
  context.subscriptions.push(outputChannel);
  outputChannel.info("Grove extension activating...");
  const config = getConfig();
  const panelProvider = new GrovePanelProvider(context.extensionUri, getStatus);
  context.subscriptions.push(
    vscode6.window.registerWebviewViewProvider(
      GrovePanelProvider.viewType,
      panelProvider
    )
  );
  context.subscriptions.push(
    vscode6.commands.registerCommand("grove.refreshPanel", () => {
      panelProvider.refresh();
    })
  );
  statusBarItem = vscode6.window.createStatusBarItem(
    vscode6.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);
  const workspaceFolders = vscode6.workspace.workspaceFolders;
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
    if (workspaceFolders) {
      await startMcpServerWithProgress(context, workspaceFolders[0].uri.fsPath);
      outputChannel.info("MCP server started");
    }
  }
  context.subscriptions.push(
    vscode6.workspace.onDidChangeConfiguration((e) => {
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
  const activeEditor = vscode6.window.activeTextEditor;
  if (activeEditor) {
    updateLanguageStatus(status.projects, activeEditor.document.uri.fsPath);
  }
  registerCopyConfigCommand(context);
  registerSymlinkCommand(context);
  context.subscriptions.push(
    vscode6.commands.registerCommand("grove.runTests", async () => {
      const workspaceFolders2 = vscode6.workspace.workspaceFolders;
      if (!workspaceFolders2) {
        vscode6.window.showErrorMessage("No workspace folder open");
        return;
      }
      const workspaceRoot = workspaceFolders2[0].uri.fsPath;
      let projectPath = workspaceRoot;
      const activeFile = vscode6.window.activeTextEditor?.document.uri.fsPath;
      if (activeFile) {
        const projects = await (0, import_shared3.detectGroveProjects)(workspaceRoot);
        const project = (0, import_shared3.findProjectForFile)(activeFile, projects);
        if (project) {
          projectPath = project.rootPath;
        }
      }
      const runner = await findTestRunnerForProject(projectPath);
      if (!runner) {
        vscode6.window.showWarningMessage(
          "No test runner found. Install a Grove language extension (e.g., Grove for Node.js)."
        );
        return;
      }
      const testOutputChannel = vscode6.window.createOutputChannel("Grove Tests");
      vscode6.window.withProgress(
        {
          location: vscode6.ProgressLocation.Notification,
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
            vscode6.window.showInformationMessage(
              `Tests passed: ${result.passed ?? 0}/${result.total ?? 0}`
            );
          } else {
            const message = result.total === 0 ? `Test runner failed. Check output for details.` : `Tests failed: ${result.failed ?? 0}/${result.total ?? 0}`;
            const action = await vscode6.window.showErrorMessage(
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
  stopMcpServer();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate,
  getActiveProject,
  getApi,
  getDetectedProjects
});
