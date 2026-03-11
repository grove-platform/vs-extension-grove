/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export declare function isPathWithinBoundary(resolvedPath: string, basePath: string): boolean;
/**
 * Sanitize a relative path by removing dangerous components.
 */
export declare function sanitizePath(relativePath: string): string;
/**
 * Validate that a path is within the workspace boundary.
 * Resolves the path and checks it's within the workspace.
 */
export declare function validateWorkspacePath(filePath: string, workspacePath: string): boolean;
//# sourceMappingURL=security.d.ts.map