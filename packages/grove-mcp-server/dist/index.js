import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { handleGetStatus } from "./tools/get-status.js";
import { handleReadFile } from "./tools/read-file.js";
const server = new Server({ name: "grove", version: "0.0.1" }, { capabilities: { tools: {} } });
// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "grove_get_status",
            description: "Get Grove project status including detected projects and MongoDB connection state",
            inputSchema: {
                type: "object",
                properties: {},
                required: [],
            },
        },
        {
            name: "grove_read_file",
            description: "Read a file from the Grove project. Returns file contents with size limits enforced.",
            inputSchema: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to file from project root",
                    },
                    projectPath: {
                        type: "string",
                        description: "Optional: Project root path if multiple projects exist",
                    },
                },
                required: ["path"],
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
        default:
            return {
                isError: true,
                content: [{ type: "text", text: `Unknown tool: ${name}` }],
            };
    }
});
// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
//# sourceMappingURL=index.js.map