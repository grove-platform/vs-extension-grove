import { GroveProject, GroveLanguage } from "./types";
/**
 * Detect Grove projects by finding snip.js files.
 * @param workspacePath - Absolute path to workspace root
 * @returns Array of detected Grove projects
 */
export declare function detectGroveProjects(workspacePath: string): Promise<GroveProject[]>;
/**
 * Detect language based on project files.
 */
export declare function detectLanguage(projectPath: string): Promise<GroveLanguage | null>;
/**
 * Validate snip.js configuration.
 */
export declare function validateSnipConfig(snipPath: string): Promise<boolean>;
//# sourceMappingURL=project-detection.d.ts.map