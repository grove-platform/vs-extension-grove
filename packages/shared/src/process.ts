import { spawn, type ChildProcess } from "child_process";

/** Terminate a spawned process and its children (npm/dotnet/python test trees). */
export function killProcessTree(proc: ChildProcess): void {
  const pid = proc.pid;
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // process already exited
    }
  }
}
