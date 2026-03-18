/**
 * Jira URL Builder
 *
 * Generates pre-filled Jira URLs for creating feedback tickets.
 * Uses URL parameters to pre-populate the Jira ticket creation form.
 */

import * as vscode from "vscode";
import type { FeedbackSubmission, JiraURLParams } from "./types";

/** Base URL for Jira ticket creation */
const JIRA_BASE_URL =
  "https://jira.mongodb.org/secure/CreateIssueDetails!init.jspa";

/** DOCSP Project ID */
const DOCSP_PROJECT_ID = "14181";

/** Issue type IDs in Jira */
const ISSUE_TYPE_BUG = "1";
const ISSUE_TYPE_TASK = "3";

/** Component ID for DevDocs */
const COMPONENT_DEVDOCS = "36158";

/** Priority ID for Minor (P4) */
const PRIORITY_MINOR = "4";

/**
 * Build the ticket summary/title.
 * @param submission - The feedback submission data.
 * @returns The formatted summary string.
 */
function buildSummary(submission: FeedbackSubmission): string {
  const prefix = submission.type === "bug" ? "Bug" : "Feature";
  return `[Grove Feedback] ${prefix}: ${submission.title}`;
}

/**
 * Build the ticket description with optional diagnostics.
 * Uses Jira text formatting syntax.
 *
 * @param submission - The feedback submission data.
 * @returns The formatted description string.
 */
export function buildDescription(submission: FeedbackSubmission): string {
  const parts: string[] = [
    "*User Reported Issue*",
    "",
    submission.description,
    "",
  ];

  if (submission.email) {
    parts.push(`*Contact:* ${submission.email}`, "");
  }

  if (submission.includeDiagnostics && submission.diagnostics) {
    const diag = submission.diagnostics;
    parts.push(
      "---",
      "*Diagnostic Information*",
      `*Grove Version:* ${diag.groveVersion}`,
      `*VS Code Version:* ${diag.vscodeVersion}`,
      `*OS:* ${diag.os}`,
      `*Node Version:* ${diag.nodeVersion}`,
      `*Detected Projects:* ${diag.detectedProjects.length}`,
      `*Timestamp:* ${diag.timestamp}`,
    );
  }

  return parts.join("\n");
}

/**
 * Generate a pre-filled Jira URL for creating a ticket.
 * The URL includes query parameters that pre-populate the Jira form.
 *
 * @param submission - The feedback submission data.
 * @returns The Jira URL with query parameters.
 */
export function generateJiraURL(submission: FeedbackSubmission): string {
  const config = vscode.workspace.getConfiguration("grove.feedback");
  const projectId = config.get<string>("jiraProjectId", DOCSP_PROJECT_ID);

  const params: JiraURLParams = {
    pid: projectId,
    issuetype: submission.type === "bug" ? ISSUE_TYPE_BUG : ISSUE_TYPE_TASK,
    summary: buildSummary(submission),
    description: buildDescription(submission),
    components: COMPONENT_DEVDOCS,
    priority: PRIORITY_MINOR,
  };

  // Use URLSearchParams for proper encoding
  const searchParams = new URLSearchParams(params as unknown as Record<string, string>);

  // Add labels separately (Jira expects multiple label params for multiple labels)
  searchParams.append("labels", "grove-extension");
  searchParams.append("labels", "user-feedback");

  return `${JIRA_BASE_URL}?${searchParams.toString()}`;
}
