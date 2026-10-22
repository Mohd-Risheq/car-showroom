import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exitStatus } from "../../../scripts/checks/processes.ts";

// How the scripts wait on a command they start: its exit code, or 1, with the reason, when it can't
// start or a signal stops it

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exitStatus", () => {
  it("gives the command's exit code", async () => {
    await expect(exitStatus(spawn(process.execPath, ["-e", "process.exit(3)"]), "node")).resolves.toBe(3);
  });

  it("gives 1 when a signal stops the command", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    const status = exitStatus(child, "node");
    child.kill("SIGTERM");
    await expect(status).resolves.toBe(1);
  });

  it("gives 1 when the command can't start, naming why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(exitStatus(spawn("muftah-no-such-command"), "lhci: LHCI")).resolves.toBe(1);
    expect(logged).toHaveBeenCalledWith("lhci: LHCI didn't run: spawn muftah-no-such-command ENOENT");
  });
});
