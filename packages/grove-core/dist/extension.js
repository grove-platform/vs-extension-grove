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
    var path2 = __importStar(require("path"));
    var fs2 = __importStar(require("fs/promises"));
    async function detectGroveProjects2(workspacePath) {
      const projects = [];
      const snipFiles = await findSnipFiles(workspacePath);
      for (const snipPath of snipFiles) {
        const projectRoot = path2.dirname(snipPath);
        const relativePath = path2.relative(workspacePath, projectRoot) || ".";
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
        const entries = await fs2.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path2.join(dir, entry.name);
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
        const pkgPath = path2.join(projectPath, "package.json");
        const content = await fs2.readFile(pkgPath, "utf-8");
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
        await fs2.access(path2.join(projectPath, "pyproject.toml"));
        return "python";
      } catch {
        try {
          await fs2.access(path2.join(projectPath, "pytest.ini"));
          return "python";
        } catch {
        }
      }
      try {
        await fs2.access(path2.join(projectPath, "go.mod"));
        return "go";
      } catch {
      }
      try {
        await fs2.access(path2.join(projectPath, "pom.xml"));
        return "java";
      } catch {
        try {
          await fs2.access(path2.join(projectPath, "build.gradle"));
          return "java";
        } catch {
        }
      }
      try {
        const entries = await fs2.readdir(projectPath);
        if (entries.some((e) => e.endsWith(".csproj"))) {
          return "csharp";
        }
      } catch {
      }
      return null;
    }
    async function validateSnipConfig(snipPath) {
      try {
        const content = await fs2.readFile(snipPath, "utf-8");
        return content.includes("module.exports") || content.includes("export default");
      } catch {
        return false;
      }
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
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));
var import_shared = __toESM(require_dist());

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

// src/extension.ts
var statusBarItem;
async function activate(context) {
  console.log("Grove extension activate() called");
  statusBarItem = vscode2.window.createStatusBarItem(
    vscode2.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);
  const workspaceFolders = vscode2.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }
  const projects = await (0, import_shared.detectGroveProjects)(workspaceFolders[0].uri.fsPath);
  if (projects.length > 0) {
    statusBarItem.text = `$(tree) Grove: ${projects[0].relativePath}`;
    statusBarItem.tooltip = `Grove project detected
${projects.length} project(s) found`;
    statusBarItem.show();
    await startMcpServer(context, workspaceFolders[0].uri.fsPath);
  }
  registerCopyConfigCommand(context);
  const outputChannel = vscode2.window.createOutputChannel("Grove");
  outputChannel.appendLine(
    `Grove activated. Found ${projects.length} project(s).`
  );
  context.subscriptions.push(outputChannel);
}
function deactivate() {
  stopMcpServer();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
