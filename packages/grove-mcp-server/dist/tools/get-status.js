import { detectGroveProjects } from "@grove/shared";
/**
 * Handle grove_get_status tool invocation.
 * Returns project status WITHOUT sensitive information.
 */
export async function handleGetStatus(_args) {
    const workspacePath = process.env.GROVE_WORKSPACE;
    if (!workspacePath) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: "GROVE_WORKSPACE environment variable not set. Configure the MCP server with your workspace path.",
                },
            ],
        };
    }
    try {
        const projects = await detectGroveProjects(workspacePath);
        const status = {
            hasProject: projects.length > 0,
            activeProject: projects[0] ?? null,
            projects,
            mongoConnection: {
                connected: false, // Placeholder - will be implemented later
                clusterType: "unknown",
            },
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(status, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Failed to get Grove status: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
        };
    }
}
//# sourceMappingURL=get-status.js.map