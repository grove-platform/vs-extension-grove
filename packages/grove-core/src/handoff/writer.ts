/**
 * Grove Handoff Writer
 *
 * Writes a single-use JSON payload at `<claudeProjectRoot>/.claude/grove-handoff.json`
 * that consuming AI skills (e.g. `/grove-run`) read to pre-fill their inputs.
 *
 * The consuming skill is responsible for deleting the file after reading it.
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

export const HANDOFF_RELATIVE_PATH = ".claude/grove-handoff.json";

/** Max directory levels to walk up when searching for a Claude project root. */
export const MAX_WALK_DEPTH = 6;

/** Skills the extension knows how to hand off to. */
export type HandoffSkill =
  | "grove-run"
  | "grove-create"
  | "grove-migrate"
  | "grove-maintain"
  | "grove-setup"
  | "grove-test";

export interface HandoffEnvelope<TContext = unknown> {
  version: 1;
  skill: HandoffSkill;
  trigger: string;
  timestamp: string;
  workspaceRoot: string;
  context: TContext;
}

export interface TestFailureContext {
  testFile: string;
  testName: string;
  testNamePattern: string;
  line: number;
  errorMessage?: string;
  duration?: number;
  projectPath: string;
}

/**
 * Walk up from `startPath` looking for the first ancestor directory that
 * contains `.claude/skills/` — the unambiguous marker for a Claude Code
 * project root where skill files live.
 *
 * Writers often open a subdirectory (e.g. `code-example-tests/`) as their
 * VS Code workspace, but `/grove-run` runs from the repo root where
 * `.claude/skills/` lives. Writing the handoff at that repo root keeps
 * the extension and skill in agreement.
 *
 * Returns the ancestor path, or `undefined` if none is found within
 * `maxDepth` levels (or if the filesystem root is reached first).
 */
export async function findClaudeProjectRoot(
  startPath: string,
  maxDepth: number = MAX_WALK_DEPTH,
): Promise<string | undefined> {
  let current = path.resolve(startPath);
  for (let depth = 0; depth <= maxDepth; depth++) {
    const marker = path.join(current, ".claude", "skills");
    try {
      const stat = await fs.stat(marker);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // marker not present at this level — keep walking
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // reached filesystem root
      return undefined;
    }
    current = parent;
  }
  return undefined;
}

/**
 * Write a handoff payload to `<claudeProjectRoot>/.claude/grove-handoff.json`.
 *
 * Resolution order for the base directory:
 *   1. Nearest ancestor of the VS Code workspace folder that contains
 *      `.claude/skills/` (the Claude Code project root).
 *   2. Fall back to the VS Code workspace folder itself.
 *
 * Returns the URI written to, or `undefined` if no workspace is open.
 * The payload overwrites any existing file — handoffs are single-use.
 */
export async function writeHandoff<TContext>(
  skill: HandoffSkill,
  trigger: string,
  context: TContext,
): Promise<vscode.Uri | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const claudeRoot =
    (await findClaudeProjectRoot(workspacePath)) ?? workspacePath;

  const envelope: HandoffEnvelope<TContext> = {
    version: 1,
    skill,
    trigger,
    timestamp: new Date().toISOString(),
    workspaceRoot: claudeRoot,
    context,
  };

  const handoffPath = path.join(claudeRoot, HANDOFF_RELATIVE_PATH);
  const claudeDir = path.dirname(handoffPath);

  await fs.mkdir(claudeDir, { recursive: true });
  await fs.writeFile(handoffPath, JSON.stringify(envelope, null, 2), "utf-8");

  return vscode.Uri.file(handoffPath);
}
