/**
 * Feedback UI Types
 *
 * TypeScript interfaces for the feedback system that allows users
 * to report bugs and request features directly from VS Code.
 */

/**
 * The type of feedback being submitted.
 */
export type FeedbackType = "bug" | "feature";

/**
 * User-submitted feedback data.
 */
export interface FeedbackSubmission {
  /** Type of feedback: bug report or feature request */
  type: FeedbackType;
  /** Short summary of the feedback (max 200 chars) */
  title: string;
  /** Detailed description of the issue or request */
  description: string;
  /** Optional email for follow-up communication */
  email?: string;
  /** Whether to include diagnostic information */
  includeDiagnostics: boolean;
  /** Collected diagnostic information (if includeDiagnostics is true) */
  diagnostics?: DiagnosticInfo;
}

/**
 * System and extension diagnostic information.
 * Collected automatically to help with debugging.
 */
export interface DiagnosticInfo {
  /** Grove extension version */
  groveVersion: string;
  /** VS Code version */
  vscodeVersion: string;
  /** Operating system (platform and release) */
  os: string;
  /** Node.js version */
  nodeVersion: string;
  /** Detected Grove projects in workspace */
  detectedProjects: string[];
  /** ISO timestamp when diagnostics were collected */
  timestamp: string;
}

/**
 * URL parameters for creating a Jira ticket via URL.
 * Note: labels are handled separately to support multiple values.
 */
export interface JiraURLParams {
  /** Jira project ID (numeric) */
  pid: string;
  /** Issue type ID (1=Bug, 3=Task) */
  issuetype: string;
  /** Ticket summary/title */
  summary: string;
  /** Ticket description in Jira markup */
  description: string;
  /** Component name */
  components: string;
  /** Priority ID (4=Minor/P4) */
  priority: string;
}

/**
 * Messages sent from the webview to the extension.
 */
export interface FeedbackWebviewMessage {
  command: "submit" | "cancel" | "getDiagnostics";
  data?: FeedbackSubmission;
}

/**
 * Messages sent from the extension to the webview.
 */
export interface FeedbackExtensionMessage {
  command: "diagnosticsLoaded" | "error" | "submitting";
  diagnostics?: DiagnosticInfo;
  error?: string;
}
