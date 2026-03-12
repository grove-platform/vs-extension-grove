import * as vscode from "vscode";
import type { GroveStatus } from "@grove/shared";

export class GrovePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grove.panel";

  private _view?: vscode.WebviewView;
  private _status: GroveStatus | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _getStatus: () => Promise<GroveStatus>,
  ) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "refresh":
          await this.refresh();
          break;
        case "copyMcpConfig":
          vscode.commands.executeCommand("grove.copyMcpConfig");
          break;
        case "runTests":
          vscode.commands.executeCommand("grove.runTests");
          break;
        case "connectMongo":
          vscode.commands.executeCommand("grove.connectMongo");
          break;
        case "disconnectMongo":
          vscode.commands.executeCommand("grove.disconnectMongo");
          break;
        case "showDatabases":
          vscode.commands.executeCommand("grove.showDatabases");
          break;
      }
    });

    // Refresh when panel becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });

    // Initial refresh
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this._view) return;

    this._status = await this._getStatus();
    this._view.webview.postMessage({
      command: "updateStatus",
      status: this._status,
    });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Grove</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .section { margin-bottom: 16px; }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-textLink-foreground);
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }
    .status-icon { width: 16px; text-align: center; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .setup-wizard {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      padding: 12px;
      margin-bottom: 16px;
    }
    .setup-wizard h3 { margin: 0 0 8px 0; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div id="loading">Loading Grove status...</div>
  <div id="content" class="hidden"></div>
  <script>
    const vscode = acquireVsCodeApi();
    let currentStatus = null;

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateStatus') {
        currentStatus = message.status;
        render();
      }
    });

    function render() {
      const loading = document.getElementById('loading');
      const content = document.getElementById('content');
      if (!currentStatus) {
        loading.classList.remove('hidden');
        content.classList.add('hidden');
        return;
      }
      loading.classList.add('hidden');
      content.classList.remove('hidden');
      let html = '';
      if (!currentStatus.hasProject) {
        html += '<div class="setup-wizard"><h3>No Grove Project Detected</h3><p>Create a snip.js file to get started, or open a folder containing one.</p></div>';
      } else {
        html += '<div class="section"><div class="section-title">Projects</div>';
        html += currentStatus.projects.map(p =>
          '<div class="status-row"><span class="status-icon">' + (p.hasValidConfig ? '✓' : '!') + '</span><span>' + (p.relativePath || 'Root') + '</span><span>(' + (p.language || 'unknown') + ')</span></div>'
        ).join('');
        html += '</div>';
        // MongoDB section with connection status and actions
        html += '<div class="section"><div class="section-title">MongoDB</div>';
        const mongoConnected = currentStatus.mongoConnection.connected;
        const clusterType = currentStatus.mongoConnection.clusterType;
        html += '<div class="status-row"><span class="status-icon">' + (mongoConnected ? '✓' : '○') + '</span>';
        html += '<span>' + (mongoConnected ? 'Connected (' + clusterType + ')' : 'Not connected') + '</span></div>';
        html += '<div class="actions" style="margin-top: 8px;">';
        if (mongoConnected) {
          html += '<button onclick="showDatabases()">Show Databases</button>';
          html += '<button onclick="disconnectMongo()">Disconnect</button>';
        } else {
          html += '<button onclick="connectMongo()" style="grid-column: span 2;">Connect to MongoDB</button>';
        }
        html += '</div></div>';
        // Actions section
        html += '<div class="section"><div class="section-title">Actions</div><div class="actions"><button onclick="runTests()">Run Tests</button><button onclick="refresh()">Refresh</button></div></div>';
      }
      html += '<div class="section"><div class="section-title">AI Integration</div><button onclick="copyMcpConfig()" style="width: 100%;">Copy MCP Config for Augment</button></div>';
      content.innerHTML = html;
    }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function copyMcpConfig() { vscode.postMessage({ command: 'copyMcpConfig' }); }
    function runTests() { vscode.postMessage({ command: 'runTests' }); }
    function connectMongo() { vscode.postMessage({ command: 'connectMongo' }); }
    function disconnectMongo() { vscode.postMessage({ command: 'disconnectMongo' }); }
    function showDatabases() { vscode.postMessage({ command: 'showDatabases' }); }
    refresh();
  </script>
</body>
</html>`;
  }
}
