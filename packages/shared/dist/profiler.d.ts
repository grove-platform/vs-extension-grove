/**
 * Grove Performance Profiler
 *
 * A lightweight performance profiler that only operates in development mode.
 * Use this to measure the performance impact of extension features.
 *
 * In production mode (ExtensionMode.Production), all profiling operations
 * are no-ops with zero overhead.
 */
import type * as vscode from "vscode";
export interface ProfileStats {
    count: number;
    totalMs: number;
    minMs: number;
    maxMs: number;
    lastMs: number;
}
/**
 * Optional logger interface for profiler output.
 * Allows integration with any logging system.
 */
export interface ProfilerLogger {
    info(message: string): void;
}
/**
 * Metadata about a profiling session.
 */
export interface ProfileReportMetadata {
    /** ISO timestamp when the report was created */
    timestamp: string;
    /** Optional label for the report (e.g., "before-optimization") */
    label?: string;
    /** Session duration in milliseconds */
    sessionDurationMs: number;
    /** Git commit hash if available */
    gitCommit?: string;
    /** Git branch name if available */
    gitBranch?: string;
    /** Extension version */
    extensionVersion?: string;
    /** Number of workspace folders */
    workspaceFolderCount?: number;
    /** Total operations recorded */
    totalOperations: number;
}
/**
 * A saved profiling report that can be persisted and compared.
 */
export interface ProfileReport {
    /** Report format version for compatibility */
    version: 1;
    /** Report metadata */
    metadata: ProfileReportMetadata;
    /** Recorded statistics by operation name */
    stats: Record<string, ProfileStats>;
}
/**
 * Comparison result for a single operation.
 */
export interface OperationComparison {
    name: string;
    baseline: ProfileStats | null;
    current: ProfileStats | null;
    /** Percentage change in average time (positive = regression, negative = improvement) */
    avgChangePercent: number | null;
    /** Absolute change in average time (ms) */
    avgChangeMs: number | null;
    /** Status: 'improved', 'regressed', 'unchanged', 'new', 'removed' */
    status: "improved" | "regressed" | "unchanged" | "new" | "removed";
}
/**
 * Result of comparing two profiling reports.
 */
export interface ReportComparison {
    baseline: ProfileReportMetadata;
    current: ProfileReportMetadata;
    operations: OperationComparison[];
    summary: {
        improved: number;
        regressed: number;
        unchanged: number;
        new: number;
        removed: number;
    };
}
/**
 * Initialize the profiler. Call once during extension activation.
 * Profiling is only enabled in Development mode.
 *
 * @param context - VS Code extension context
 * @param logger - Optional logger for output (e.g., LogOutputChannel)
 */
export declare function initProfiler(context: {
    extensionMode: vscode.ExtensionMode;
}, logger?: ProfilerLogger): void;
/**
 * Check if profiling is enabled.
 */
export declare function isProfilingEnabled(): boolean;
/**
 * Profile a synchronous or asynchronous function.
 * Returns the function's result while recording timing statistics.
 *
 * @param name - Identifier for this operation (e.g., "parseSnippetBlocks")
 * @param fn - The function to profile
 * @returns The result of the function
 */
export declare function profile<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
/**
 * Profile a synchronous function.
 * Use this when you know the function is synchronous to avoid async overhead.
 *
 * @param name - Identifier for this operation
 * @param fn - The synchronous function to profile
 * @returns The result of the function
 */
export declare function profileSync<T>(name: string, fn: () => T): T;
/**
 * Create a named timestamp mark.
 * Use with measure() to calculate duration between two points.
 *
 * @param name - Unique name for this mark
 */
export declare function mark(name: string): void;
/**
 * Measure the duration between two marks.
 * Records the measurement as a timing statistic.
 *
 * @param name - Name for this measurement
 * @param startMark - Name of the start mark
 * @param endMark - Name of the end mark (optional, uses current time if omitted)
 * @returns The measured duration in milliseconds, or undefined if marks not found
 */
export declare function measure(name: string, startMark: string, endMark?: string): number | undefined;
/**
 * Get statistics for a specific operation.
 */
export declare function getStats(name: string): ProfileStats | undefined;
/**
 * Get all collected statistics.
 */
export declare function getAllStats(): Map<string, ProfileStats>;
/**
 * Format statistics as a human-readable report.
 */
export declare function formatReport(): string;
/**
 * Log the performance report to the configured logger.
 */
export declare function logReport(): void;
/**
 * Clear all collected statistics and marks.
 */
export declare function clearStats(): void;
/**
 * Clear specific marks by name.
 */
export declare function clearMarks(...names: string[]): void;
/**
 * Reset the session start time. Called automatically by initProfiler.
 */
export declare function resetSessionStart(): void;
/**
 * Get the current session duration in milliseconds.
 */
export declare function getSessionDurationMs(): number;
/**
 * Export current profiling data as a report.
 *
 * @param options - Optional metadata to include in the report
 * @returns A ProfileReport object ready to be serialized
 */
export declare function exportReport(options?: {
    label?: string;
    gitCommit?: string;
    gitBranch?: string;
    extensionVersion?: string;
    workspaceFolderCount?: number;
}): ProfileReport;
/**
 * Import a report from JSON data.
 *
 * @param json - JSON string or parsed object
 * @returns Parsed ProfileReport or null if invalid
 */
export declare function importReport(json: string | object): ProfileReport | null;
/**
 * Compare two profiling reports.
 *
 * @param baseline - The baseline report (e.g., before optimization)
 * @param current - The current report (e.g., after optimization)
 * @param thresholdPercent - Minimum percentage change to consider significant (default: 5%)
 * @returns Comparison results with status for each operation
 */
export declare function compareReports(baseline: ProfileReport, current: ProfileReport, thresholdPercent?: number): ReportComparison;
/**
 * Format a comparison as a human-readable report.
 */
export declare function formatComparison(comparison: ReportComparison): string;
//# sourceMappingURL=profiler.d.ts.map