/**
 * Grove MongoDB Credential Storage
 *
 * Securely stores MongoDB connection strings using VS Code's SecretStorage API.
 * Credentials are encrypted and stored in the system keychain/credential manager.
 */

import * as vscode from "vscode";

const SECRET_KEY = "grove.mongoConnectionString";

/**
 * Store a MongoDB connection string securely.
 * The connection string is encrypted and stored in the system keychain.
 */
export async function storeConnectionString(
  secrets: vscode.SecretStorage,
  connectionString: string,
): Promise<void> {
  await secrets.store(SECRET_KEY, connectionString);
}

/**
 * Retrieve the stored MongoDB connection string.
 * Returns undefined if no connection string is stored.
 */
export async function getConnectionString(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

/**
 * Delete the stored MongoDB connection string.
 */
export async function deleteConnectionString(
  secrets: vscode.SecretStorage,
): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

/**
 * Check if a connection string is stored.
 */
export async function hasConnectionString(
  secrets: vscode.SecretStorage,
): Promise<boolean> {
  const stored = await secrets.get(SECRET_KEY);
  return stored !== undefined;
}

/**
 * Validate that a connection string looks like a valid MongoDB URI.
 * Does not attempt to connect - just validates format.
 */
export function validateConnectionString(connectionString: string): {
  valid: boolean;
  error?: string;
} {
  if (!connectionString || connectionString.trim().length === 0) {
    return { valid: false, error: "Connection string cannot be empty" };
  }

  // Check for mongodb:// or mongodb+srv:// prefix
  const trimmed = connectionString.trim();
  if (
    !trimmed.startsWith("mongodb://") &&
    !trimmed.startsWith("mongodb+srv://")
  ) {
    return {
      valid: false,
      error:
        "Connection string must start with mongodb:// or mongodb+srv://",
    };
  }

  // Basic URL structure validation
  try {
    // Replace mongodb+srv:// with https:// for URL parsing
    const urlForParsing = trimmed.replace(/^mongodb(\+srv)?:\/\//, "https://");
    new URL(urlForParsing);
  } catch {
    return { valid: false, error: "Invalid connection string format" };
  }

  return { valid: true };
}

/**
 * Mask a connection string for display (hide password).
 * Example: mongodb+srv://user:****@cluster.mongodb.net/db
 */
export function maskConnectionString(connectionString: string): string {
  try {
    // Match the password portion between : and @
    return connectionString.replace(
      /(:\/\/[^:]+:)([^@]+)(@)/,
      "$1****$3",
    );
  } catch {
    // If parsing fails, just return a generic masked string
    return "mongodb://****";
  }
}

