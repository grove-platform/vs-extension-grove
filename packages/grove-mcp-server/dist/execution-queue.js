/**
 * Execution queue to prevent concurrent tool executions.
 * Max 1 execution per tool type at a time.
 */
export class ExecutionQueue {
    queues = new Map();
    running = new Set();
    /**
     * Enqueue a task for sequential execution.
     * Tasks with the same toolName are executed one at a time.
     * Different tools can execute in parallel.
     */
    async enqueue(toolName, execute) {
        return new Promise((resolve, reject) => {
            const task = { execute, resolve, reject };
            if (!this.queues.has(toolName)) {
                this.queues.set(toolName, []);
            }
            this.queues.get(toolName).push(task);
            this.processQueue(toolName);
        });
    }
    async processQueue(toolName) {
        if (this.running.has(toolName)) {
            return; // Already processing this queue
        }
        const queue = this.queues.get(toolName);
        if (!queue || queue.length === 0) {
            return;
        }
        this.running.add(toolName);
        const task = queue.shift();
        try {
            const result = await task.execute();
            task.resolve(result);
        }
        catch (error) {
            task.reject(error);
        }
        finally {
            this.running.delete(toolName);
            this.processQueue(toolName); // Process next in queue
        }
    }
    /**
     * Get the number of pending tasks for a tool.
     */
    getPendingCount(toolName) {
        return this.queues.get(toolName)?.length ?? 0;
    }
    /**
     * Check if a tool is currently executing.
     */
    isRunning(toolName) {
        return this.running.has(toolName);
    }
}
// Global queue instance
export const globalQueue = new ExecutionQueue();
//# sourceMappingURL=execution-queue.js.map