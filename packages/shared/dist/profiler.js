"use strict";
/**
 * Grove Performance Profiler
 *
 * A lightweight performance profiler that only operates in development mode.
 * Use this to measure the performance impact of extension features.
 *
 * In production mode (ExtensionMode.Production), all profiling operations
 * are no-ops with zero overhead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initProfiler = initProfiler;
exports.isProfilingEnabled = isProfilingEnabled;
exports.profile = profile;
exports.profileSync = profileSync;
exports.mark = mark;
exports.measure = measure;
exports.getStats = getStats;
exports.getAllStats = getAllStats;
exports.formatReport = formatReport;
exports.logReport = logReport;
exports.clearStats = clearStats;
exports.clearMarks = clearMarks;
exports.resetSessionStart = resetSessionStart;
exports.getSessionDurationMs = getSessionDurationMs;
exports.exportReport = exportReport;
exports.importReport = importReport;
exports.compareReports = compareReports;
exports.formatComparison = formatComparison;
// ============================================================================
// Profiler State
// ============================================================================
let _isEnabled = false;
let _stats = new Map();
let _marks = new Map();
let _logger;
// ============================================================================
// Initialization
// ============================================================================
/** ExtensionMode.Development value from vscode API */
const EXTENSION_MODE_DEVELOPMENT = 2;
/**
 * Initialize the profiler. Call once during extension activation.
 * Profiling is only enabled in Development mode.
 *
 * @param context - VS Code extension context
 * @param logger - Optional logger for output (e.g., LogOutputChannel)
 */
function initProfiler(context, logger) {
    _isEnabled = context.extensionMode === EXTENSION_MODE_DEVELOPMENT;
    _stats.clear();
    _marks.clear();
    _logger = logger;
    _sessionStartTime = Date.now();
    if (_isEnabled && _logger) {
        _logger.info("Performance profiler enabled (development mode)");
    }
}
/**
 * Check if profiling is enabled.
 */
function isProfilingEnabled() {
    return _isEnabled;
}
// ============================================================================
// Core Profiling API
// ============================================================================
/**
 * Profile a synchronous or asynchronous function.
 * Returns the function's result while recording timing statistics.
 *
 * @param name - Identifier for this operation (e.g., "parseSnippetBlocks")
 * @param fn - The function to profile
 * @returns The result of the function
 */
async function profile(name, fn) {
    if (!_isEnabled) {
        return fn();
    }
    const start = performance.now();
    try {
        return await fn();
    }
    finally {
        const elapsed = performance.now() - start;
        recordTiming(name, elapsed);
    }
}
/**
 * Profile a synchronous function.
 * Use this when you know the function is synchronous to avoid async overhead.
 *
 * @param name - Identifier for this operation
 * @param fn - The synchronous function to profile
 * @returns The result of the function
 */
function profileSync(name, fn) {
    if (!_isEnabled) {
        return fn();
    }
    const start = performance.now();
    try {
        return fn();
    }
    finally {
        const elapsed = performance.now() - start;
        recordTiming(name, elapsed);
    }
}
/**
 * Create a named timestamp mark.
 * Use with measure() to calculate duration between two points.
 *
 * @param name - Unique name for this mark
 */
function mark(name) {
    if (!_isEnabled) {
        return;
    }
    _marks.set(name, {
        name,
        timestamp: performance.now(),
    });
}
/**
 * Measure the duration between two marks.
 * Records the measurement as a timing statistic.
 *
 * @param name - Name for this measurement
 * @param startMark - Name of the start mark
 * @param endMark - Name of the end mark (optional, uses current time if omitted)
 * @returns The measured duration in milliseconds, or undefined if marks not found
 */
function measure(name, startMark, endMark) {
    if (!_isEnabled) {
        return undefined;
    }
    const start = _marks.get(startMark);
    if (!start) {
        return undefined;
    }
    let endTime;
    if (endMark) {
        const end = _marks.get(endMark);
        if (!end) {
            return undefined;
        }
        endTime = end.timestamp;
    }
    else {
        endTime = performance.now();
    }
    const elapsed = endTime - start.timestamp;
    recordTiming(name, elapsed);
    return elapsed;
}
// ============================================================================
// Internal Helpers
// ============================================================================
/**
 * Record a timing measurement for the given operation name.
 */
