"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const project_detection_1 = require("../project-detection");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
(0, vitest_1.describe)("detectGroveProjects", () => {
    let tempDir;
    (0, vitest_1.beforeEach)(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await fs.rm(tempDir, { recursive: true });
    });
    (0, vitest_1.it)("should detect a project with snip.js", async () => {
        await fs.writeFile(path.join(tempDir, "snip.js"), "module.exports = {};");
        const projects = await (0, project_detection_1.detectGroveProjects)(tempDir);
        (0, vitest_1.expect)(projects).toHaveLength(1);
        (0, vitest_1.expect)(projects[0].hasValidConfig).toBe(true);
    });
    (0, vitest_1.it)("should detect multiple projects in subdirectories", async () => {
        await fs.mkdir(path.join(tempDir, "node"));
        await fs.mkdir(path.join(tempDir, "python"));
        await fs.writeFile(path.join(tempDir, "node", "snip.js"), "module.exports = {};");
        await fs.writeFile(path.join(tempDir, "python", "snip.js"), "module.exports = {};");
        const projects = await (0, project_detection_1.detectGroveProjects)(tempDir);
        (0, vitest_1.expect)(projects).toHaveLength(2);
    });
    (0, vitest_1.it)("should return empty array when no snip.js found", async () => {
        const projects = await (0, project_detection_1.detectGroveProjects)(tempDir);
        (0, vitest_1.expect)(projects).toHaveLength(0);
    });
    (0, vitest_1.it)("should skip node_modules directories", async () => {
        await fs.mkdir(path.join(tempDir, "node_modules", "some-package"), {
            recursive: true,
        });
        await fs.writeFile(path.join(tempDir, "node_modules", "some-package", "snip.js"), "module.exports = {};");
        const projects = await (0, project_detection_1.detectGroveProjects)(tempDir);
        (0, vitest_1.expect)(projects).toHaveLength(0);
    });
});
(0, vitest_1.describe)("detectLanguage", () => {
    let tempDir;
    (0, vitest_1.beforeEach)(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-test-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await fs.rm(tempDir, { recursive: true });
    });
    (0, vitest_1.it)("should detect nodejs from package.json with jest", async () => {
        await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ devDependencies: { jest: "^29.0.0" } }));
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("nodejs");
    });
    (0, vitest_1.it)("should detect nodejs from package.json with vitest", async () => {
        await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }));
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("nodejs");
    });
    (0, vitest_1.it)("should detect python from pyproject.toml", async () => {
        await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[tool.pytest]");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("python");
    });
    (0, vitest_1.it)("should detect python from pytest.ini", async () => {
        await fs.writeFile(path.join(tempDir, "pytest.ini"), "[pytest]");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("python");
    });
    (0, vitest_1.it)("should detect go from go.mod", async () => {
        await fs.writeFile(path.join(tempDir, "go.mod"), "module example.com/test");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("go");
    });
    (0, vitest_1.it)("should detect java from pom.xml", async () => {
        await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("java");
    });
    (0, vitest_1.it)("should detect java from build.gradle", async () => {
        await fs.writeFile(path.join(tempDir, "build.gradle"), "apply plugin: 'java'");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("java");
    });
    (0, vitest_1.it)("should detect csharp from .csproj file", async () => {
        await fs.writeFile(path.join(tempDir, "MyProject.csproj"), "<Project></Project>");
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBe("csharp");
    });
    (0, vitest_1.it)("should return null when no language detected", async () => {
        const lang = await (0, project_detection_1.detectLanguage)(tempDir);
        (0, vitest_1.expect)(lang).toBeNull();
    });
});
//# sourceMappingURL=project-detection.test.js.map