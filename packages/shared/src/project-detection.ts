import * as path from "path";
import * as fs from "fs/promises";
import { GroveProject, GroveLanguage } from "./types";

/**
 * Detect Grove projects by finding snip.js files.
 * @param workspacePath - Absolute path to workspace root
 * @returns Array of detected Grove projects
 */
export async function detectGroveProjects(
  workspacePath: string,
): Promise<GroveProject[]> {
  const projects: GroveProject[] = [];
  const snipFiles = await findSnipFiles(workspacePath);

  for (const snipPath of snipFiles) {
    const projectRoot = path.dirname(snipPath);
    const relativePath = path.relative(workspacePath, projectRoot) || ".";
    const language = await detectLanguage(projectRoot);
    const hasValidConfig = await validateSnipConfig(snipPath);

    projects.push({
      rootPath: projectRoot,
      relativePath,
      language,
      hasValidConfig,
    });
  }

  return projects;
}

/**
 * Recursively find all snip.js files in the workspace.
 */
async function findSnipFiles(
  dir: string,
  maxDepth: number = 5,
): Promise<string[]> {
  const results: string[] = [];

  if (maxDepth <= 0) {
    return results;
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        const subResults = await findSnipFiles(fullPath, maxDepth - 1);
        results.push(...subResults);
      } else if (entry.name === "snip.js") {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Directory not readable, skip
  }

  return results;
}

/**
 * Detect language based on project files.
 */
export async function detectLanguage(
  projectPath: string,
): Promise<GroveLanguage | null> {
  // Check for Node.js (package.json with jest)
  try {
    const pkgPath = path.join(projectPath, "package.json");
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    if (
      pkg.devDependencies?.jest ||
      pkg.dependencies?.jest ||
      pkg.devDependencies?.vitest ||
      pkg.dependencies?.vitest
    ) {
      return "nodejs";
    }
    // Check for mongosh projects
    if (pkg.name?.includes("mongosh")) {
      return "mongosh";
    }
  } catch {
    // No package.json or not readable
  }

  // Check for Python (pyproject.toml or pytest.ini)
  try {
    await fs.access(path.join(projectPath, "pyproject.toml"));
    return "python";
  } catch {
    try {
      await fs.access(path.join(projectPath, "pytest.ini"));
      return "python";
    } catch {
      // Not Python
    }
  }

  // Check for Go (go.mod)
  try {
    await fs.access(path.join(projectPath, "go.mod"));
    return "go";
  } catch {
    // Not Go
  }

  // Check for Java (pom.xml or build.gradle)
  try {
    await fs.access(path.join(projectPath, "pom.xml"));
    return "java";
  } catch {
    try {
      await fs.access(path.join(projectPath, "build.gradle"));
      return "java";
    } catch {
      // Not Java
    }
  }

  // Check for C# (*.csproj)
  try {
    const entries = await fs.readdir(projectPath);
    if (entries.some((e) => e.endsWith(".csproj"))) {
      return "csharp";
    }
  } catch {
    // Not C#
  }

  return null;
}

/**
 * Validate snip.js configuration.
 */
export async function validateSnipConfig(snipPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(snipPath, "utf-8");
    // Basic validation: check if it looks like a valid JS module export
    return (
      content.includes("module.exports") || content.includes("export default")
    );
  } catch {
    return false;
  }
}

/**
 * Find which Grove project contains a given file path.
 * Returns the project whose rootPath is an ancestor of the file.
 */
export function findProjectForFile(
  filePath: string,
  projects: GroveProject[],
): GroveProject | undefined {
  // Normalize the file path
  const normalizedFile = path.resolve(filePath);

  // Find all projects that contain this file (file is under project root)
  const matchingProjects = projects.filter((project) => {
    const normalizedRoot = path.resolve(project.rootPath);
    return normalizedFile.startsWith(normalizedRoot + path.sep);
  });

  if (matchingProjects.length === 0) {
    return undefined;
  }

  // Return the most specific match (deepest project root)
  return matchingProjects.reduce((best, current) =>
    current.rootPath.length > best.rootPath.length ? current : best,
  );
}
