/**
 * Grove MongoDB Connection Manager
 *
 * Manages MongoDB client connections and provides database listing functionality.
 * Uses lazy loading of the mongodb package to reduce extension bundle size when
 * MongoDB features are not actively used.
 */

import * as vscode from "vscode";
import {
  getConnectionString,
  storeConnectionString,
  deleteConnectionString,
  validateConnectionString,
  maskConnectionString,
} from "./credentials";

export interface SampleDatabase {
  name: string;
  description: string;
}

export interface ConnectionStatus {
  connected: boolean;
  clusterType: "Atlas" | "local" | "unknown";
  host?: string;
  error?: string;
}

// MongoDB driver types (dynamically imported)
type MongoClient = {
  connect(): Promise<unknown>;
  close(): Promise<void>;
  db(name?: string): {
    admin(): {
      listDatabases(): Promise<{ databases: Array<{ name: string }> }>;
    };
  };
};

type MongoClientConstructor = new (
  uri: string,
  options?: { serverSelectionTimeoutMS?: number; appName?: string },
) => MongoClient;

/**
 * MongoDB Connection Manager for Grove.
 * Handles connection lifecycle and database operations.
 */
export class MongoConnectionManager {
  private client: MongoClient | null = null;
  private connectionString: string | null = null;
  private _status: ConnectionStatus = {
    connected: false,
    clusterType: "unknown",
  };

  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Get current connection status.
   */
  get status(): ConnectionStatus {
    return { ...this._status };
  }

  /**
   * Connect to MongoDB using a connection string.
   * Stores the connection string securely if connection succeeds.
   */
  async connect(connectionString: string): Promise<void> {
    // Validate connection string format
    const validation = validateConnectionString(connectionString);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Disconnect existing connection if any
    if (this.client) {
      await this.disconnect();
    }

    try {
      // Dynamically import mongodb
      const { MongoClient: MC } = (await import("mongodb")) as {
        MongoClient: MongoClientConstructor;
      };

      this.client = new MC(connectionString, {
        serverSelectionTimeoutMS: 10000,
        appName: "grove-vscode",
      });

      await this.client.connect();
      this.connectionString = connectionString;

      // Determine cluster type
      const clusterType = this.detectClusterType(connectionString);

      // Extract host for display
      const host = this.extractHost(connectionString);

      this._status = {
        connected: true,
        clusterType,
        host,
      };

      // Store connection string securely
      await storeConnectionString(this.secrets, connectionString);
    } catch (error) {
      this._status = {
        connected: false,
        clusterType: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB and clear session.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
    }
    this.connectionString = null;
    this._status = {
      connected: false,
      clusterType: "unknown",
    };
  }

  /**
   * Disconnect and also clear stored credentials.
   */
  async disconnectAndClear(): Promise<void> {
    await this.disconnect();
    await deleteConnectionString(this.secrets);
  }

  /**
   * Attempt to reconnect using stored credentials.
   */
  async reconnect(): Promise<boolean> {
    const stored = await getConnectionString(this.secrets);
    if (!stored) {
      return false;
    }
    try {
      await this.connect(stored);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all databases on the connected MongoDB instance.
   */
  async listDatabases(): Promise<string[]> {
    if (!this.client) {
      throw new Error("Not connected to MongoDB");
    }

    const admin = this.client.db().admin();
    const result = await admin.listDatabases();
    return result.databases.map((db) => db.name);
  }

  /**
   * Get sample databases (sample_* databases used in Grove tests).
   */
  async getSampleDatabases(): Promise<SampleDatabase[]> {
    const databases = await this.listDatabases();
    const sampleDatabases: SampleDatabase[] = [];

    const sampleDbDescriptions: Record<string, string> = {
      sample_mflix: "Movie data with users, comments, and theaters",
      sample_airbnb: "Airbnb listings and reviews",
      sample_analytics: "Customer and account analytics",
      sample_geospatial: "Shipwreck data with geospatial indexes",
      sample_guides: "Planet data for guided examples",
      sample_restaurants: "NYC restaurant inspection data",
      sample_supplies: "Office supply sales data",
      sample_training: "Training data with various collections",
      sample_weatherdata: "Weather station measurements",
    };

    for (const name of databases) {
      if (name.startsWith("sample_")) {
        sampleDatabases.push({
          name,
          description: sampleDbDescriptions[name] ?? "Sample database",
        });
      }
    }

    return sampleDatabases;
  }

  /**
   * Get the masked connection string for display.
   */
  getMaskedConnectionString(): string | null {
    if (!this.connectionString) {
      return null;
    }
    return maskConnectionString(this.connectionString);
  }

  /**
   * Get the raw connection string for injection into test processes.
   * Only available when connected.
   *
   * Security note: This exposes the connection string (including credentials)
   * for passing to child processes. The connection string will be visible
   * in the process environment.
   */
  getConnectionStringForTests(): string | null {
    return this.connectionString;
  }

  /**
   * Detect cluster type from connection string.
   */
  private detectClusterType(
    connectionString: string,
  ): "Atlas" | "local" | "unknown" {
    if (connectionString.includes("mongodb+srv://")) {
      return "Atlas";
    }
    if (
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1")
    ) {
      return "local";
    }
    return "unknown";
  }

  /**
   * Extract host from connection string for display.
   */
  private extractHost(connectionString: string): string {
    try {
      // Handle mongodb+srv:// and mongodb://
      const match = connectionString.match(/@([^/]+)/);
      if (match) {
        return match[1];
      }
      // For localhost without auth
      const hostMatch = connectionString.match(/:\/\/([^/]+)/);
      if (hostMatch) {
        return hostMatch[1];
      }
    } catch {
      // Ignore parsing errors
    }
    return "unknown";
  }
}
