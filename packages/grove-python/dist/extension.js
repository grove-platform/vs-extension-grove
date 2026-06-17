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
    exports2.GROVE_PROJECT_DISPLAY_NAMES = void 0;
    exports2.GROVE_PROJECT_DISPLAY_NAMES = {
      "code-example-tests/javascript/driver": "Node.js Driver",
      "code-example-tests/python/pymongo": "PyMongo",
      "code-example-tests/go/driver": "Go Driver",
      "code-example-tests/java/driver-sync": "Java Sync Driver",
      "code-example-tests/csharp/driver": "C# Driver",
      "code-example-tests/command-line/mongosh": "mongosh"
    };
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
    exports2.findProjectForFile = findProjectForFile2;
    var path3 = __importStar(require("path"));
    var fs2 = __importStar(require("fs/promises"));
    var types_1 = require_types();
    function supportsEnvInjection(language) {
      return language !== "nodejs" && language !== "mongosh";
    }
    async function detectGroveProjects2(workspacePath) {
      const projects = [];
      const snipFiles = await findSnipFiles(workspacePath);
      for (const snipPath of snipFiles) {
        const projectRoot = path3.dirname(snipPath);
        const relativePath = path3.relative(workspacePath, projectRoot) || ".";
        const language = await detectLanguage(projectRoot);
        projects.push({
          rootPath: projectRoot,
          relativePath,
          displayName: types_1.GROVE_PROJECT_DISPLAY_NAMES[relativePath] ?? relativePath,
          language,
          supportsEnvInjection: supportsEnvInjection(language)
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
    function findProjectForFile2(filePath, projects) {
      const normalizedFile = path3.resolve(filePath).replace(/[/\\]+$/, "");
      const matchingProjects = projects.filter((project) => {
        const normalizedRoot = path3.resolve(project.rootPath).replace(/[/\\]+$/, "");
        return normalizedFile === normalizedRoot || normalizedFile.startsWith(normalizedRoot + path3.sep);
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
    exports2.validateWorkspacePath = validateWorkspacePath;
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
    function validateWorkspacePath(filePath, workspacePath) {
      const resolvedPath = path3.resolve(filePath);
      return isPathWithinBoundary(resolvedPath, workspacePath);
    }
  }
});

// ../shared/dist/profiler.js
var require_profiler = __commonJS({
  "../shared/dist/profiler.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.onStatsUpdate = onStatsUpdate;
    exports2.getUpdateCount = getUpdateCount;
    exports2.initProfiler = initProfiler;
    exports2.isProfilingEnabled = isProfilingEnabled;
    exports2.profile = profile2;
    exports2.profileSync = profileSync;
    exports2.mark = mark;
    exports2.measure = measure;
    exports2.getStats = getStats;
    exports2.getAllStats = getAllStats;
    exports2.formatReport = formatReport;
    exports2.logReport = logReport;
    exports2.clearStats = clearStats;
    exports2.clearMarks = clearMarks;
    exports2.resetSessionStart = resetSessionStart;
    exports2.getSessionDurationMs = getSessionDurationMs;
    exports2.exportReport = exportReport;
    exports2.importReport = importReport;
    exports2.compareReports = compareReports;
    exports2.formatComparison = formatComparison;
    var _isEnabled = false;
    var _stats = /* @__PURE__ */ new Map();
    var _marks = /* @__PURE__ */ new Map();
    var _logger;
    var _listeners = /* @__PURE__ */ new Set();
    var _updateCount = 0;
    function onStatsUpdate(listener) {
      _listeners.add(listener);
      return () => {
        _listeners.delete(listener);
      };
    }
    function getUpdateCount() {
      return _updateCount;
    }
    function notifyListeners(name, stats) {
      for (const listener of _listeners) {
        try {
          listener(name, stats);
        } catch {
        }
      }
    }
    var EXTENSION_MODE_DEVELOPMENT = 2;
    function initProfiler(context, logger) {
      _isEnabled = context.extensionMode === EXTENSION_MODE_DEVELOPMENT;
      _stats.clear();
      _marks.clear();
      _logger = logger;
      _sessionStartTime = Date.now();
      if (_isEnabled && _logger) {
        _logger.info("Performance profiler enabled (development mode)");
      }
    }
    function isProfilingEnabled() {
      return _isEnabled;
    }
    async function profile2(name, fn) {
      if (!_isEnabled) {
        return fn();
      }
      const start = performance.now();
      try {
        return await fn();
      } finally {
        const elapsed = performance.now() - start;
        recordTiming(name, elapsed);
      }
    }
    function profileSync(name, fn) {
      if (!_isEnabled) {
        return fn();
      }
      const start = performance.now();
      try {
        return fn();
      } finally {
        const elapsed = performance.now() - start;
        recordTiming(name, elapsed);
      }
    }
    function mark(name) {
      if (!_isEnabled) {
        return;
      }
      _marks.set(name, {
        name,
        timestamp: performance.now()
      });
    }
    function measure(name, startMark, endMark) {
      if (!_isEnabled) {
        return void 0;
      }
      const start = _marks.get(startMark);
      if (!start) {
        return void 0;
      }
      let endTime;
      if (endMark) {
        const end = _marks.get(endMark);
        if (!end) {
          return void 0;
        }
        endTime = end.timestamp;
      } else {
        endTime = performance.now();
      }
      const elapsed = endTime - start.timestamp;
      recordTiming(name, elapsed);
      return elapsed;
    }
    function recordTiming(name, elapsedMs) {
      const existing = _stats.get(name);
      if (existing) {
        existing.count += 1;
        existing.totalMs += elapsedMs;
        existing.minMs = Math.min(existing.minMs, elapsedMs);
        existing.maxMs = Math.max(existing.maxMs, elapsedMs);
        existing.lastMs = elapsedMs;
      } else {
        _stats.set(name, {
          count: 1,
          totalMs: elapsedMs,
          minMs: elapsedMs,
          maxMs: elapsedMs,
          lastMs: elapsedMs
        });
      }
      _updateCount++;
      const stats = _stats.get(name);
      notifyListeners(name, stats);
    }
    function getStats(name) {
      return _stats.get(name);
    }
    function getAllStats() {
      return new Map(_stats);
    }
    function formatReport() {
      if (_stats.size === 0) {
        return "No profiling data collected.";
      }
      const lines = [
        "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
        "\u2502                        Grove Performance Report                            \u2502",
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
        "\u2502 Operation                          \u2502 Count \u2502   Avg   \u2502   Min   \u2502   Max     \u2502",
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524"
      ];
      const sorted = [..._stats.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
      for (const [name, stats] of sorted) {
        const avg = stats.totalMs / stats.count;
        const displayName = name.length > 34 ? name.slice(0, 31) + "..." : name;
        lines.push(`\u2502 ${displayName.padEnd(34)} \u2502 ${String(stats.count).padStart(5)} \u2502 ${formatMs(avg)} \u2502 ${formatMs(stats.minMs)} \u2502 ${formatMs(stats.maxMs)} \u2502`);
      }
      lines.push("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
      return lines.join("\n");
    }
    function formatMs(ms) {
      if (ms < 1) {
        return `${(ms * 1e3).toFixed(0)}\xB5s`.padStart(7);
      } else if (ms < 1e3) {
        return `${ms.toFixed(1)}ms`.padStart(7);
      } else {
        return `${(ms / 1e3).toFixed(2)}s`.padStart(7);
      }
    }
    function logReport() {
      if (!_isEnabled || !_logger) {
        return;
      }
      _logger.info("\n" + formatReport());
    }
    function clearStats() {
      _stats.clear();
      _marks.clear();
    }
    function clearMarks(...names) {
      for (const name of names) {
        _marks.delete(name);
      }
    }
    var _sessionStartTime = Date.now();
    function resetSessionStart() {
      _sessionStartTime = Date.now();
    }
    function getSessionDurationMs() {
      return Date.now() - _sessionStartTime;
    }
    function exportReport(options) {
      const statsObj = {};
      let totalOperations = 0;
      for (const [name, stats] of _stats) {
        statsObj[name] = { ...stats };
        totalOperations += stats.count;
      }
      return {
        version: 1,
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          label: options?.label,
          sessionDurationMs: getSessionDurationMs(),
          gitCommit: options?.gitCommit,
          gitBranch: options?.gitBranch,
          extensionVersion: options?.extensionVersion,
          workspaceFolderCount: options?.workspaceFolderCount,
          totalOperations
        },
        stats: statsObj
      };
    }
    function importReport(json) {
      try {
        const data = typeof json === "string" ? JSON.parse(json) : json;
        if (typeof data !== "object" || data === null || data.version !== 1 || !data.metadata || !data.stats) {
          return null;
        }
        return data;
      } catch {
        return null;
      }
    }
    function compareReports(baseline, current, thresholdPercent = 5) {
      const operations = [];
      const summary = {
        improved: 0,
        regressed: 0,
        unchanged: 0,
        new: 0,
        removed: 0
      };
      const allNames = /* @__PURE__ */ new Set([
        ...Object.keys(baseline.stats),
        ...Object.keys(current.stats)
      ]);
      for (const name of allNames) {
        const baselineStats = baseline.stats[name] || null;
        const currentStats = current.stats[name] || null;
        let avgChangePercent = null;
        let avgChangeMs = null;
        let status;
        if (!baselineStats) {
          status = "new";
          summary.new++;
        } else if (!currentStats) {
          status = "removed";
          summary.removed++;
        } else {
          const baselineAvg = baselineStats.totalMs / baselineStats.count;
          const currentAvg = currentStats.totalMs / currentStats.count;
          avgChangeMs = currentAvg - baselineAvg;
          avgChangePercent = baselineAvg > 0 ? avgChangeMs / baselineAvg * 100 : 0;
          if (Math.abs(avgChangePercent) < thresholdPercent) {
            status = "unchanged";
            summary.unchanged++;
          } else if (avgChangePercent > 0) {
            status = "regressed";
            summary.regressed++;
          } else {
            status = "improved";
            summary.improved++;
          }
        }
        operations.push({
          name,
          baseline: baselineStats,
          current: currentStats,
          avgChangePercent,
          avgChangeMs,
          status
        });
      }
      operations.sort((a, b) => {
        const statusOrder = {
          regressed: 0,
          new: 1,
          unchanged: 2,
          improved: 3,
          removed: 4
        };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return Math.abs(b.avgChangePercent || 0) - Math.abs(a.avgChangePercent || 0);
      });
      return {
        baseline: baseline.metadata,
        current: current.metadata,
        operations,
        summary
      };
    }
    function formatComparison(comparison) {
      const lines = [
        "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
        "\u2502                     Grove Performance Comparison                           \u2502",
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
        `\u2502 Baseline: ${(comparison.baseline.label || comparison.baseline.timestamp).slice(0, 30).padEnd(30)} \u2502 Current: ${(comparison.current.label || comparison.current.timestamp).slice(0, 20).padEnd(20)} \u2502`,
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
        `\u2502 Summary: \u2705 ${comparison.summary.improved} improved, \u274C ${comparison.summary.regressed} regressed, \u2796 ${comparison.summary.unchanged} unchanged`.padEnd(78) + "\u2502",
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
        "\u2502 Operation                     \u2502 Status   \u2502 Baseline \u2502 Current  \u2502  Change  \u2502",
        "\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524"
      ];
      for (const op of comparison.operations) {
        const displayName = op.name.length > 29 ? op.name.slice(0, 26) + "..." : op.name;
        const statusIcon = {
          improved: "\u2705 better",
          regressed: "\u274C slower",
          unchanged: "\u2796 same  ",
          new: "\u{1F195} new   ",
          removed: "\u{1F5D1}\uFE0F gone  "
        }[op.status];
        const baselineAvg = op.baseline ? formatMs(op.baseline.totalMs / op.baseline.count) : "   -   ";
        const currentAvg = op.current ? formatMs(op.current.totalMs / op.current.count) : "   -   ";
        const change = op.avgChangePercent !== null ? `${op.avgChangePercent > 0 ? "+" : ""}${op.avgChangePercent.toFixed(1)}%`.padStart(8) : "   -   ";
        lines.push(`\u2502 ${displayName.padEnd(29)} \u2502 ${statusIcon} \u2502 ${baselineAvg} \u2502 ${currentAvg} \u2502 ${change} \u2502`);
      }
      lines.push("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
      return lines.join("\n");
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
    __exportStar(require_profiler(), exports2);
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
var VENV_PYTHON_CANDIDATES = [
  ".venv/bin/python",
  "venv/bin/python",
  ".venv/Scripts/python.exe",
  "venv/Scripts/python.exe"
];
var UNITTEST_DISCOVER_DIRS = ["tests_package"];
function getSystemPythonBin() {
  return process.platform === "win32" ? "python" : "python3";
}
async function resolvePythonBin(projectPath, pythonPath, fallbackPythonPath) {
  const explicit = pythonPath?.trim();
  if (explicit) {
    return explicit;
  }
  for (const relative2 of VENV_PYTHON_CANDIDATES) {
    const candidate = path.join(projectPath, relative2);
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
    }
  }
  const fallback = fallbackPythonPath?.trim();
  if (fallback) {
    return fallback;
  }
  return getSystemPythonBin();
}
async function detectPythonProject(projectPath) {
  try {
    await fs.access(path.join(projectPath, "pyproject.toml"));
    return true;
  } catch {
    try {
      await fs.access(path.join(projectPath, "pytest.ini"));
      return true;
    } catch {
      return false;
    }
  }
}
async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
async function usesPytest(projectPath) {
  if (await pathExists(path.join(projectPath, "pytest.ini"))) {
    return true;
  }
  try {
    const content = await fs.readFile(
      path.join(projectPath, "pyproject.toml"),
      "utf-8"
    );
    return /\[tool\.pytest(?:\.ini_options)?\]/m.test(content);
  } catch {
    return false;
  }
}
async function resolveUnittestDiscoverDir(projectPath) {
  for (const dir of UNITTEST_DISCOVER_DIRS) {
    if (await pathExists(path.join(projectPath, dir))) {
      return dir;
    }
  }
  return void 0;
}
function buildTestArgs(framework, options) {
  const { testFile, testNamePattern, unittestDiscoverDir } = options;
  if (framework === "pytest") {
    const args2 = ["-m", "pytest", "--tb=short", "-q"];
    if (testFile) {
      args2.push(testFile);
    }
    if (testNamePattern) {
      args2.push("-k", testNamePattern);
    }
    return args2;
  }
  if (testFile) {
    return ["-m", "unittest", testFile];
  }
  const discoverDir = unittestDiscoverDir ?? "tests_package";
  const args = ["-m", "unittest", "discover", discoverDir];
  if (testNamePattern) {
    args.push("-k", testNamePattern);
  }
  return args;
}
async function runPythonTests(options) {
  const {
    projectPath,
    testFile,
    timeout = DEFAULT_TIMEOUT,
    env,
    testNamePattern,
    pythonPath,
    fallbackPythonPath
  } = options;
  const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT);
  const pythonBin = await resolvePythonBin(
    projectPath,
    pythonPath,
    fallbackPythonPath
  );
  const unittestDiscoverDir = await resolveUnittestDiscoverDir(projectPath);
  const framework = await usesPytest(projectPath) ? "pytest" : unittestDiscoverDir ? "unittest" : "pytest";
  const args = buildTestArgs(framework, {
    testFile,
    testNamePattern,
    unittestDiscoverDir
  });
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = `Using Python: ${pythonBin}

`;
    let timedOut = false;
    let settled = false;
    const proc = (0, import_child_process.spawn)(pythonBin, args, {
      cwd: projectPath,
      env: { ...process.env, CI: "true", ...env }
    });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, effectiveTimeout);
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });
    proc.on("error", (err) => {
      finish({
        success: false,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        output: `Failed to launch Python: ${err.message}
Interpreter: ${pythonBin}

${output}`,
        duration: Date.now() - startTime
      });
    });
    proc.on("close", (code) => {
      if (settled) {
        return;
      }
      const duration = Date.now() - startTime;
      if (timedOut) {
        finish({
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
      const counts = framework === "unittest" ? parseUnittestOutput(output) : parsePytestOutput(output);
      finish({
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
function parsePytestOutput(output) {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const lines = output.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!/\d+\s+(passed|failed|skipped|error)/i.test(line)) {
      continue;
    }
    const passed = line.match(/(\d+)\s+passed/i);
    const failed = line.match(/(\d+)\s+failed/i);
    const skipped = line.match(/(\d+)\s+skipped/i);
    const errors = line.match(/(\d+)\s+error/i);
    const passedCount = passed ? parseInt(passed[1], 10) : 0;
    const failedCount = (failed ? parseInt(failed[1], 10) : 0) + (errors ? parseInt(errors[1], 10) : 0);
    const skippedCount = skipped ? parseInt(skipped[1], 10) : 0;
    if (passedCount + failedCount + skippedCount === 0) {
      continue;
    }
    return {
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      total: passedCount + failedCount + skippedCount
    };
  }
  return defaults;
}
function parseUnittestOutput(output) {
  const defaults = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const ran = output.match(/Ran\s+(\d+)\s+tests?\s+in/i);
  if (!ran) {
    return defaults;
  }
  const total = parseInt(ran[1], 10);
  const failures = output.match(/failures=(\d+)/i);
  const errors = output.match(/errors=(\d+)/i);
  const skipped = output.match(/skipped=(\d+)/i);
  const failed = (failures ? parseInt(failures[1], 10) : 0) + (errors ? parseInt(errors[1], 10) : 0);
  const skippedCount = skipped ? parseInt(skipped[1], 10) : 0;
  return {
    total,
    passed: Math.max(0, total - failed - skippedCount),
    failed,
    skipped: skippedCount
  };
}

// src/extension.ts
var import_shared = __toESM(require_dist());
function getWorkspaceRoot() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath || "";
}
function getConfiguredPythonPath() {
  const fromPythonExt = vscode.workspace.getConfiguration("python").get("defaultInterpreterPath")?.trim();
  return fromPythonExt || void 0;
}
function runPythonWithConfiguredInterpreter(options) {
  return runPythonTests({
    ...options,
    fallbackPythonPath: options.fallbackPythonPath ?? getConfiguredPythonPath()
  });
}
async function findProjectPathForFile(filePath) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return "";
  const projects = await (0, import_shared.detectGroveProjects)(workspaceRoot);
  const project = (0, import_shared.findProjectForFile)(filePath, projects);
  return project?.rootPath || workspaceRoot;
}
function showTestResult(result, outputChannel, header) {
  if (result.output) {
    outputChannel.clear();
    outputChannel.appendLine(header);
    outputChannel.appendLine(`Duration: ${result.duration}ms`);
    outputChannel.appendLine(`Success: ${result.success}`);
    outputChannel.appendLine(``);
    outputChannel.appendLine(result.output);
  }
  if (result.success) {
    vscode.window.showInformationMessage(
      `Tests passed: ${result.passed}/${result.total}`
    );
    return;
  }
  const message = result.total === 0 ? `Python tests failed to run. Check output for details.` : `Tests failed: ${result.failed}/${result.total}`;
  void vscode.window.showErrorMessage(message, "Show Output").then((action) => {
    if (action === "Show Output") {
      outputChannel.show();
    }
  });
}
async function activate(context) {
  console.log("Grove for Python extension activating...");
  const groveCore = vscode.extensions.getExtension(
    "GrovePlatform.grove-platform-core"
  );
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
    language: "python",
    name: "Python",
    run: runPythonWithConfiguredInterpreter,
    detect: detectPythonProject
  });
  const outputChannel = vscode.window.createOutputChannel(
    "Grove Python Tests"
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.python.runTests", async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const projectPath = activeFile ? await findProjectPathForFile(activeFile) : getWorkspaceRoot();
      if (!projectPath) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running Python tests...",
          cancellable: false
        },
        async () => {
          const result = await (0, import_shared.profile)(
            "Python.runPythonTests",
            () => runPythonWithConfiguredInterpreter({ projectPath })
          );
          showTestResult(result, outputChannel, "=== Python Test Results ===");
        }
      );
    }),
    vscode.commands.registerCommand("grove.python.runTestFile", async () => {
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
          const result = await (0, import_shared.profile)(
            "Python.runPythonTestFile",
            () => runPythonWithConfiguredInterpreter({ projectPath, testFile })
          );
          showTestResult(
            result,
            outputChannel,
            `=== Python Test Results: ${testFile} ===`
          );
        }
      );
    })
  );
  console.log("Grove for Python extension activated");
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
