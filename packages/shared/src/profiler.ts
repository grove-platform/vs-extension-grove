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

// ============================================================================
// Types
// ============================================================================

export interface ProfileStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
}

interface MarkEntry {
  name: string;
  timestamp: number;
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

// ============================================================================
// Profiler State
// ============================================================================

let _isEnabled = false;
let _stats: Map<string, ProfileStats> = new Map();
let _marks: Map<string, MarkEntry> = new Map();
let _logger: ProfilerLogger | undefined;

// ============================================================================
// Event System
// ============================================================================

type StatsUpdateListener = (name: string, stats: ProfileStats) => void;
let _listeners: Set<StatsUpdateListener> = new Set();
let _updateCount = 0;

/**
 * Subscribe to profiler stat updates.
 * The callback is invoked whenever a timing is recorded.
 *
 * @param listener - Callback function receiving operation name and stats
 * @returns Unsubscribe function
 */
export function onStatsUpdate(listener: StatsUpdateListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Get the total number of stat updates since initialization.
 */
export function getUpdateCount(): number {
  return _updateCount;
}

/**
 * Notify all listeners of a stat update.
 */
function notifyListeners(name: string, stats: ProfileStats): void {
  for (const listener of _listeners) {
    try {
      listener(name, stats);
    } catch {
      // Ignore listener errors
    }
  }
}

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
export function initProfiler(
  context: { extensionMode: vscode.ExtensionMode },
  logger?: ProfilerLogger,
): void {
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
export function isProfilingEnabled(): boolean {
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
export async function profile<T>(
  name: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!_isEnabled) {
    return fn();
  }

  const start = performance.now();
  try {
    return await fn();
  } finally {
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
export function profileSync<T>(name: string, fn: () => T): T {
  if (!_isEnabled) {
    return fn();
  }

  const start = performance.now();
  try {
    return fn();
  } finally {
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
export function mark(name: string): void {
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
export function measure(
  name: string,
  startMark: string,
  endMark?: string,
): number | undefined {
  if (!_isEnabled) {
    return undefined;
  }

  const start = _marks.get(startMark);
  if (!start) {
    return undefined;
  }

  let endTime: number;
  if (endMark) {
    const end = _marks.get(endMark);
    if (!end) {
      return undefined;
    }
    endTime = end.timestamp;
  } else {
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
function recordTiming(name: string, elapsedMs: number): void {
  const existing = _stats.get(name);

  if (existing) {
    existing.count += 1;
    existing.totalMs += elapsedMs;
    existing.minMs = Math.min(existing.minMs, elapsedMs);
    existing.maxMs = Math.max(existing.maxMs, elapsedMs);
    existing.lastMs = elapsedMs;
  } else {
    _stats.set(name, {
      count: 1,
      totalMs: elapsedMs,
      minMs: elapsedMs,
      maxMs: elapsedMs,
      lastMs: elapsedMs,
    });
  }

  // Notify listeners and increment update count
  _updateCount++;
  const stats = _stats.get(name)!;
  notifyListeners(name, stats);
}

// ============================================================================
// Reporting API
// ============================================================================

/**
 * Get statistics for a specific operation.
 */
export function getStats(name: string): ProfileStats | undefined {
  return _stats.get(name);
}

/**
 * Get all collected statistics.
 */
export function getAllStats(): Map<string, ProfileStats> {
  return new Map(_stats);
}

/**
 * Format statistics as a human-readable report.
 */
export function formatReport(): string {
  if (_stats.size === 0) {
    return "No profiling data collected.";
  }

  const lines: string[] = [
    "┌─────────────────────────────────────────────────────────────────────────────┐",
    "│                        Grove Performance Report                            │",
    "├─────────────────────────────────────────────────────────────────────────────┤",
    "│ Operation                          │ Count │   Avg   │   Min   │   Max     │",
    "├─────────────────────────────────────────────────────────────────────────────┤",
  ];

  // Sort by total time descending (most expensive first)
  const sorted = [..._stats.entries()].sort(
    (a, b) => b[1].totalMs - a[1].totalMs,
  );

  for (const [name, stats] of sorted) {
    const avg = stats.totalMs / stats.count;
    const displayName = name.length > 34 ? name.slice(0, 31) + "..." : name;

    lines.push(
      `│ ${displayName.padEnd(34)} │ ${String(stats.count).padStart(5)} │ ${formatMs(avg)} │ ${formatMs(stats.minMs)} │ ${formatMs(stats.maxMs)} │`,
    );
  }

  lines.push(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  return lines.join("\n");
}

/**
 * Format milliseconds for display.
 */
function formatMs(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`.padStart(7);
  } else if (ms < 1000) {
    return `${ms.toFixed(1)}ms`.padStart(7);
  } else {
    return `${(ms / 1000).toFixed(2)}s`.padStart(7);
  }
}

/**
 * Log the performance report to the configured logger.
 */
export function logReport(): void {
  if (!_isEnabled || !_logger) {
    return;
  }
  _logger.info("\n" + formatReport());
}

/**
 * Clear all collected statistics and marks.
 */
export function clearStats(): void {
  _stats.clear();
  _marks.clear();
}

/**
 * Clear specific marks by name.
 */
export function clearMarks(...names: string[]): void {
  for (const name of names) {
    _marks.delete(name);
  }
}

// ============================================================================
// Report Export/Import API
// ============================================================================

let _sessionStartTime: number = Date.now();

/**
 * Reset the session start time. Called automatically by initProfiler.
 */
export function resetSessionStart(): void {
  _sessionStartTime = Date.now();
}

/**
 * Get the current session duration in milliseconds.
 */
export function getSessionDurationMs(): number {
  return Date.now() - _sessionStartTime;
}

/**
 * Export current profiling data as a report.
 *
 * @param options - Optional metadata to include in the report
 * @returns A ProfileReport object ready to be serialized
 */
export function exportReport(options?: {
  label?: string;
  gitCommit?: string;
  gitBranch?: string;
  extensionVersion?: string;
  workspaceFolderCount?: number;
}): ProfileReport {
  const statsObj: Record<string, ProfileStats> = {};
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
export function importReport(json: string | object): ProfileReport | null {
  try {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    // Validate basic structure
    if (
      typeof data !== "object" ||
      data === null ||
      data.version !== 1 ||
      !data.metadata ||
      !data.stats
    ) {
      return null;
    }

    return data as ProfileReport;
  } catch {
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
export function compareReports(
  baseline: ProfileReport,
  current: ProfileReport,
  thresholdPercent: number = 5,
): ReportComparison {
  const operations: OperationComparison[] = [];
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

    let avgChangePercent: number | null = null;
    let avgChangeMs: number | null = null;
    let status: OperationComparison["status"];

    if (!baselineStats) {
      status = "new";
      summary.new++;
    } else if (!currentStats) {
      status = "removed";
      summary.removed++;
    } else {
      const baselineAvg = baselineStats.totalMs / baselineStats.count;
      const currentAvg = currentStats.totalMs / currentStats.count;

      avgChangeMs = currentAvg - baselineAvg;
      avgChangePercent =
        baselineAvg > 0 ? (avgChangeMs / baselineAvg) * 100 : 0;

      if (Math.abs(avgChangePercent) < thresholdPercent) {
        status = "unchanged";
        summary.unchanged++;
      } else if (avgChangePercent > 0) {
        status = "regressed";
        summary.regressed++;
      } else {
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
    return (
      Math.abs(b.avgChangePercent || 0) - Math.abs(a.avgChangePercent || 0)
    );
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
export function formatComparison(comparison: ReportComparison): string {
  const lines: string[] = [
    "┌─────────────────────────────────────────────────────────────────────────────┐",
    "│                     Grove Performance Comparison                           │",
    "├─────────────────────────────────────────────────────────────────────────────┤",
    `│ Baseline: ${(comparison.baseline.label || comparison.baseline.timestamp).slice(0, 30).padEnd(30)} │ Current: ${(comparison.current.label || comparison.current.timestamp).slice(0, 20).padEnd(20)} │`,
    "├─────────────────────────────────────────────────────────────────────────────┤",
    `│ Summary: ✅ ${comparison.summary.improved} improved, ❌ ${comparison.summary.regressed} regressed, ➖ ${comparison.summary.unchanged} unchanged`.padEnd(
      78,
    ) + "│",
    "├─────────────────────────────────────────────────────────────────────────────┤",
    "│ Operation                     │ Status   │ Baseline │ Current  │  Change  │",
    "├─────────────────────────────────────────────────────────────────────────────┤",
  ];

  for (const op of comparison.operations) {
    const displayName =
      op.name.length > 29 ? op.name.slice(0, 26) + "..." : op.name;
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
    const change =
      op.avgChangePercent !== null
        ? `${op.avgChangePercent > 0 ? "+" : ""}${op.avgChangePercent.toFixed(1)}%`.padStart(
            8,
          )
        : "   -   ";

    lines.push(
      `│ ${displayName.padEnd(29)} │ ${statusIcon} │ ${baselineAvg} │ ${currentAvg} │ ${change} │`,
    );
  }

  lines.push(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  return lines.join("\n");
}
