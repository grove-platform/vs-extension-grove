import * as vscode from "vscode";
import type { GroveStatus } from "@grove/shared";
import { getNonce } from "./nonce";

/**
 * Open Claude Code with the given slash command pre-filled. Best-effort —
 * falls back to opening the sidebar if primaryEditor.open rejects, and
 * silently no-ops if the Claude Code extension isn't available.
 */
async function openSkillInClaude(skill: string): Promise<void> {
  const slashCommand = `/${skill}`;
  let opened = false;
  try {
    await vscode.commands.executeCommand(
      "claude-vscode.primaryEditor.open",
      undefined,
      slashCommand,
    );
    opened = true;
  } catch {
    try {
      await vscode.commands.executeCommand("claude-vscode.sidebar.open");
    } catch {
      // Claude Code not installed — show actionable guidance instead
      vscode.window.showWarningMessage(
        `Claude Code extension not found. Install it, then type ${slashCommand} in the Claude Code panel.`,
      );
      return;
    }
  }
  vscode.window.showInformationMessage(
    opened
      ? `Claude Code opened with ${slashCommand}. Press Enter to start.`
      : `Type ${slashCommand} in the Claude Code panel to start.`,
  );
}

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
        case "openProjectRoot":
          if (message.rootPath) {
            const uri = vscode.Uri.file(message.rootPath);
            vscode.commands.executeCommand("revealInExplorer", uri);
          }
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
        case "sendFeedback":
          vscode.commands.executeCommand("grove.sendFeedback");
          break;
        case "openSkill":
          if (typeof message.skill === "string" && /^grove-[a-z]+$/.test(message.skill)) {
            await openSkillInClaude(message.skill);
          }
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
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    .project-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .project-link:hover {
      text-decoration: underline;
    }
    small { display: block; margin-top: 2px; }
    .info-icon {
      position: relative;
      cursor: help;
      opacity: 0.5;
      font-size: 16px;
      line-height: 1;
      flex-shrink: 0;
    }
    .info-icon::after {
      content: attr(data-tooltip);
      position: fixed;
      left: 10px;
      right: 10px;
      top: auto;
      background: var(--vscode-editorHoverWidget-background);
      color: var(--vscode-editorHoverWidget-foreground);
      border: 1px solid var(--vscode-editorHoverWidget-border);
      padding: 4px 8px;
      font-size: 11px;
      white-space: normal;
      word-wrap: break-word;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s;
      z-index: 10;
    }
    .info-icon:hover { opacity: 1; }
    .info-icon:hover::after { opacity: 1; }
  </style>
</head>
<body>
  <div id="loading">Loading Grove status...</div>
  <div id="content" class="hidden"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentStatus = null;

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

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
      const skillsSection =
        '<div class="section"><div class="section-title">Grove Skills</div>' +
        '<div class="actions">' +
        '<button data-skill="grove-setup" title="Open Claude Code with /grove-setup">Setup</button>' +
        '<button data-skill="grove-create" title="Open Claude Code with /grove-create">Create</button>' +
        '<button data-skill="grove-migrate" title="Open Claude Code with /grove-migrate">Migrate</button>' +
        '<button data-skill="grove-test" title="Open Claude Code with /grove-test">Test</button>' +
        '<button data-skill="grove-run" title="Open Claude Code with /grove-run">Run</button>' +
        '<button data-skill="grove-maintain" title="Open Claude Code with /grove-maintain">Maintain</button>' +
        '</div></div>';
      if (!currentStatus.hasProject) {
        html += '<div class="setup-wizard"><h3>No Grove Project Detected</h3><p>Create a snip.js file to get started, or open a folder containing one.</p></div>';
        html += skillsSection;
        html += '<div class="section"><div class="section-title">Help</div><div class="actions" style="grid-template-columns: 1fr;"><button data-action="sendFeedback">📝 Send Feedback</button></div></div>';
      } else {
        html += '<div class="section"><div class="section-title">Projects</div>';
        html += currentStatus.projects.map(p =>
          '<div class="status-row">' +
          '<a href="#" class="project-link" data-root-path="' + escapeHtml(p.rootPath) + '">' +
            escapeHtml(p.displayName) +
          '</a>' +
          '</div>'
        ).join('');
        html += '</div>';
        // MongoDB section with connection status and actions
        const mongo = currentStatus.mongoConnection;
        const activeProject = currentStatus.activeProject;
        const sectionTitle = activeProject ? 'Grove ' + escapeHtml(activeProject.displayName) : 'MongoDB';
        html += '<div class="section"><div class="section-title">' + sectionTitle + '</div>';

        if (mongo.source === 'ui' || mongo.source === 'env-file') {
          html += '<div class="status-row"><span class="status-icon">✓</span>';
          html += '<span>Connected';
          if (mongo.clusterType && mongo.clusterType !== 'unknown') html += ' (' + escapeHtml(mongo.clusterType) + ')';
          if (mongo.host) html += '<br><small style="opacity:0.7">' + escapeHtml(mongo.host) + '</small>';
          html += '</span></div>';
          html += '<div class="actions" style="margin-top: 8px;">';
          html += '<button data-action="showDatabases">Show Databases</button>';
          html += '<button data-action="disconnectMongo">Disconnect</button>';
          html += '</div>';
        } else if (mongo.source === 'connection-failed') {
          const tooltip = mongo.host ? 'No MongoDB instance found at ' + escapeHtml(mongo.host) : 'Could not reach MongoDB instance';
          html += '<div class="status-row"><span class="status-icon">✗</span><span>Could not connect' + (mongo.host ? '<br><small style="opacity:0.7">' + escapeHtml(mongo.host) + '</small>' : '') + '</span><span class="info-icon" data-tooltip="' + tooltip + '">ⓘ</span></div>';
          html += '<div class="actions" style="margin-top: 8px;">';
          html += '<button data-action="connectMongo" style="grid-column: span 2;">Connect to MongoDB</button>';
          html += '</div>';
        } else {
          html += '<div class="status-row"><span class="status-icon">○</span><span>Not configured</span></div>';
          html += '<div class="actions" style="margin-top: 8px;">';
          html += '<button data-action="connectMongo" style="grid-column: span 2;">Connect to MongoDB</button>';
          html += '</div>';
        }

        html += '</div>'; // close section
        // Skills section (always shown when hasProject)
        html += skillsSection;
        // Feedback section (always shown)
        html += '<div class="section"><div class="section-title">Help</div><div class="actions" style="grid-template-columns: 1fr;"><button data-action="sendFeedback">📝 Send Feedback</button></div></div>';
      }
      content.innerHTML = html;
    }
    document.addEventListener('click', e => {
      const link = e.target.closest('.project-link');
      if (link) {
        e.preventDefault();
        vscode.postMessage({ command: 'openProjectRoot', rootPath: link.dataset.rootPath });
        return;
      }
      const skillBtn = e.target.closest('[data-skill]');
      if (skillBtn) {
        vscode.postMessage({ command: 'openSkill', skill: skillBtn.dataset.skill });
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (btn) {
        vscode.postMessage({ command: btn.dataset.action });
      }
    });
    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}
