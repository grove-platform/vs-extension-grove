/**
 * Feedback Module
 *
 * Public API for the feedback system that allows users to report bugs
 * and request features directly from VS Code.
 */

// Types
export type {
  FeedbackType,
  FeedbackSubmission,
  DiagnosticInfo,
  JiraURLParams,
  FeedbackWebviewMessage,
  FeedbackExtensionMessage,
} from "./types";

// Diagnostics collector
export { collectDiagnostics } from "./diagnostics-collector";

// Jira URL builder
export { generateJiraURL, buildDescription } from "./jira-url-builder";

// Feedback submitter
export { submitFeedback } from "./feedback-submitter";

// Feedback panel
export { FeedbackPanel } from "./FeedbackPanel";
