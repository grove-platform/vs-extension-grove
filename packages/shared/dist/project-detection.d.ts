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
/**
 * Find which Grove project contains a given file path.
 * Returns the project whose rootPath is an ancestor of the file.
 */
export declare function findProjectForFile(filePath: string, projects: GroveProject[]): GroveProject | undefined;
//# sourceMappingURL=project-detection.d.ts.map