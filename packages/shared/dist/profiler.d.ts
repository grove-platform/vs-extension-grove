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
//# sourceMappingURL=profiler.d.ts.map