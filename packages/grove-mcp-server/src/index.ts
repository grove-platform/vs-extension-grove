import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleGetStatus } from "./tools/get-status.js";
import { handleReadFile } from "./tools/read-file.js";
import { handleRunTests } from "./tools/run-tests.js";
import { globalQueue } from "./execution-queue.js";

const server = new Server(
  { name: "grove", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "grove_get_status",
      description:
        "Get Grove project status including detected projects and MongoDB connection state",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "grove_read_file",
      description:
        "Read a file from the Grove project. Returns file contents with size limits enforced.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to file from project root",
          },
          projectPath: {
            type: "string",
            description:
              "Optional: Project root path if multiple projects exist",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "grove_run_tests",
      description:
        "Run tests in a Grove project. Returns test results including pass/fail counts and output.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description:
              "Optional: Project root path if multiple projects exist",
          },
          testFile: {
            type: "string",
            description: "Optional: Specific test file to run (relative path)",
          },
          language: {
            type: "string",
            enum: ["nodejs", "python", "go", "java", "csharp", "mongosh"],
            description: "Optional: Override auto-detected language",
          },
          timeout: {
            type: "number",
            description: "Optional: Timeout in seconds (default: 60, max: 300)",
          },
        },
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "grove_get_status":
      return handleGetStatus(args || {});
    case "grove_read_file":
      return handleReadFile(args || {});
    case "grove_run_tests":
      // Queue test runs to prevent concurrent executions
      return globalQueue.enqueue(name, () => handleRunTests(args || {}));
    default:
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
