/**
 * Execution queue to prevent concurrent tool executions.
 * Max 1 execution per tool type at a time.
 */
export declare class ExecutionQueue {
    private queues;
    private running;
    /**
     * Enqueue a task for sequential execution.
     * Tasks with the same toolName are executed one at a time.
     * Different tools can execute in parallel.
     */
    enqueue<T>(toolName: string, execute: () => Promise<T>): Promise<T>;
    private processQueue;
    /**
     * Get the number of pending tasks for a tool.
     */
    getPendingCount(toolName: string): number;
    /**
     * Check if a tool is currently executing.
     */
    isRunning(toolName: string): boolean;
}
export declare const globalQueue: ExecutionQueue;
//# sourceMappingURL=execution-queue.d.ts.map