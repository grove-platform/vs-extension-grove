import * as fs from "fs/promises";
import * as path from "path";
import { isPathWithinBoundary, sanitizePath } from "@grove/shared";

const MAX_FILE_SIZE = 100 * 1024; // 100KB limit

/**
 * Handle grove_read_file tool invocation.
 * Security: Validates path is within workspace boundaries.
 */
export async function handleReadFile(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const filePath = args.path as string;
  const projectPath = (args.projectPath as string) || "";

  if (!workspacePath) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "GROVE_WORKSPACE environment variable not set.",
        },
      ],
    };
  }

  if (!filePath) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Missing required parameter: path",
        },
      ],
    };
  }

  // Sanitize the input path
  const sanitizedPath = sanitizePath(filePath);

  // Resolve absolute path
  const basePath = projectPath
    ? path.resolve(workspacePath, sanitizePath(projectPath))
    : workspacePath;
  const absolutePath = path.resolve(basePath, sanitizedPath);

  // Security: Ensure path is within workspace
  if (!isPathWithinBoundary(absolutePath, workspacePath)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Path traversal denied: ${filePath} is outside workspace boundaries.`,
        },
      ],
    };
  }

  try {
    // Check file size before reading
    const stats = await fs.stat(absolutePath);

    if (stats.size > MAX_FILE_SIZE) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `File too large: ${stats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit. Use a text editor to view this file.`,
          },
        ],
      };
    }

    const content = await fs.readFile(absolutePath, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `File not found: ${filePath}`,
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

