// How the scripts run the commands they start. A command that can't start, or that a signal stops,
// fails with exit status 1 and its reason, never with Node's unhandled error or a negative code.
import type { ChildProcess } from "node:child_process";

/**
 * The most output a script takes from a command it runs to the end (spawnSync's maxBuffer, past which
 * it stops the command). The largest, next analyze export's, is about 13 MB in Phase 0.
 */
export const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** A command's exit status once it closes: its exit code, or 1 when it couldn't start or a signal stopped it */
export function exitStatus(child: ChildProcess, name: string): Promise<number> {
  return new Promise((resolve) => {
    // A command that can't start errors first, then closes with a negative code, which this ignores
    child.once("error", (error) => {
      console.error(`${name} didn't run: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}
