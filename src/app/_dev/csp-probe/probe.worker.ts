// Spike T-06: the probe's module worker. It proves a worker runs under each policy and reports
// any violation seen inside it. On request it also tries to compile WebAssembly, which shows the
// policy each engine gives a worker: its own response's policy or the page's (T-32 runs WASM in
// a worker).

export type WorkerRequest = { n: number; wasm: boolean };
export type WorkerReply = { sum: number; violations: string[]; wasm?: string | undefined };

type Scope = {
  addEventListener(type: "securitypolicyviolation", listener: (event: SecurityPolicyViolationEvent) => void): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};
const scope = self as unknown as Scope;

const violations: string[] = [];
scope.addEventListener("securitypolicyviolation", (event) => {
  violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
});

// The smallest valid module: the magic number and version 1
const EMPTY_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

scope.onmessage = async (event) => {
  let sum = 0;
  for (let i = 1; i <= event.data.n; i += 1) sum += i;
  let wasm: string | undefined;
  if (event.data.wasm) {
    try {
      await WebAssembly.compile(EMPTY_MODULE);
      wasm = "compiled";
    } catch (error) {
      wasm = `blocked (${error instanceof Error ? error.name : "unknown error"})`;
    }
  }
  // Violation events arrive as tasks, so give them a moment before replying
  await new Promise((resolve) => setTimeout(resolve, 100));
  scope.postMessage({ sum, violations, wasm });
};