function recordTiming(name, elapsedMs) {
    const existing = _stats.get(name);
    if (existing) {
        existing.count += 1;
        existing.totalMs += elapsedMs;
        existing.minMs = Math.min(existing.minMs, elapsedMs);
        existing.maxMs = Math.max(existing.maxMs, elapsedMs);
        existing.lastMs = elapsedMs;
    }
    else {
        _stats.set(name, {
            count: 1,
            totalMs: elapsedMs,
            minMs: elapsedMs,
            maxMs: elapsedMs,
            lastMs: elapsedMs,
        });
    }
}
// ============================================================================
// Reporting API
// ============================================================================
/**
 * Get statistics for a specific operation.
 */
function getStats(name) {
    return _stats.get(name);
}
/**
 * Get all collected statistics.
 */
function getAllStats() {
    return new Map(_stats);
}
/**
 * Format statistics as a human-readable report.
 */
function formatReport() {
    if (_stats.size === 0) {
        return "No profiling data collected.";
    }
    const lines = [
        "┌─────────────────────────────────────────────────────────────────────────────┐",
        "│                        Grove Performance Report                            │",
        "├─────────────────────────────────────────────────────────────────────────────┤",
        "│ Operation                          │ Count │   Avg   │   Min   │   Max     │",
        "├─────────────────────────────────────────────────────────────────────────────┤",
    ];
    // Sort by total time descending (most expensive first)
    const sorted = [..._stats.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
    for (const [name, stats] of sorted) {
        const avg = stats.totalMs / stats.count;
        const displayName = name.length > 34 ? name.slice(0, 31) + "..." : name;
        lines.push(`│ ${displayName.padEnd(34)} │ ${String(stats.count).padStart(5)} │ ${formatMs(avg)} │ ${formatMs(stats.minMs)} │ ${formatMs(stats.maxMs)} │`);
    }
    lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
    return lines.join("\n");
}
/**
 * Format milliseconds for display.
 */
function formatMs(ms) {
    if (ms < 1) {
        return `${(ms * 1000).toFixed(0)}µs`.padStart(7);
    }
    else if (ms < 1000) {
        return `${ms.toFixed(1)}ms`.padStart(7);
    }
    else {
        return `${(ms / 1000).toFixed(2)}s`.padStart(7);
    }
}
/**
 * Log the performance report to the configured logger.
 */
function logReport() {
    if (!_isEnabled || !_logger) {
        return;
    }
    _logger.info("\n" + formatReport());
}
/**
 * Clear all collected statistics and marks.
 */
function clearStats() {
    _stats.clear();
    _marks.clear();
}
/**
 * Clear specific marks by name.
 */
function clearMarks(...names) {
    for (const name of names) {
        _marks.delete(name);
    }
}
// ============================================================================
// Report Export/Import API
// ============================================================================
let _sessionStartTime = Date.now();
/**
 * Reset the session start time. Called automatically by initProfiler.
 */
function resetSessionStart() {
    _sessionStartTime = Date.now();
}
/**
 * Get the current session duration in milliseconds.
 */
function getSessionDurationMs() {
    return Date.now() - _sessionStartTime;
}
/**
 * Export current profiling data as a report.
 *
 * @param options - Optional metadata to include in the report
 * @returns A ProfileReport object ready to be serialized
 */
function exportReport(options) {
    const statsObj = {};
    let totalOperations = 0;
    for (const [name, stats] of _stats) {
        statsObj[name] = { ...stats };
        totalOperations += stats.count;
    }
    return {
        version: 1,
        metadata: {
            timestamp: new Date().toISOString(),
            label: options?.label,
            sessionDurationMs: getSessionDurationMs(),
            gitCommit: options?.gitCommit,
            gitBranch: options?.gitBranch,
            extensionVersion: options?.extensionVersion,
            workspaceFolderCount: options?.workspaceFolderCount,
            totalOperations,
        },
        stats: statsObj,
    };
}
/**
 * Import a report from JSON data.
 *
 * @param json - JSON string or parsed object
 * @returns Parsed ProfileReport or null if invalid
 */
function importReport(json) {
    try {
        const data = typeof json === "string" ? JSON.parse(json) : json;
        // Validate basic structure
        if (typeof data !== "object" ||
            data === null ||
            data.version !== 1 ||
            !data.metadata ||
            !data.stats) {
            return null;
        }
        return data;
    }
    catch {
        return null;
    }
}
/**
 * Compare two profiling reports.
 *
 * @param baseline - The baseline report (e.g., before optimization)
 * @param current - The current report (e.g., after optimization)
 * @param thresholdPercent - Minimum percentage change to consider significant (default: 5%)
 * @returns Comparison results with status for each operation
 */
function compareReports(baseline, current, thresholdPercent = 5) {
    const operations = [];
    const summary = {
        improved: 0,
        regressed: 0,
        unchanged: 0,
        new: 0,
        removed: 0,
    };
    // Get all unique operation names
    const allNames = new Set([
        ...Object.keys(baseline.stats),
        ...Object.keys(current.stats),
    ]);
    for (const name of allNames) {
        const baselineStats = baseline.stats[name] || null;
        const currentStats = current.stats[name] || null;
        let avgChangePercent = null;
        let avgChangeMs = null;
        let status;
        if (!baselineStats) {
            status = "new";
            summary.new++;
        }
        else if (!currentStats) {
            status = "removed";
            summary.removed++;
        }
        else {
            const baselineAvg = baselineStats.totalMs / baselineStats.count;
            const currentAvg = currentStats.totalMs / currentStats.count;
            avgChangeMs = currentAvg - baselineAvg;
            avgChangePercent =
                baselineAvg > 0 ? (avgChangeMs / baselineAvg) * 100 : 0;
            if (Math.abs(avgChangePercent) < thresholdPercent) {
                status = "unchanged";
                summary.unchanged++;
            }
            else if (avgChangePercent > 0) {
                status = "regressed";
                summary.regressed++;
            }
            else {
                status = "improved";
                summary.improved++;
            }
        }
        operations.push({
            name,
            baseline: baselineStats,
            current: currentStats,
            avgChangePercent,
            avgChangeMs,
            status,
        });
    }
    // Sort: regressions first, then by absolute change
    operations.sort((a, b) => {
        const statusOrder = {
            regressed: 0,
            new: 1,
            unchanged: 2,
            improved: 3,
            removed: 4,
        };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        return (Math.abs(b.avgChangePercent || 0) - Math.abs(a.avgChangePercent || 0));
    });
    return {
        baseline: baseline.metadata,
        current: current.metadata,
        operations,
        summary,
    };
}
/**
 * Format a comparison as a human-readable report.
 */
function formatComparison(comparison) {
    const lines = [
        "┌─────────────────────────────────────────────────────────────────────────────┐",
        "│                     Grove Performance Comparison                           │",
        "├─────────────────────────────────────────────────────────────────────────────┤",
        `│ Baseline: ${(comparison.baseline.label || comparison.baseline.timestamp).slice(0, 30).padEnd(30)} │ Current: ${(comparison.current.label || comparison.current.timestamp).slice(0, 20).padEnd(20)} │`,
        "├─────────────────────────────────────────────────────────────────────────────┤",
        `│ Summary: ✅ ${comparison.summary.improved} improved, ❌ ${comparison.summary.regressed} regressed, ➖ ${comparison.summary.unchanged} unchanged`.padEnd(78) + "│",
        "├─────────────────────────────────────────────────────────────────────────────┤",
        "│ Operation                     │ Status   │ Baseline │ Current  │  Change  │",
        "├─────────────────────────────────────────────────────────────────────────────┤",
    ];
    for (const op of comparison.operations) {
        const displayName = op.name.length > 29 ? op.name.slice(0, 26) + "..." : op.name;
        const statusIcon = {
            improved: "✅ better",
            regressed: "❌ slower",
            unchanged: "➖ same  ",
            new: "🆕 new   ",
            removed: "🗑️ gone  ",
        }[op.status];
        const baselineAvg = op.baseline
            ? formatMs(op.baseline.totalMs / op.baseline.count)
            : "   -   ";
        const currentAvg = op.current
            ? formatMs(op.current.totalMs / op.current.count)
            : "   -   ";
        const change = op.avgChangePercent !== null
            ? `${op.avgChangePercent > 0 ? "+" : ""}${op.avgChangePercent.toFixed(1)}%`.padStart(8)
            : "   -   ";
        lines.push(`│ ${displayName.padEnd(29)} │ ${statusIcon} │ ${baselineAvg} │ ${currentAvg} │ ${change} │`);
    }
    lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
    return lines.join("\n");
}
//# sourceMappingURL=profiler.js.map