import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { findClaudeProjectRoot } from "../handoff/writer";

describe("findClaudeProjectRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grove-handoff-test-"));
    // On macOS, /tmp is a symlink to /private/tmp — realpath so comparisons match
    tempDir = await fs.realpath(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns the start path when .claude/skills/ is right there", async () => {
    await fs.mkdir(path.join(tempDir, ".claude", "skills"), { recursive: true });

    const result = await findClaudeProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it("returns the parent when .claude/skills/ is one level up", async () => {
    await fs.mkdir(path.join(tempDir, ".claude", "skills"), { recursive: true });
    const subdir = path.join(tempDir, "code-example-tests");
    await fs.mkdir(subdir);

    const result = await findClaudeProjectRoot(subdir);
    expect(result).toBe(tempDir);
  });

  it("walks multiple levels up to find the marker", async () => {
    await fs.mkdir(path.join(tempDir, ".claude", "skills"), { recursive: true });
    const deep = path.join(tempDir, "a", "b", "c");
    await fs.mkdir(deep, { recursive: true });

    const result = await findClaudeProjectRoot(deep);
    expect(result).toBe(tempDir);
  });

  it("returns undefined when no .claude/skills/ exists anywhere", async () => {
    const subdir = path.join(tempDir, "no-claude");
    await fs.mkdir(subdir);

    const result = await findClaudeProjectRoot(subdir);
    expect(result).toBeUndefined();
  });

  it("does not match a bare .claude/ directory without a skills/ subdir", async () => {
    // Some projects have .claude/ just for settings.json, without skills.
    // That should not count as a Claude Code project root.
    await fs.mkdir(path.join(tempDir, ".claude"), { recursive: true });
    const subdir = path.join(tempDir, "sub");
    await fs.mkdir(subdir);

    // Cap to 1 so we only see tempDir and its immediate child — we never
    // walk above tempDir into the host's real filesystem.
    const result = await findClaudeProjectRoot(subdir, 1);
    expect(result).toBeUndefined();
  });

  it("respects maxDepth", async () => {
    await fs.mkdir(path.join(tempDir, ".claude", "skills"), { recursive: true });
    const deep = path.join(tempDir, "a", "b", "c", "d", "e");
    await fs.mkdir(deep, { recursive: true });

    // Walk only 2 levels up from deep — won't reach tempDir (5 levels up)
    const result = await findClaudeProjectRoot(deep, 2);
    expect(result).toBeUndefined();
  });

  it("prefers the nearest ancestor when multiple markers exist", async () => {
    // Outer marker
    await fs.mkdir(path.join(tempDir, ".claude", "skills"), { recursive: true });
    // Inner marker (closer to start)
    const inner = path.join(tempDir, "project");
    await fs.mkdir(path.join(inner, ".claude", "skills"), { recursive: true });
    const subdir = path.join(inner, "src");
    await fs.mkdir(subdir);

    const result = await findClaudeProjectRoot(subdir);
    expect(result).toBe(inner);
  });
});