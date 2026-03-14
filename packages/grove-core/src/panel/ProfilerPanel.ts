import * as vscode from "vscode";
import {
  getAllStats,
  getUpdateCount,
  onStatsUpdate,
  isProfilingEnabled,
  type ProfileStats,
} from "@grove/shared";

/**
 * ProfilerPanel displays real-time profiling statistics in a webview.
 * Uses polling to update the display at regular intervals.
 */
export class ProfilerPanel {
  public static readonly viewType = "grove.profilerPanel";
  private static currentPanel: ProfilerPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _pollInterval: ReturnType<typeof setInterval> | undefined;
  private _lastUpdateCount = 0;
  private _unsubscribe: (() => void) | undefined;
  private _sessionStartTime = Date.now();

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    };

    this._panel.webview.html = this._getHtml();

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables,
    );

    // Start polling for updates
    this._startPolling();

    // Subscribe to real-time updates
    this._unsubscribe = onStatsUpdate(() => {
      // Stats updated - the poll interval will pick it up
    });
  }

  public static createOrShow(extensionUri: vscode.Uri): void {
    if (!isProfilingEnabled()) {
      vscode.window.showInformationMessage(
        "Performance profiling is only available in development mode.",
      );
      return;
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, show it
    if (ProfilerPanel.currentPanel) {
      ProfilerPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      ProfilerPanel.viewType,
      "Grove Performance Monitor",
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    ProfilerPanel.currentPanel = new ProfilerPanel(panel, extensionUri);
  }

  public dispose(): void {
    ProfilerPanel.currentPanel = undefined;

    if (this._pollInterval) {
      clearInterval(this._pollInterval);
    }

    if (this._unsubscribe) {
      this._unsubscribe();
    }

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _startPolling(): void {
    // Poll every 500ms for updates
    this._pollInterval = setInterval(() => {
      const currentCount = getUpdateCount();
      if (currentCount !== this._lastUpdateCount) {
        this._lastUpdateCount = currentCount;
        this._sendUpdate();
      }
    }, 500);

    // Send initial data
    this._sendUpdate();
  }

  private _sendUpdate(): void {
    const statsMap = getAllStats();
    // Convert Map to plain object for JSON serialization
    const stats: Record<string, ProfileStats> = {};
    for (const [key, value] of statsMap) {
      stats[key] = value;
    }
    const sessionDuration = Date.now() - this._sessionStartTime;

    this._panel.webview.postMessage({
      command: "updateStats",
      data: {
        stats,
        sessionDurationMs: sessionDuration,
        updateCount: getUpdateCount(),
      },
    });
  }

  private _handleMessage(message: { command: string }): void {
    switch (message.command) {
      case "refresh":
        this._sendUpdate();
        break;
      case "clearStats":
        vscode.commands.executeCommand("grove.clearPerformanceStats");
        setTimeout(() => this._sendUpdate(), 100);
        break;
      case "saveReport":
        vscode.commands.executeCommand("grove.savePerformanceReport");
        break;
    }
  }

  private _getHtml(): string {
    return getProfilerPanelHtml();
  }
}

// Separate function for HTML to keep class concise
function getProfilerPanelHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Grove Performance Monitor</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="header">
    <h1>⚡ Grove Performance Monitor</h1>
    <div class="session-info" id="sessionInfo">Session: 0s | Updates: 0</div>
  </div>
  <div class="toolbar">
    <button onclick="refresh()">🔄 Refresh</button>
    <button onclick="saveReport()">💾 Save Report</button>
    <button onclick="clearStats()">🗑️ Clear</button>
  </div>
  <div class="summary" id="summary"></div>
  <div class="chart-container" id="chartContainer"></div>
  <table class="stats-table">
    <thead>
      <tr>
        <th>Operation</th>
        <th>Count</th>
        <th>Avg (ms)</th>
        <th>Min</th>
        <th>Max</th>
        <th>Last</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody id="statsBody"></tbody>
  </table>
  <script>${getScript()}</script>
</body>
</html>`;
}

function getStyles(): string {
  return `
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
    }
    .header h1 {
      margin: 0;
      font-size: 1.4em;
      font-weight: 600;
    }
    .session-info {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 12px;
      border-radius: 4px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 1.6em;
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .summary-card .label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .chart-container {
      margin-bottom: 16px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      padding: 12px;
    }
    .chart-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .bar-chart { display: flex; flex-direction: column; gap: 6px; }
    .bar-row { display: flex; align-items: center; gap: 8px; }
    .bar-label {
      width: 180px;
      font-size: 0.85em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar-wrapper { flex: 1; height: 20px; background: var(--vscode-input-background); border-radius: 2px; }
    .bar {
      height: 100%;
      background: var(--vscode-progressBar-background);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .bar-value { width: 60px; text-align: right; font-size: 0.85em; }
    .stats-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    .stats-table th, .stats-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .stats-table th {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    .stats-table td:not(:first-child) { text-align: right; font-family: monospace; }
    .stats-table tr:hover { background: var(--vscode-list-hoverBackground); }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
  `;
}

function getScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    let currentData = null;

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateStats') {
        currentData = message.data;
        render();
      }
    });

    function formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
      if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
      return seconds + 's';
    }

    function formatMs(ms) {
      if (ms < 1) return ms.toFixed(2);
      if (ms < 10) return ms.toFixed(1);
      return Math.round(ms).toString();
    }

    function render() {
      if (!currentData) return;

      const { stats, sessionDurationMs, updateCount } = currentData;
      const entries = Object.entries(stats);

      // Update session info
      document.getElementById('sessionInfo').textContent =
        'Session: ' + formatDuration(sessionDurationMs) + ' | Updates: ' + updateCount;

      // Calculate summary
      let totalOps = 0, totalTime = 0;
      entries.forEach(([_, s]) => {
        totalOps += s.count;
        totalTime += s.totalMs;
      });

      // Render summary cards
      const summaryHtml = [
        { value: entries.length, label: 'Operations' },
        { value: totalOps, label: 'Total Calls' },
        { value: formatMs(totalTime), label: 'Total Time (ms)' },
        { value: totalOps > 0 ? formatMs(totalTime / totalOps) : '0', label: 'Avg (ms)' }
      ].map(c => '<div class="summary-card"><div class="value">' + c.value + '</div><div class="label">' + c.label + '</div></div>').join('');
      document.getElementById('summary').innerHTML = summaryHtml;

      // Render bar chart (top 8 by total time)
      const chartContainer = document.getElementById('chartContainer');
      if (entries.length === 0) {
        chartContainer.innerHTML = '<div class="empty-state">No profiling data yet. Perform some operations to see stats.</div>';
      } else {
        const sorted = [...entries].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 8);
        const maxTime = sorted[0][1].totalMs;
        let chartHtml = '<div class="chart-title">Top Operations by Total Time</div><div class="bar-chart">';
        sorted.forEach(([name, s]) => {
          const pct = maxTime > 0 ? (s.totalMs / maxTime * 100) : 0;
          chartHtml += '<div class="bar-row">' +
            '<div class="bar-label" title="' + name + '">' + name + '</div>' +
            '<div class="bar-wrapper"><div class="bar" style="width:' + pct + '%"></div></div>' +
            '<div class="bar-value">' + formatMs(s.totalMs) + '</div></div>';
        });
        chartHtml += '</div>';
        chartContainer.innerHTML = chartHtml;
      }

      // Render table
      const tbody = document.getElementById('statsBody');
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No data</td></tr>';
      } else {
        const sortedByAvg = [...entries].sort((a, b) => (b[1].totalMs / b[1].count) - (a[1].totalMs / a[1].count));
        tbody.innerHTML = sortedByAvg.map(([name, s]) => {
          const avg = s.totalMs / s.count;
          return '<tr>' +
            '<td>' + name + '</td>' +
            '<td>' + s.count + '</td>' +
            '<td>' + formatMs(avg) + '</td>' +
            '<td>' + formatMs(s.minMs) + '</td>' +
            '<td>' + formatMs(s.maxMs) + '</td>' +
            '<td>' + formatMs(s.lastMs) + '</td>' +
            '<td>' + formatMs(s.totalMs) + '</td></tr>';
        }).join('');
      }
    }

    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function clearStats() { vscode.postMessage({ command: 'clearStats' }); }
    function saveReport() { vscode.postMessage({ command: 'saveReport' }); }
  `;
}
