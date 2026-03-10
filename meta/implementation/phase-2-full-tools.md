# Phase 2: Full MCP Tool Suite

**Goal**: Implement remaining MCP tools for complete Grove workflow: create examples, snip code, preview Bluehawk output, and manage symlinks.

**Validates**: Full AI-assisted documentation workflow works end-to-end.

**Depends on**: Phase 1c completed.

---

## Prerequisites

- Phase 1c complete and passing all tests
- `@mongodb-oss/bluehawk` library available
- Understanding of Bluehawk snipping workflow

---

## Overview of Tools

| Tool                     | Description                             | Category |
| ------------------------ | --------------------------------------- | -------- |
| `grove_create_example`   | Create new example file from template   | Write    |
| `grove_snip_code`        | Run Bluehawk to extract snippets        | Write    |
| `grove_preview_bluehawk` | Preview Bluehawk output without writing | Read     |
| `grove_list_templates`   | List available example templates        | Read     |
| `grove_get_snippets`     | Get snippet IDs from a file             | Read     |
| `grove_manage_symlinks`  | Create/remove docs repo symlinks        | Write    |

---

## Task 1: Install Bluehawk Library

### 1.1 Add dependency to packages/grove-mcp-server/package.json

```bash
cd packages/grove-mcp-server
pnpm add @mongodb-oss/bluehawk
```

### 1.2 Create packages/grove-mcp-server/src/bluehawk/index.ts

```typescript
import { Bluehawk, Document } from "@mongodb-oss/bluehawk";

let bluehawkInstance: Bluehawk | null = null;

/**
 * Get or create Bluehawk instance.
 */
export function getBluehawk(): Bluehawk {
  if (!bluehawkInstance) {
    bluehawkInstance = new Bluehawk();
  }
  return bluehawkInstance;
}

/**
 * Process a file with Bluehawk and return snippets.
 */
export async function processFile(
  filePath: string,
  options?: { state?: string },
): Promise<Map<string, Document>> {
  const bluehawk = getBluehawk();
  const result = await bluehawk.parse(filePath);

  if (result.errors.length > 0) {
    throw new Error(
      `Bluehawk parse errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  return bluehawk.process(result.document, { state: options?.state });
}

/**
 * Extract snippet IDs from a file.
 */
