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
exports.isPathWithinBoundary = isPathWithinBoundary;
exports.sanitizePath = sanitizePath;
exports.validateWorkspacePath = validateWorkspacePath;
const path = __importStar(require("path"));
/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
function isPathWithinBoundary(resolvedPath, basePath) {
    const normalizedResolved = path.normalize(resolvedPath);
    const normalizedBase = path.normalize(basePath);
    return (normalizedResolved.startsWith(normalizedBase + path.sep) ||
        normalizedResolved === normalizedBase);
}
/**
 * Sanitize a relative path by removing dangerous components.
 */
function sanitizePath(relativePath) {
    // Remove null bytes
    let sanitized = relativePath.replace(/\0/g, "");
    // Normalize path separators
    sanitized = sanitized.replace(/\\/g, "/");
    // Remove leading slashes (prevent absolute paths)
    sanitized = sanitized.replace(/^\/+/, "");
    return sanitized;
}
/**
 * Validate that a path is within the workspace boundary.
 * Resolves the path and checks it's within the workspace.
 */
function validateWorkspacePath(filePath, workspacePath) {
    const resolvedPath = path.resolve(filePath);
    return isPathWithinBoundary(resolvedPath, workspacePath);
}
//# sourceMappingURL=security.js.map