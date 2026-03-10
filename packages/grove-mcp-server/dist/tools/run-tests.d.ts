/**
 * Handle grove_run_tests tool invocation.
 * Security: Uses allowlisted commands only, validates paths, enforces timeouts.
 */
export declare function handleRunTests(args: Record<string, unknown>): Promise<{
    isError?: boolean;
    content: Array<{
        type: "text";
        text: string;
    }>;
} | {
    isError: boolean;
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=run-tests.d.ts.map