import { describe, it, expect } from "vitest";
import { ExecutionQueue } from "../execution-queue.js";

describe("ExecutionQueue", () => {
  it("should execute tasks sequentially for same tool", async () => {
    const queue = new ExecutionQueue();
    const order: number[] = [];

    const task1 = queue.enqueue("test-tool", async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 1;
    });

    const task2 = queue.enqueue("test-tool", async () => {
      order.push(2);
      return 2;
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2]);
  });

  it("should execute different tools in parallel", async () => {
    const queue = new ExecutionQueue();
    const startTimes: Record<string, number> = {};

    const task1 = queue.enqueue("tool-a", async () => {
      startTimes["a"] = Date.now();
      await new Promise((r) => setTimeout(r, 50));
      return "a";
    });

    const task2 = queue.enqueue("tool-b", async () => {
      startTimes["b"] = Date.now();
      return "b";
    });

    await Promise.all([task1, task2]);

    // Both should start at roughly the same time (within 20ms)
    expect(Math.abs(startTimes["a"] - startTimes["b"])).toBeLessThan(20);
  });

  it("should return task results", async () => {
    const queue = new ExecutionQueue();
    const result = await queue.enqueue("test", async () => "hello");
    expect(result).toBe("hello");
  });

  it("should propagate errors", async () => {
    const queue = new ExecutionQueue();
    await expect(
      queue.enqueue("test", async () => {
        throw new Error("test error");
      })
    ).rejects.toThrow("test error");
  });

  it("should continue processing after error", async () => {
    const queue = new ExecutionQueue();

    // First task throws
    const task1 = queue
      .enqueue("test", async () => {
        throw new Error("task1 error");
      })
      .catch(() => "error caught");

    // Second task should still run
    const task2 = queue.enqueue("test", async () => "task2 success");

    const [result1, result2] = await Promise.all([task1, task2]);
    expect(result1).toBe("error caught");
    expect(result2).toBe("task2 success");
  });

  it("should report pending count correctly", async () => {
    const queue = new ExecutionQueue();

    // Start a slow task
    const task1 = queue.enqueue("test", async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 1;
    });

    // Queue another task
    const task2Promise = queue.enqueue("test", async () => 2);

    // Should have 1 pending (the second one)
    expect(queue.getPendingCount("test")).toBe(1);
    expect(queue.isRunning("test")).toBe(true);

    await Promise.all([task1, task2Promise]);

    // Should have 0 pending after completion
    expect(queue.getPendingCount("test")).toBe(0);
    expect(queue.isRunning("test")).toBe(false);
  });

  it("should handle empty queue correctly", () => {
    const queue = new ExecutionQueue();
    expect(queue.getPendingCount("nonexistent")).toBe(0);
    expect(queue.isRunning("nonexistent")).toBe(false);
  });
});

