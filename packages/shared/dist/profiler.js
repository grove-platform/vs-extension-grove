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
//# sourceMappingURL=profiler.js.map