export async function getSnippetIds(filePath: string): Promise<string[]> {
  const bluehawk = getBluehawk();
  const result = await bluehawk.parse(filePath);

  if (result.errors.length > 0) {
    throw new Error(
      `Bluehawk parse errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const ids: string[] = [];
  // Walk the AST to find snippet tags
  // This is a simplified version - actual implementation needs to traverse the parsed AST

  return ids;
}
```

---

## Task 2: Implement grove_create_example Tool

### 2.1 Create packages/grove-mcp-server/src/tools/create-example.ts

````typescript
import * as fs from "fs/promises";
import * as path from "path";
import { isPathWithinBoundary } from "@grove/shared";

const MAX_FILE_SIZE = 100 * 1024; // 100KB

interface CreateExampleArgs {
  name: string;
  template?: string;
  projectPath?: string;
  content?: string;
}

export async function handleCreateExample(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const { name, template, projectPath, content } = args as CreateExampleArgs;

  if (!workspacePath) {
    return errorResponse("GROVE_WORKSPACE not set.");
  }

  if (!name) {
    return errorResponse("Missing required parameter: name");
  }

  // Validate file name
  if (!/^[a-zA-Z0-9_-]+\.(js|ts|py|go|java|cs)$/.test(name)) {
    return errorResponse("Invalid file name. Use alphanumeric characters with valid extension.");
  }

  // Resolve paths
  const basePath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;
  const examplesDir = path.join(basePath, "examples");
  const targetPath = path.join(examplesDir, name);

  // Security: Validate paths
  if (!isPathWithinBoundary(targetPath, workspacePath)) {
    return errorResponse("Target path outside workspace boundaries.");
  }

  // Check if file already exists
  try {
    await fs.access(targetPath);
    return errorResponse(`File already exists: ${name}`);
  } catch {
    // File doesn't exist, continue
  }


---

## Task 3: Implement grove_snip_code Tool

### 3.1 Create packages/grove-mcp-server/src/tools/snip-code.ts

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import { processFile } from "../bluehawk";
import { isPathWithinBoundary } from "@grove/shared";

interface SnipCodeArgs {
  sourceFile: string;
  outputDir?: string;
  projectPath?: string;
  state?: string;
}

export async function handleSnipCode(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const { sourceFile, outputDir, projectPath, state } = args as SnipCodeArgs;

  if (!workspacePath) {
    return errorResponse("GROVE_WORKSPACE not set.");
  }

  if (!sourceFile) {
    return errorResponse("Missing required parameter: sourceFile");
  }

  // Resolve paths
  const basePath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;
  const sourcePath = path.resolve(basePath, sourceFile);
  const outDir = outputDir
    ? path.resolve(basePath, outputDir)
    : path.join(basePath, "snippets");

  // Security: Validate paths
  if (!isPathWithinBoundary(sourcePath, workspacePath)) {
    return errorResponse("Source path outside workspace.");
  }
  if (!isPathWithinBoundary(outDir, workspacePath)) {
    return errorResponse("Output path outside workspace.");
  }

  try {
    // Process with Bluehawk
    const documents = await processFile(sourcePath, { state });

    // Ensure output directory exists
    await fs.mkdir(outDir, { recursive: true });

    // Write snippet files
    const written: string[] = [];
    for (const [id, doc] of documents) {
      const outputPath = path.join(outDir, `${id}${path.extname(sourceFile)}`);
      await fs.writeFile(outputPath, doc.text, "utf-8");
      written.push(path.relative(workspacePath, outputPath));
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          snippetsCreated: written.length,
          files: written,
        }),
      }],
    };
  } catch (error) {
    return errorResponse(`Snipping failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
````

### 3.2 Add tool schema

```typescript
{
  name: "grove_snip_code",
  description: "Run Bluehawk to extract code snippets from a source file.",
  inputSchema: {
    type: "object",
    properties: {
      sourceFile: {
        type: "string",
        description: "Path to source file containing snippet tags",
      },
      outputDir: {
        type: "string",
        description: "Optional: Output directory for snippets (default: 'snippets/')",
      },
      projectPath: {
        type: "string",
        description: "Optional: Project path if multiple projects",
      },
      state: {
        type: "string",
        description: "Optional: Bluehawk state to use for conditional snippets",
      },
    },
    required: ["sourceFile"],
  },
}
```

---

## Task 4: Implement grove_preview_bluehawk Tool

### 4.1 Create packages/grove-mcp-server/src/tools/preview-bluehawk.ts

```typescript
import { processFile } from "../bluehawk";
import * as path from "path";
import { isPathWithinBoundary } from "@grove/shared";

interface PreviewArgs {
  sourceFile: string;
  projectPath?: string;
  state?: string;
  snippetId?: string;
}

export async function handlePreviewBluehawk(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const { sourceFile, projectPath, state, snippetId } = args as PreviewArgs;

  if (!workspacePath) {
    return errorResponse("GROVE_WORKSPACE not set.");
  }

  if (!sourceFile) {
    return errorResponse("Missing required parameter: sourceFile");
  }

  const basePath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;
  const sourcePath = path.resolve(basePath, sourceFile);

  if (!isPathWithinBoundary(sourcePath, workspacePath)) {
    return errorResponse("Source path outside workspace.");
  }

  try {
    const documents = await processFile(sourcePath, { state });

    if (snippetId) {
      const doc = documents.get(snippetId);
      if (!doc) {
        return errorResponse(`Snippet not found: ${snippetId}`);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              snippetId,
              content: doc.text,
            }),
          },
        ],
      };
    }

    // Return all snippets
    const snippets: Record<string, string> = {};
    for (const [id, doc] of documents) {
      snippets[id] = doc.text;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            snippetCount: Object.keys(snippets).length,
            snippets,
          }),
        },
      ],
    };
  } catch (error) {
    return errorResponse(
      `Preview failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
```

---

## Task 5: Implement grove_list_templates Tool

### 5.1 Create packages/grove-mcp-server/src/tools/list-templates.ts

```typescript
import * as fs from "fs/promises";
import * as path from "path";

interface Template {
  name: string;
  description: string;
  language: string;
  path: string;
}

export async function handleListTemplates(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const language = args.language as string | undefined;

  if (!workspacePath) {
    return errorResponse("GROVE_WORKSPACE not set.");
  }

  // Built-in templates
  const templates: Template[] = [
    {
      name: "basic-crud",
      description: "CRUD operations example",
      language: "nodejs",
      path: "templates/nodejs/basic-crud.js",
    },
    {
      name: "aggregation",
      description: "Aggregation pipeline example",
      language: "nodejs",
      path: "templates/nodejs/aggregation.js",
    },
    {
      name: "transactions",
      description: "Transaction handling example",
      language: "nodejs",
      path: "templates/nodejs/transactions.js",
    },
    {
      name: "basic-crud",
      description: "CRUD operations example",
      language: "python",
      path: "templates/python/basic_crud.py",
    },
    {
      name: "async-crud",
      description: "Async CRUD with Motor",
      language: "python",
      path: "templates/python/async_crud.py",
    },
  ];

  // Filter by language if specified
  const filtered = language
    ? templates.filter((t) => t.language === language)
    : templates;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          templates: filtered,
          count: filtered.length,
        }),
      },
    ],
  };
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
```

---

## Task 6: Implement grove_manage_symlinks Tool

### 6.1 Create packages/grove-mcp-server/src/tools/manage-symlinks.ts

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import { isPathWithinBoundary } from "@grove/shared";

interface SymlinkArgs {
  action: "create" | "remove" | "list";
  target?: string;
  linkPath?: string;
  projectPath?: string;
}

export async function handleManageSymlinks(args: Record<string, unknown>) {
  const workspacePath = process.env.GROVE_WORKSPACE;
  const { action, target, linkPath, projectPath } = args as SymlinkArgs;

  if (!workspacePath) {
    return errorResponse("GROVE_WORKSPACE not set.");
  }

  const basePath = projectPath
    ? path.resolve(workspacePath, projectPath)
    : workspacePath;

  switch (action) {
    case "list":
      return listSymlinks(basePath, workspacePath);
    case "create":
      return createSymlink(basePath, workspacePath, target!, linkPath!);
    case "remove":
      return removeSymlink(basePath, workspacePath, linkPath!);
    default:
      return errorResponse(`Unknown action: ${action}`);
  }
}

async function listSymlinks(basePath: string, workspacePath: string) {
  const symlinksDir = path.join(basePath, "symlinks");

  try {
    const entries = await fs.readdir(symlinksDir, { withFileTypes: true });
    const symlinks = entries
      .filter((e) => e.isSymbolicLink())
      .map((e) => e.name);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ symlinks }),
        },
      ],
    };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ symlinks: [] }),
        },
      ],
    };
  }
}

