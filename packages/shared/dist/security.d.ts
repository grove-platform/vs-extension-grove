/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export declare function isPathWithinBoundary(resolvedPath: string, basePath: string): boolean;
/**
 * Sanitize a relative path by removing dangerous components.
 */
export declare function sanitizePath(relativePath: string): string;
//# sourceMappingURL=security.d.ts.map