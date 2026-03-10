/**
 * Handle grove_get_status tool invocation.
 * Returns project status WITHOUT sensitive information.
 */
export declare function handleGetStatus(_args: Record<string, unknown>): Promise<{
    isError: boolean;
    content: {
        type: string;
        text: string;
    }[];
} | {
    content: {
        type: string;
        text: string;
    }[];
    isError?: undefined;
}>;
//# sourceMappingURL=get-status.d.ts.map