async function createSymlink(
  basePath: string,
  workspacePath: string,
  target: string,
  linkPath: string,
) {
  const targetAbs = path.resolve(basePath, target);
  const linkAbs = path.resolve(basePath, linkPath);

  // Validate paths
  if (!isPathWithinBoundary(targetAbs, workspacePath)) {
    return errorResponse("Target path outside workspace.");
  }
  if (!isPathWithinBoundary(linkAbs, workspacePath)) {
    return errorResponse("Link path outside workspace.");
  }

  try {
    await fs.mkdir(path.dirname(linkAbs), { recursive: true });
    await fs.symlink(targetAbs, linkAbs);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Created symlink: ${linkPath} -> ${target}`,
          }),
        },
      ],
    };
  } catch (error) {
    return errorResponse(
      `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function removeSymlink(
  basePath: string,
  workspacePath: string,
  linkPath: string,
) {
  const linkAbs = path.resolve(basePath, linkPath);

  if (!isPathWithinBoundary(linkAbs, workspacePath)) {
    return errorResponse("Link path outside workspace.");
  }

  try {
    const stats = await fs.lstat(linkAbs);
    if (!stats.isSymbolicLink()) {
      return errorResponse("Path is not a symlink.");
    }

    await fs.unlink(linkAbs);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Removed symlink: ${linkPath}`,
          }),
        },
      ],
    };
  } catch (error) {
    return errorResponse(
      `Failed to remove symlink: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
```

---

## Task 7: Update MCP Server with All Tools

### 7.1 Update packages/grove-mcp-server/src/index.ts

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { globalQueue } from "./execution-queue";

// Import all tool handlers
import { handleGetStatus } from "./tools/get-status";
import { handleReadFile } from "./tools/read-file";
import { handleRunTests } from "./tools/run-tests";
import { handleCreateExample } from "./tools/create-example";
import { handleSnipCode } from "./tools/snip-code";
import { handlePreviewBluehawk } from "./tools/preview-bluehawk";
import { handleListTemplates } from "./tools/list-templates";
import { handleManageSymlinks } from "./tools/manage-symlinks";

// Tool definitions
const TOOLS = [
  {
    name: "grove_get_status",
    description: "Get Grove project status",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "grove_read_file",
    description: "Read a file from the Grove project",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" },
        projectPath: { type: "string", description: "Optional project path" },
      },
      required: ["path"],
    },
  },
  // ... add all other tool definitions
];

// Tools that need queuing (write operations)
const QUEUED_TOOLS = [
  "grove_run_tests",
  "grove_create_example",
  "grove_snip_code",
  "grove_manage_symlinks",
];

// Tool handler mapping
const HANDLERS: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  grove_get_status: handleGetStatus,
  grove_read_file: handleReadFile,
  grove_run_tests: handleRunTests,
  grove_create_example: handleCreateExample,
  grove_snip_code: handleSnipCode,
  grove_preview_bluehawk: handlePreviewBluehawk,
  grove_list_templates: handleListTemplates,
  grove_manage_symlinks: handleManageSymlinks,
};

const server = new Server(
  { name: "grove", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = HANDLERS[name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  if (QUEUED_TOOLS.includes(name)) {
    return globalQueue.enqueue(name, () => handler(args || {}));
  }

  return handler(args || {});
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

---

## Acceptance Criteria

Phase 2 is complete when:

- [ ] `grove_create_example` creates files with proper templates
- [ ] `grove_snip_code` extracts Bluehawk snippets correctly
- [ ] `grove_preview_bluehawk` returns snippet previews without writing files
- [ ] `grove_list_templates` returns available templates filtered by language
- [ ] `grove_manage_symlinks` can create, remove, and list symlinks
- [ ] All path validation prevents workspace escape
- [ ] File size limits enforced (100KB for created files)
- [ ] Write operations are queued to prevent race conditions
- [ ] All unit tests pass (`pnpm test`)

---

## Security Checklist

- [ ] All paths validated within workspace boundaries
- [ ] File names validated against allowlist pattern
- [ ] Content size limited to 100KB
- [ ] Symlink targets validated within workspace
- [ ] No arbitrary code execution from templates
- [ ] snip.js validated as proper Bluehawk config before use

  // Get content
  let fileContent: string;
  if (content) {
  if (content.length > MAX_FILE_SIZE) {
  return errorResponse(`Content exceeds ${MAX_FILE_SIZE} byte limit.`);
  }
  fileContent = content;
  } else if (template) {
  fileContent = await getTemplateContent(template, name);
  } else {
  fileContent = getDefaultTemplate(name);
  }

  // Ensure examples directory exists
  await fs.mkdir(examplesDir, { recursive: true });

  // Write file
  await fs.writeFile(targetPath, fileContent, "utf-8");

  return {
  content: [{
  type: "text",
  text: JSON.stringify({
  success: true,
  path: path.relative(workspacePath, targetPath),
  message: `Created example: ${name}`,
  }),
  }],
  };
  }

function errorResponse(message: string) {
return {
isError: true,
content: [{ type: "text", text: message }],
};
}

async function getTemplateContent(templateName: string, fileName: string): Promise<string> {
// Templates would be loaded from the extension's template directory
// For now, return a placeholder
return getDefaultTemplate(fileName);
}

function getDefaultTemplate(fileName: string): string {
const ext = path.extname(fileName);

const templates: Record<string, string> = {
".js": `// :snippet-start: example
// Your code here
// :snippet-end:
`,
".ts": `// :snippet-start: example
// Your code here
// :snippet-end:
`,
".py": `# :snippet-start: example

# Your code here

# :snippet-end:

`,
};

return templates[ext] || templates[".js"];
}

````

### 2.2 Add tool to ListToolsRequestSchema

```typescript
{
  name: "grove_create_example",
  description: "Create a new example file in the Grove project. Uses templates or custom content.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "File name with extension (e.g., 'connect.js')",
      },
      template: {
        type: "string",
        description: "Optional: Template name to use",
      },
      projectPath: {
        type: "string",
        description: "Optional: Project path if multiple projects",
      },
      content: {
        type: "string",
        description: "Optional: Custom file content (max 100KB)",
      },
    },
    required: ["name"],
  },
}
````
