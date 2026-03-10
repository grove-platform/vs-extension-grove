import * as vscode from "vscode";
import { getMcpConfig } from "../mcp-bridge";

export function registerCopyConfigCommand(
  context: vscode.ExtensionContext
): void {
  const command = vscode.commands.registerCommand(
    "grove.copyMcpConfig",
    async () => {
      const config = getMcpConfig(context.extensionPath);
      const json = JSON.stringify(config, null, 2);

      await vscode.env.clipboard.writeText(json);

      vscode.window.showInformationMessage(
        "Grove MCP config copied! Paste in Augment Settings → MCP → Import from JSON"
      );
    }
  );

  context.subscriptions.push(command);
}

