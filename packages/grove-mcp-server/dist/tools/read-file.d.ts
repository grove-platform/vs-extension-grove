/**
 * Handle grove_read_file tool invocation.
 * Security: Validates path is within workspace boundaries.
 */
export declare function handleReadFile(args: Record<string, unknown>): Promise<{
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
//# sourceMappingURL=read-file.d.ts.map