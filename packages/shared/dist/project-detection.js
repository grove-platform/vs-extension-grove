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
exports.detectGroveProjects = detectGroveProjects;
exports.detectLanguage = detectLanguage;
exports.validateSnipConfig = validateSnipConfig;
exports.findProjectForFile = findProjectForFile;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const types_1 = require("./types");
/**
 * Detect Grove projects by finding snip.js files.
 * @param workspacePath - Absolute path to workspace root
 * @returns Array of detected Grove projects
 */
async function detectGroveProjects(workspacePath) {
    const projects = [];
    const snipFiles = await findSnipFiles(workspacePath);
    for (const snipPath of snipFiles) {
        const projectRoot = path.dirname(snipPath);
        const relativePath = path.relative(workspacePath, projectRoot) || ".";
        const language = await detectLanguage(projectRoot);
        const hasValidConfig = await validateSnipConfig(snipPath);
        projects.push({
            rootPath: projectRoot,
            relativePath,
            displayName: types_1.GROVE_PROJECT_DISPLAY_NAMES[relativePath] ?? relativePath,
            language,
            hasValidConfig,
        });
    }
    return projects;
}
/**
 * Recursively find all snip.js files in the workspace.
 */
async function findSnipFiles(dir, maxDepth = 5) {
    const results = [];
    if (maxDepth <= 0) {
        return results;
    }
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // Skip node_modules and hidden directories
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                    continue;
                }
                const subResults = await findSnipFiles(fullPath, maxDepth - 1);
                results.push(...subResults);
            }
            else if (entry.name === "snip.js") {
                results.push(fullPath);
            }
        }
    }
    catch (error) {
        // Directory not readable, skip
    }
    return results;
}
/**
 * Detect language based on project files.
 */
async function detectLanguage(projectPath) {
    // Check for Node.js (package.json with jest)
    try {
        const pkgPath = path.join(projectPath, "package.json");
        const content = await fs.readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.devDependencies?.jest ||
            pkg.dependencies?.jest ||
            pkg.devDependencies?.vitest ||
            pkg.dependencies?.vitest) {
            return "nodejs";
        }
        // Check for mongosh projects
        if (pkg.name?.includes("mongosh")) {
            return "mongosh";
        }
    }
    catch {
        // No package.json or not readable
    }
    // Check for Python (pyproject.toml or pytest.ini)
    try {
        await fs.access(path.join(projectPath, "pyproject.toml"));
        return "python";
    }
    catch {
        try {
            await fs.access(path.join(projectPath, "pytest.ini"));
            return "python";
        }
        catch {
            // Not Python
        }
    }
    // Check for Go (go.mod)
    try {
        await fs.access(path.join(projectPath, "go.mod"));
        return "go";
    }
    catch {
        // Not Go
    }
    // Check for Java (pom.xml or build.gradle)
    try {
        await fs.access(path.join(projectPath, "pom.xml"));
        return "java";
    }
    catch {
        try {
            await fs.access(path.join(projectPath, "build.gradle"));
            return "java";
        }
        catch {
            // Not Java
        }
    }
    // Check for C# (*.csproj)
    try {
        const entries = await fs.readdir(projectPath);
        if (entries.some((e) => e.endsWith(".csproj"))) {
            return "csharp";
        }
    }
    catch {
        // Not C#
    }
    return null;
}
/**
 * Validate snip.js configuration.
 */
async function validateSnipConfig(snipPath) {
    try {
        const content = await fs.readFile(snipPath, "utf-8");
        // Basic validation: check if it looks like a valid JS module export
        return (content.includes("module.exports") ||
            content.includes("export default") ||
            content.includes("import "));
    }
    catch {
        return false;
    }
}
/**
 * Find which Grove project contains a given file path.
 * Returns the project whose rootPath is an ancestor of the file.
 */
function findProjectForFile(filePath, projects) {
    // Normalize the file path and remove any trailing slashes
    const normalizedFile = path.resolve(filePath).replace(/[/\\]+$/, "");
    // Find all projects that contain this file (file is under project root)
    const matchingProjects = projects.filter((project) => {
        // Normalize and remove trailing slashes for consistent comparison
        const normalizedRoot = path
            .resolve(project.rootPath)
            .replace(/[/\\]+$/, "");
        // Check if file is inside the project directory
        // File must start with root path followed by a path separator
        return (normalizedFile === normalizedRoot ||
            normalizedFile.startsWith(normalizedRoot + path.sep));
    });
    if (matchingProjects.length === 0) {
        return undefined;
    }
    // Return the most specific match (deepest project root)
    return matchingProjects.reduce((best, current) => current.rootPath.length > best.rootPath.length ? current : best);
}
//# sourceMappingURL=project-detection.js.map