export interface GroveProject {
    /** Absolute path to the project root (directory containing snip.js) */
    rootPath: string;
    /** Relative path from workspace root */
    relativePath: string;
    /** Detected language based on project structure */
    language: GroveLanguage | null;
    /** Whether snip.js was successfully parsed */
    hasValidConfig: boolean;
}
export type GroveLanguage = "nodejs" | "python" | "go" | "java" | "csharp" | "mongosh";
export interface GroveStatus {
    /** Whether extension detected a valid Grove project */
    hasProject: boolean;
    /** Currently active project (if multiple exist) */
    activeProject: GroveProject | null;
    /** All detected Grove projects in workspace */
    projects: GroveProject[];
    /** MongoDB connection status (placeholder for now) */
    mongoConnection: {
        connected: boolean;
        clusterType: "Atlas" | "local" | "unknown";
    };
}
//# sourceMappingURL=types.d.ts.map