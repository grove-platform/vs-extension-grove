/**
 * Ripgrep-based Snippet Reference Searcher
 *
 * Uses ripgrep directly to find references to Bluehawk snippets,
 * enabling results to be shown in VS Code's peek view.
 */

import * as vscode from "vscode";
import * as path from "path";
import { spawn } from "child_process";
import { profile } from "@grove/shared";

/**
 * Get the path to VS Code's built-in ripgrep binary.
 * VS Code ships with ripgrep, so we use that instead of bundling our own.
 */
function getVSCodeRipgrepPath(): string {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "rg.exe" : "rg";

  // VS Code's ripgrep is located in the app's node_modules
  return path.join(
    vscode.env.appRoot,
    "node_modules",
    "@vscode",
    "ripgrep",
    "bin",
    binaryName,
  );
}

export interface SnippetReference {
  uri: vscode.Uri;
  line: number;
  column: number;
  matchedText: string;
}

// ============================================================================
// Cache for snippet references
// ============================================================================

interface CacheEntry {
  references: SnippetReference[];
  timestamp: number;
}

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 50;

// LRU-style cache: Map maintains insertion order, we delete oldest when full
const referenceCache = new Map<string, CacheEntry>();

/**
 * Generate cache key from snippet name and source extension.
 */
function getCacheKey(snippetName: string, sourceExt?: string): string {
  return `${snippetName}:${sourceExt ?? "*"}`;
}

/**
 * Get cached references if valid.
 */
function getCachedReferences(key: string): SnippetReference[] | undefined {
  const entry = referenceCache.get(key);
  if (!entry) {
    return undefined;
  }

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    referenceCache.delete(key);
    return undefined;
  }

  // Move to end (most recently used) by re-inserting
  referenceCache.delete(key);
  referenceCache.set(key, entry);

  return entry.references;
}

/**
 * Store references in cache.
 */
function setCachedReferences(
  key: string,
  references: SnippetReference[],
): void {
  // Evict oldest entries if at capacity
  while (referenceCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = referenceCache.keys().next().value;
    if (oldestKey) {
      referenceCache.delete(oldestKey);
    }
  }

  referenceCache.set(key, {
    references,
    timestamp: Date.now(),
  });
}

/**
 * Clear the reference cache. Can be called when files change.
 */
export function clearReferenceCache(): void {
  referenceCache.clear();
}

/**
 * Find all references to a snippet using ripgrep.
 *
 * Searches for both patterns:
 * 1. :snippet: snippet-name (option style)
 * 2. .snippet.snippet-name. (extracted file style)
 *
 * Results are cached for 5 minutes with LRU eviction.
 */
export async function findSnippetReferencesWithRipgrep(
  snippetName: string,
  sourceFileUri?: vscode.Uri,
): Promise<SnippetReference[]> {
  // Extract file extension from source file to filter by language
  const sourceExt = sourceFileUri
    ? sourceFileUri.fsPath.split(".").pop()?.toLowerCase()
    : undefined;

  // Check cache first
  const cacheKey = getCacheKey(snippetName, sourceExt);
  const cached = getCachedReferences(cacheKey);
  if (cached) {
    return cached;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const references: SnippetReference[] = [];
  const seen = new Set<string>(); // For deduplication

  for (const folder of workspaceFolders) {
    const results = await profile("Ripgrep.search", () =>
      runRipgrep(snippetName, folder.uri.fsPath, snippetName, sourceExt),
    );

    // Deduplicate results
    for (const ref of results) {
      const key = `${ref.uri.fsPath}:${ref.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push(ref);
      }
    }
  }

  // Store in cache
  setCachedReferences(cacheKey, references);

  return references;
}

/**
 * Run ripgrep and parse JSON output.
 * Filters results to only include lines that reference the snippet via:
 * - :snippet: snippet-name
 * - .snippet.snippet-name.
 * Also filters by source file extension if provided.
 */
async function runRipgrep(
  pattern: string,
  cwd: string,
  snippetName: string,
  sourceExt?: string,
): Promise<SnippetReference[]> {
  return new Promise((resolve) => {
    const references: SnippetReference[] = [];

    const args = [
      "--json",
      "--fixed-strings", // treat pattern as a literal string, not a regex
      "--glob",
      "content/**/source/**/*.rst",
      "--glob",
      "content/**/source/**/*.txt",
      "--ignore-case",
      pattern,
    ];

    // stdio: ignore stdin, pipe stdout/stderr
    // Without this, ripgrep may hang waiting for stdin
    const rgPath = getVSCodeRipgrepPath();
    const rg = spawn(rgPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      rg.kill();
    }, 30000);

    rg.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    rg.on("close", () => {
      clearTimeout(timeout);

      // Parse JSON lines
      const lines = stdout.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // We only care about "match" type results
          if (json.type === "match" && json.data) {
            const data = json.data;
            const filePath = data.path?.text;
            const lineNumber = data.line_number;
            const lineText = data.lines?.text || "";

            // Filter: only include lines that actually reference the snippet
            // via :snippet: option or .snippet.name. in the path
            const isSnippetOption =
              lineText.includes(`:snippet: ${snippetName}`) ||
              lineText.includes(`:snippet:${snippetName}`);
            const isSnippetFile = lineText.includes(`.snippet.${snippetName}.`);

            if (!isSnippetOption && !isSnippetFile) {
              continue;
            }

            // Filter by source file extension if provided
            // This ensures we only show references for the same programming language
            if (sourceExt && !lineText.includes(`.${sourceExt}`)) {
              continue;
            }

            if (filePath && lineNumber) {
              const column = data.submatches?.[0]?.start ?? 0;

              // Resolve relative paths to absolute using cwd
              const absolutePath = filePath.startsWith("/")
                ? filePath
                : `${cwd}/${filePath}`;

              references.push({
                uri: vscode.Uri.file(absolutePath),
                line: lineNumber - 1, // Convert to 0-based
                column,
                matchedText: lineText.trim(),
              });
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }

      resolve(references);
    });

    rg.on("error", () => {
      resolve([]);
    });
  });
}
