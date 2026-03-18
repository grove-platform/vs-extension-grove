/**
 * Webview HTML Generator
 *
 * Generates the HTML content for the feedback form webview.
 * Includes CSS styling that adapts to VS Code themes.
 */

/**
 * Get the CSS styles for the feedback form.
 * Uses VS Code CSS variables for theme-aware styling.
 */
function getStyles(): string {
  return `
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .description {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    input[type="text"],
    input[type="email"],
    select,
    textarea {
      width: 100%;
      padding: 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      box-sizing: border-box;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    textarea {
      resize: vertical;
      min-height: 120px;
    }

    .char-count {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
    }

    .checkbox-group label {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .checkbox-group input[type="checkbox"] {
      width: auto;
      margin-right: 8px;
      cursor: pointer;
    }

    .button-group {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: 500;
    }

    .primary-button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .primary-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .primary-button:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .secondary-button {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .secondary-button:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .info-box {
      margin-top: 32px;
      padding: 16px;
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      border-radius: 2px;
    }

    .info-box strong {
      display: block;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .info-box p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
  `;
}

/**
 * Get the JavaScript code for the feedback form.
 * Handles form submission, validation, and message passing.
 */
function getScript(): string {
  return `
    (function() {
      const vscode = acquireVsCodeApi();

      // Get form elements
      const form = document.getElementById('feedbackForm');
      const titleInput = document.getElementById('title');
      const titleCount = document.getElementById('titleCount');
      const cancelButton = document.getElementById('cancelButton');

      // Character counter for title
      titleInput.addEventListener('input', () => {
        const length = titleInput.value.length;
        titleCount.textContent = length + '/200';
      });

      // Form submission
      form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form data
        const formData = {
          type: document.getElementById('type').value,
          title: document.getElementById('title').value.trim(),
          description: document.getElementById('description').value.trim(),
          email: document.getElementById('email').value.trim() || undefined,
          includeDiagnostics: document.getElementById('includeDiagnostics').checked
        };

        // Validate
        if (!formData.title || !formData.description) {
          alert('Please fill in all required fields');
          return;
        }

        // Send to extension
        vscode.postMessage({
          command: 'submit',
          data: formData
        });
      });

      // Cancel button
      cancelButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel? Your feedback will be lost.')) {
          form.reset();
          titleCount.textContent = '0/200';
        }
      });

      // Request diagnostics on load
      vscode.postMessage({ command: 'getDiagnostics' });

      // Listen for messages from extension
      window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.command === 'diagnostics') {
          console.log('Diagnostics loaded:', message.data);
        }
      });
    })();
  `;
}

/**
 * Generate the complete HTML content for the feedback webview.
 * @param nonce - A per-render cryptographic nonce for the script-src CSP directive.
 * @returns The HTML string for the webview.
 */
export function getWebviewHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Send Feedback</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container">
    <h1>Send Feedback to DevDocs Team</h1>
    <p class="description">
      Report bugs or request features for the Grove extension.
      Your feedback will open a Jira ticket for the DevDocs team.
    </p>

    <form id="feedbackForm">
      <div class="form-group">
        <label for="type">Feedback Type *</label>
        <select id="type" name="type" required aria-required="true">
          <option value="bug">Bug Report</option>
          <option value="feature">Feature Request</option>
        </select>
      </div>

      <div class="form-group">
        <label for="title">Title *</label>
        <input
          type="text"
          id="title"
          name="title"
          required
          aria-required="true"
          placeholder="Brief summary of your feedback"
          maxlength="200"
        />
        <span class="char-count" id="titleCount" aria-live="polite">0/200</span>
      </div>

      <div class="form-group">
        <label for="description">Description *</label>
        <textarea
          id="description"
          name="description"
          required
          aria-required="true"
          placeholder="Provide details about the bug or feature request"
          rows="8"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="email">Email (optional)</label>
        <input
          type="email"
          id="email"
          name="email"
          placeholder="your.email@mongodb.com (for follow-up)"
        />
      </div>

      <div class="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            id="includeDiagnostics"
            name="includeDiagnostics"
            checked
          />
          Include diagnostic information (extension version, OS, etc.)
        </label>
      </div>

      <div class="button-group">
        <button type="submit" class="primary-button">Submit Feedback</button>
        <button type="button" class="secondary-button" id="cancelButton">Cancel</button>
      </div>
    </form>

    <div class="info-box">
      <strong>What happens next?</strong>
      <p>
        Your browser will open to a Jira ticket creation page with your feedback pre-filled.
        You can review and edit the ticket before submitting it.
      </p>
    </div>
  </div>

  <script nonce="${nonce}">${getScript()}</script>
</body>
</html>`;
}
