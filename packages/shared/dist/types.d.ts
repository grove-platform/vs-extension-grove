export interface GroveProject {
    /** Absolute path to the project root (directory containing snip.js) */
    rootPath: string;
    /** Relative path from workspace root */
    relativePath: string;
    /** Human-readable display name for UI */
    displayName: string;
    /** Detected language based on project structure */
    language: GroveLanguage | null;
    /**
     * Whether Grove can inject CONNECTION_STRING into this suite's test process.
     * False for nodejs and mongosh, which load .env via shell-level export in
     * their npm test script, overwriting the process env after spawn.
     */
    supportsEnvInjection: boolean;
}
/**
 * Canonical display names for all known Grove projects, keyed by relativePath.
 * Add a new entry here whenever a new code-example-tests project is introduced.
 * Unknown projects fall back to their relativePath.
 */
export declare const GROVE_PROJECT_DISPLAY_NAMES: Record<string, string>;
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
        /** Whether the connection comes from the Grove UI, a .env file, failed to connect, or is absent. */
        source: "ui" | "env-file" | "connection-failed" | "none";
        /**
         * Hostname extracted from the active connection string, for display only.
         * No credentials. E.g. "cluster0.abc.mongodb.net" or "localhost".
         * Undefined when source is "none".
         */
        host?: string;
    };
}
//# sourceMappingURL=types.d.ts.map