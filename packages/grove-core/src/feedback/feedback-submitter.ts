/**
 * Feedback Submitter
 *
 * Handles the submission of feedback by opening Jira in the user's browser.
 * Includes error handling and fallback options for clipboard copy.
 */

import * as vscode from "vscode";
import type { FeedbackSubmission } from "./types";
import { generateJiraURL, buildDescription } from "./jira-url-builder";
import { getLogChannel } from "../logger";

/**
 * Handle errors that occur during feedback submission.
 * Provides fallback options to copy the URL or description to clipboard.
 *
 * @param error - The error that occurred.
 * @param submission - The feedback submission data.
 */
async function handleSubmissionError(
  error: unknown,
  submission: FeedbackSubmission,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const logger = getLogChannel();
  logger.error(`Failed to open Jira URL: ${errorMessage}`);

  const choice = await vscode.window.showErrorMessage(
    "Could not open Jira automatically. Would you like to copy the Jira URL or description?",
    "Copy URL",
    "Copy Description",
    "Cancel",
  );

  if (choice === "Copy URL") {
    await vscode.env.clipboard.writeText(generateJiraURL(submission));
    vscode.window.showInformationMessage("Jira URL copied to clipboard");
  } else if (choice === "Copy Description") {
    await vscode.env.clipboard.writeText(buildDescription(submission));
    vscode.window.showInformationMessage("Description copied to clipboard");
  }
}

/**
 * Submit feedback by opening Jira in the user's browser.
 * The description is copied to clipboard as a backup in case URL parameters fail.
 *
 * @param submission - The feedback submission data.
 */
export async function submitFeedback(
  submission: FeedbackSubmission,
): Promise<void> {
  try {
    const url = generateJiraURL(submission);

    // Copy description to clipboard as backup before opening browser
    await vscode.env.clipboard.writeText(buildDescription(submission));

    // Open browser with the Jira URL
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url));

    if (opened) {
      vscode.window.showInformationMessage(
        "Opening Jira in your browser. The description has been copied to your clipboard.",
        "OK",
      );
    } else {
      throw new Error("Failed to open browser");
    }
  } catch (error) {
    await handleSubmissionError(error, submission);
  }
}

