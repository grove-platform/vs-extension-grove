/**
 * Grove MongoDB Commands
 *
 * VS Code commands for MongoDB connection management.
 */

import * as vscode from "vscode";
import { MongoConnectionManager } from "./connection";

/**
 * Register MongoDB-related commands.
 */
export function registerMongoCommands(
  context: vscode.ExtensionContext,
  connectionManager: MongoConnectionManager,
  onConnectionChange: (event?: "connect" | "disconnect") => void,
): void {
  // Connect to MongoDB
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.connectMongo", async () => {
      const connectionString = await vscode.window.showInputBox({
        prompt: "Enter MongoDB connection string",
        placeHolder: "mongodb+srv://user:password@cluster.mongodb.net/database",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Connection string cannot be empty";
          }
          if (
            !value.startsWith("mongodb://") &&
            !value.startsWith("mongodb+srv://")
          ) {
            return "Connection string must start with mongodb:// or mongodb+srv://";
          }
          return null;
        },
      });

      if (!connectionString) {
        return; // User cancelled
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Connecting to MongoDB...",
            cancellable: false,
          },
          async () => {
            await connectionManager.connect(connectionString);
          },
        );

        vscode.window.showInformationMessage(
          `Connected to MongoDB (${connectionManager.status.clusterType})`,
        );
        onConnectionChange("connect");
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  // Disconnect from MongoDB
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.disconnectMongo", async () => {
      if (!connectionManager.status.connected) {
        vscode.window.showInformationMessage("Not connected to MongoDB");
        return;
      }

      const choice = await vscode.window.showQuickPick(
        [
          {
            label: "Disconnect",
            description: "Disconnect but keep credentials for later",
          },
          {
            label: "Disconnect and Clear",
            description: "Disconnect and remove stored credentials",
          },
          { label: "Cancel", description: "Cancel" },
        ],
        { placeHolder: "Choose disconnect option" },
      );

      if (!choice || choice.label === "Cancel") {
        return;
      }

      if (choice.label === "Disconnect and Clear") {
        await connectionManager.disconnectAndClear();
      } else {
        await connectionManager.disconnect();
      }

      vscode.window.showInformationMessage("Disconnected from MongoDB");
      onConnectionChange("disconnect");
    }),
  );

  // Show databases
  context.subscriptions.push(
    vscode.commands.registerCommand("grove.showDatabases", async () => {
      if (!connectionManager.status.connected) {
        const connect = await vscode.window.showInformationMessage(
          "Not connected to MongoDB. Connect now?",
          "Connect",
          "Cancel",
        );
        if (connect === "Connect") {
          await vscode.commands.executeCommand("grove.connectMongo");
        }
        return;
      }

      try {
        const databases = await connectionManager.listDatabases();
        const sampleDbs = await connectionManager.getSampleDatabases();

        const items = databases.map((name) => {
          const sampleDb = sampleDbs.find((s) => s.name === name);
          return {
            label: name,
            description: sampleDb ? `$(database) ${sampleDb.description}` : "",
          };
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${databases.length} database(s) found`,
          title: "MongoDB Databases",
        });

        if (selected) {
          vscode.window.showInformationMessage(
            `Selected database: ${selected.label}`,
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to list databases: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
}

