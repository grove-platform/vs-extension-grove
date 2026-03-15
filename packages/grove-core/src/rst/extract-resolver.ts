/**
 * Grove Extract Resolver
 *
 * Resolves extract include paths to their YAML source locations.
 * Extract paths like "/includes/extracts/foo.rst" reference
 * "ref: foo" entries in extracts*.yaml files.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { findSourceDir } from "./path-resolver";

export interface ExtractResolution {
  /** Absolute path to the YAML file containing the extract */
  yamlFilePath: string;
  /** 1-based line number where the ref is defined */
  lineNumber: number;
  /** The ref name that was matched */
  refName: string;
  /** Whether the extract was found */
  exists: boolean;
  /** Error message if not found */
  error?: string;
}

/** Cache: directory path -> Map of refName -> resolution */
const extractCache = new Map<string, Map<string, ExtractResolution>>();

/**
 * Extract the ref name from an extract path.
 * "/includes/extracts/ssl-facts-x509-ca-file.rst" -> "ssl-facts-x509-ca-file"
 */
export function getRefNameFromPath(extractPath: string): string {
  const filename = path.basename(extractPath, ".rst");
  return filename;
}

/**
 * Find the includes directory for a given RST file.
 */
function findIncludesDir(rstFilePath: string): string | undefined {
  const sourceDir = findSourceDir(rstFilePath);
  if (!sourceDir) return undefined;

  const includesDir = path.join(sourceDir, "includes");
  return fs.existsSync(includesDir) ? includesDir : undefined;
}

/**
 * Parse all extracts*.yaml files in a directory and cache the results.
 */
async function parseExtractsInDirectory(
  includesDir: string,
): Promise<Map<string, ExtractResolution>> {
  // Return cached results if available
  const cached = extractCache.get(includesDir);
  if (cached) {
    return cached;
  }

  const results = new Map<string, ExtractResolution>();

  // Find all extracts*.yaml files
  const files = await fs.promises.readdir(includesDir);
  const extractFiles = files.filter(
    (f) => f.startsWith("extracts") && f.endsWith(".yaml"),
  );

  for (const filename of extractFiles) {
    const filePath = path.join(includesDir, filename);
    await parseExtractFile(filePath, results);
  }

  extractCache.set(includesDir, results);
  return results;
}

/**
 * Parse a single extracts YAML file and add entries to results map.
 */
async function parseExtractFile(
  filePath: string,
  results: Map<string, ExtractResolution>,
): Promise<void> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // Parse multi-document YAML with json:true to allow duplicate keys
    // (some YAML files have duplicate keys within documents which is technically invalid
    // but js-yaml can handle it with json compatibility mode)
    const docs: Array<{ ref?: string }> = [];
    yaml.loadAll(
      content,
      (doc) => {
        docs.push(doc as { ref?: string });
      },
      { json: true },
    );

    for (const doc of docs) {
      if (!doc || typeof doc.ref !== "string") continue;

      // Find the line number of this ref
      const lineNumber = findRefLineNumber(lines, doc.ref);

      results.set(doc.ref, {
        yamlFilePath: filePath,
        lineNumber,
        refName: doc.ref,
        exists: true,
      });
    }
  } catch {
    // Silently skip files that can't be parsed
  }
}

/**
 * Find the 1-based line number where a ref is defined.
 */
function findRefLineNumber(lines: string[], refName: string): number {
  const pattern = new RegExp(`^ref:\\s*${escapeRegex(refName)}\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1; // Convert to 1-based
    }
  }
  return 1; // Default to first line if not found
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve an extract path to its YAML source location.
 *
 * @param rstFilePath - Absolute path to the RST file containing the include
 * @param extractPath - The extract path from the include directive (e.g., "/includes/extracts/foo.rst")
 * @returns Resolution with YAML file path and line number, or error
 */
export async function resolveExtract(
  rstFilePath: string,
  extractPath: string,
): Promise<ExtractResolution> {
  const refName = getRefNameFromPath(extractPath);
  const includesDir = findIncludesDir(rstFilePath);

  if (!includesDir) {
    return {
      yamlFilePath: "",
      lineNumber: 0,
      refName,
      exists: false,
      error: "Could not find includes directory",
    };
  }

  const extracts = await parseExtractsInDirectory(includesDir);
  const resolution = extracts.get(refName);

  if (resolution) {
    return resolution;
  }

  return {
    yamlFilePath: "",
    lineNumber: 0,
    refName,
    exists: false,
    error: `Extract ref "${refName}" not found in any extracts*.yaml file`,
  };
}

/**
 * Clear the extract cache. Used for testing and when YAML files change.
 */
export function clearExtractCache(): void {
  extractCache.clear();
}
