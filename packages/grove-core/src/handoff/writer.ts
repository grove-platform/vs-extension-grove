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
 * Context for generating a test for an existing, snippeted-but-untested
 * source file. Fires from the "No test found" banner CodeLens at line 0 of
 * a source file under `examples/` that contains `:snippet-start:` tags but
 * has no matching test file in the project's `tests/` tree.
 */
export interface TestFromSourceContext {
  /** Relative path (from Claude project root) of the source file. */
  sourceFile: string;
  /** Relative path of the Grove project root (contains snip.js). */
  projectPath: string;
  /** Detected Grove language — routes the skill to the right conventions. */
  language: "nodejs" | "python" | "go" | "java" | "csharp" | "mongosh";
  /** Snippet names declared in the source file (from `:snippet-start: <name>` tags). */
  snippetNames: string[];
}

/**
 * Context for a setup request triggered by a missing `.env` file in a Grove
 * project. Fires from a banner CodeLens at line 0 of test files when the
 * owning project has no `.env`. Writers on nodejs/mongosh suites strictly
 * need `.env` (shell-level export in `npm test` overrides process env);
 * python/go/java/csharp writers can use either `.env` or the Grove UI
 * connection, but the skill Step 0 explains the options based on language.
 */
export interface SetupFromMissingEnvContext {
  /** Relative path (from Claude project root) of the Grove project (contains snip.js). */
  projectPath: string;
  /** Detected Grove language — routes the skill directly to the right suite. */
  language: "nodejs" | "python" | "go" | "java" | "csharp" | "mongosh";
  /** Relative path of the test file the writer was viewing when they clicked. */
  testFile: string;
  /** Whether Grove can inject CONNECTION_STRING at test launch for this suite.
   *  False for nodejs/mongosh — those suites require `.env`. */
  supportsEnvInjection: boolean;
}

/**
 * Context for migrating inline code from a `code-block::` directive in an
 * RST/TXT file into the Grove-tested tree. The code lives directly in the
 * docs page (no separate file), so /grove-migrate creates the file as part
 * of the migration. `language` may be `"json"` — an ambiguous marker the
 * skill resolves by asking the writer to pick JavaScript or mongosh.
 */
export interface MigrateCodeBlockContext {
  /** The code-block's language (positional arg of the directive). */
  language: string;
  /** The inline code content (with RST indent stripped). */
  code: string;
  /** Relative path (from Claude project root) of the RST file. */
  rstFile: string;
  /** Zero-indexed line number of the `.. code-block::` line. */
  rstLine: number;
}

/**
 * Context for a snippet-level migration triggered from an RST `literalinclude::`
 * (or `input::`/`output::`) directive that resolves to a file outside the
 * Grove-tested tree.
 */
export interface MigrateFromRstContext {
  /** The path as written in the RST directive. */
  targetPath: string;
  /** Relative path (from Claude project root) of the referenced code file. */
  targetFile: string;
  /** The `:snippet:` option value if the directive has one. */
  snippetName?: string;
  /** The `:language:` option value, or inferred from the file extension. */
  language?: string;
  /** Directive type that triggered the migrate request. */
  directiveType: "literalinclude" | "input" | "output";
  /** Relative path (from Claude project root) of the RST file containing the directive. */
  rstFile: string;
  /** Zero-indexed line number of the directive in the RST file. */
  rstLine: number;
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
 * Resolve the Claude project root for the current VS Code workspace.
 *
 * Walks up from the first workspace folder looking for `.claude/skills/`
 * (the Claude Code project root), falling back to the workspace folder
 * itself if no marker is found.
 *
 * Callers building handoff `context` MUST compute their relative paths
 * against this root — not against the workspace folder — so paths
 * remain valid when the writer opens a subdirectory as their workspace
 * but the handoff file lands at an ancestor directory. Passing the
 * same root to `writeHandoff` guarantees the envelope's `workspaceRoot`
 * and the relative paths inside `context` share a base.
 *
 * Returns `undefined` if no workspace folder is open.
 */
export async function resolveClaudeRoot(
  anchorUri?: vscode.Uri,
): Promise<string | undefined> {
  const workspaceFolder = anchorUri
    ? vscode.workspace.getWorkspaceFolder(anchorUri)
    : vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return undefined;
  const workspacePath = workspaceFolder.uri.fsPath;
  return (await findClaudeProjectRoot(workspacePath)) ?? workspacePath;
}

async function tryCommand(command: string, ...args: unknown[]): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(command, ...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open Claude Code with a skill slash command pre-filled.
 *
 * Tries the primary editor first, then falls back to opening the sidebar.
 * Returns `true` only when the primary editor opens successfully.
 */
export async function openClaudeWithSkill(skill: HandoffSkill): Promise<boolean> {
  const slashCommand = `/${skill}`;
  if (
    await tryCommand(
      "claude-vscode.primaryEditor.open",
      undefined,
      slashCommand,
    )
  ) {
    return true;
  }

  await tryCommand("claude-vscode.sidebar.open");
  return false;
}

/**
 * Write a handoff payload to `<claudeRoot>/.claude/grove-handoff.json`.
 *
 * `claudeRoot` must be the value returned by `resolveClaudeRoot()` — the
 * caller is responsible for resolving it and using the same root as the
 * base for any relative paths inside `context`. This keeps the envelope's
 * `workspaceRoot` field and the paths inside `context` consistent, so
 * consuming skills can resolve paths against a single known base.
 *
 * Returns the URI written to. The payload overwrites any existing file —
 * handoffs are single-use.
 */
export async function writeHandoff<TContext>(
  skill: HandoffSkill,
  trigger: string,
  context: TContext,
  claudeRoot: string,
): Promise<vscode.Uri> {
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
