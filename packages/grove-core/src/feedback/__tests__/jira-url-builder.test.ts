/**
 * Tests for jira-url-builder module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateJiraURL, buildDescription } from "../jira-url-builder";
import type { FeedbackSubmission, DiagnosticInfo } from "../types";

// Mock vscode before importing the module
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
    })),
  },
}));

describe("jira-url-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateJiraURL", () => {
    it("should generate valid URL for bug report", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test bug",
        description: "Bug description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("https://jira.mongodb.org");
      expect(url).toContain("issuetype=1"); // Bug type ID
      expect(url).toContain("Test+bug");
    });

    it("should generate valid URL for feature request", () => {
      const submission: FeedbackSubmission = {
        type: "feature",
        title: "Test feature",
        description: "Feature description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("issuetype=3"); // Task type ID
    });

    it("should include labels as separate params in URL", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("labels=grove-extension");
      expect(url).toContain("labels=user-feedback");
    });

    it("should properly encode special characters", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: 'Test & special "chars"',
        description: "Line 1\nLine 2",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      // URL should be properly encoded - not contain raw special chars
      expect(url).not.toMatch(/[^=]&[^a-z]/); // & should only appear in query separators
      expect(url).not.toContain('"');
      expect(url).not.toContain("\n");
    });

    it("should include DOCSP project ID in URL", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("pid=14181"); // DOCSP project ID
    });

    it("should include DevDocs component ID in URL", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("components=36158"); // DevDocs component ID
    });

    it("should include Minor priority in URL", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const url = generateJiraURL(submission);

      expect(url).toContain("priority=4"); // Minor priority ID
    });
  });

  describe("buildDescription", () => {
    it("should include user description", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "My bug description",
        includeDiagnostics: false,
      };

      const desc = buildDescription(submission);

      expect(desc).toContain("My bug description");
      expect(desc).toContain("*User Reported Issue*");
    });

    it("should include email when provided", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        email: "test@mongodb.com",
        includeDiagnostics: false,
      };

      const desc = buildDescription(submission);

      expect(desc).toContain("test@mongodb.com");
      expect(desc).toContain("*Contact:*");
    });

    it("should not include email when not provided", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const desc = buildDescription(submission);

      expect(desc).not.toContain("*Contact:*");
    });

    it("should include diagnostics when enabled", () => {
      const diagnostics: DiagnosticInfo = {
        groveVersion: "1.0.0",
        vscodeVersion: "1.85.0",
        os: "darwin 23.0.0",
        nodeVersion: "v18.0.0",
        detectedProjects: ["project1", "project2"],
        timestamp: "2024-01-01T00:00:00Z",
      };

      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: true,
        diagnostics,
      };

      const desc = buildDescription(submission);

      expect(desc).toContain("*Diagnostic Information*");
      expect(desc).toContain("1.0.0");
      expect(desc).toContain("1.85.0");
      expect(desc).toContain("darwin");
      expect(desc).toContain("v18.0.0");
    });

    it("should not include diagnostics when disabled", () => {
      const submission: FeedbackSubmission = {
        type: "bug",
        title: "Test",
        description: "Description",
        includeDiagnostics: false,
      };

      const desc = buildDescription(submission);

      expect(desc).not.toContain("*Diagnostic Information*");
    });
  });
});
