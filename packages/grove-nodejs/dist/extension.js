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
    exports2.findProjectForFile = findProjectForFile2;
    var path3 = __importStar(require("path"));
    var fs2 = __importStar(require("fs/promises"));
    async function detectGroveProjects2(workspacePath) {
      const projects = [];
      const snipFiles = await findSnipFiles(workspacePath);
      for (const snipPath of snipFiles) {
        const projectRoot = path3.dirname(snipPath);
        const relativePath = path3.relative(workspacePath, projectRoot) || ".";
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
          const fullPath = path3.join(dir, entry.name);
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
        const pkgPath = path3.join(projectPath, "package.json");
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
        await fs2.access(path3.join(projectPath, "pyproject.toml"));
        return "python";
      } catch {
        try {
          await fs2.access(path3.join(projectPath, "pytest.ini"));
          return "python";
        } catch {
        }
      }
      try {
        await fs2.access(path3.join(projectPath, "go.mod"));
        return "go";
      } catch {
      }
      try {
        await fs2.access(path3.join(projectPath, "pom.xml"));
        return "java";
      } catch {
        try {
          await fs2.access(path3.join(projectPath, "build.gradle"));
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
    function findProjectForFile2(filePath, projects) {
      const normalizedFile = path3.resolve(filePath);
      const matchingProjects = projects.filter((project) => {
        const normalizedRoot = path3.resolve(project.rootPath);
        return normalizedFile.startsWith(normalizedRoot + path3.sep);
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
    var path3 = __importStar(require("path"));
    function isPathWithinBoundary(resolvedPath, basePath) {
      const normalizedResolved = path3.normalize(resolvedPath);
      const normalizedBase = path3.normalize(basePath);
      return normalizedResolved.startsWith(normalizedBase + path3.sep) || normalizedResolved === normalizedBase;
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
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var path2 = __toESM(require("path"));

// src/test-runner.ts
var import_child_process = require("child_process");
var path = __toESM(require("path"));
var fs = __toESM(require("fs/promises"));
var DEFAULT_TIMEOUT = 6e4;
var MAX_TIMEOUT = 3e5;
async function detectJestProject(projectPath) {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("jest" in deps || "vitest" in deps) {
      return true;
    }
    if (pkg.scripts?.test) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
async function runJestTests(options) {
  const { projectPath, testFile, timeout = DEFAULT_TIMEOUT } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);
  const args = ["test"];
  if (testFile) {
    args.push("--", testFile);
  }
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timedOut = false;
    const proc = (0, import_child_process.spawn)("npm", args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true" },
      shell: true
    });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, effectiveTimeout);
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (timedOut) {
        resolve({
          success: false,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          output: `Test execution timed out after ${effectiveTimeout / 1e3} seconds`,
          duration
        });
        return;
      }
      const counts = parseJestOutput(output);
      resolve({
        success: code === 0,
        total: counts.total,
        passed: counts.passed,
        failed: counts.failed,
        skipped: counts.skipped,
        output,
        duration
      });
    });
  });
}
function parseJestOutput(output) {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const testsMatch = output.match(
    /Tests:\s*(?:(\d+)\s*passed)?[,\s]*(?:(\d+)\s*failed)?[,\s]*(?:(\d+)\s*skipped)?[,\s]*(\d+)\s*total/i
  );
  if (testsMatch) {
    return {
      passed: parseInt(testsMatch[1] || "0", 10),
      failed: parseInt(testsMatch[2] || "0", 10),
      skipped: parseInt(testsMatch[3] || "0", 10),
      total: parseInt(testsMatch[4] || "0", 10)
    };
  }
  return defaults;
}

// src/extension.ts
var import_shared = __toESM(require_dist());
function getWorkspaceRoot() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath || "";
}
async function findProjectPathForFile(filePath) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return "";
  const projects = await (0, import_shared.detectGroveProjects)(workspaceRoot);
  const project = (0, import_shared.findProjectForFile)(filePath, projects);
  return project?.rootPath || workspaceRoot;
}
async function activate(context) {
  console.log("Grove for Node.js extension activating...");
  const groveCore = vscode.extensions.getExtension("mongodb.grove-core");
  if (!groveCore) {
    vscode.window.showErrorMessage(
      "Grove Core extension not found. Please install it first."
    );
    return;
  }
  const coreApi = await groveCore.activate();
  if (!coreApi?.registerTestRunner) {
    vscode.window.showErrorMessage(
      "Grove Core API not available. Please update Grove Core."
    );
    return;
  }
  coreApi.registerTestRunner({
    language: "nodejs",
    name: "Jest",
    run: runJestTests,
    detect: detectJestProject
  });
  const outputChannel = vscode.window.createOutputChannel(
    "Grove Node.js Tests"
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.nodejs.runTests", async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = activeFile ? await findProjectPathForFile(activeFile) : getWorkspaceRoot();
      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running Jest tests...",
          cancellable: false
        },
        async () => {
          const result = await runJestTests({ projectPath });
          if (result.output) {
            outputChannel.clear();
            outputChannel.appendLine(`=== Jest Test Results ===`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            outputChannel.appendLine(`Success: ${result.success}`);
            outputChannel.appendLine(``);
            outputChannel.appendLine(result.output);
          }
          if (result.success) {
            vscode.window.showInformationMessage(
              `Tests passed: ${result.passed}/${result.total}`
            );
          } else {
            const message = result.total === 0 ? `Jest failed to run. Check output for details.` : `Tests failed: ${result.failed}/${result.total}`;
            const action = await vscode.window.showErrorMessage(
              message,
              "Show Output"
            );
            if (action === "Show Output") {
              outputChannel.show();
            }
          }
        }
      );
    }),
    vscode.commands.registerCommand("grove.nodejs.runTestFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file");
        return;
      }
      const filePath = editor.document.uri.fsPath;
      const projectPath = await findProjectPathForFile(filePath);
      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }
      const testFile = path2.relative(projectPath, filePath);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running tests for ${testFile}...`,
          cancellable: false
        },
        async () => {
          const result = await runJestTests({ projectPath, testFile });
          if (result.output) {
            outputChannel.clear();
            outputChannel.appendLine(`=== Jest Test Results: ${testFile} ===`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            outputChannel.appendLine(`Success: ${result.success}`);
            outputChannel.appendLine(``);
            outputChannel.appendLine(result.output);
          }
          if (result.success) {
            vscode.window.showInformationMessage(
              `Tests passed: ${result.passed}/${result.total}`
            );
          } else {
            const message = result.total === 0 ? `Jest failed to run. Check output for details.` : `Tests failed: ${result.failed}/${result.total}`;
            const action = await vscode.window.showErrorMessage(
              message,
              "Show Output"
            );
            if (action === "Show Output") {
              outputChannel.show();
            }
          }
        }
      );
    })
  );
  console.log("Grove for Node.js extension activated");
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
