// pnpm e2e:linux: the Playwright suite with its browsers in Playwright's Linux image, pinned by digest
// (D-010), the image CI's end-to-end job runs in. Firefox doesn't start on macOS (D-026) and visual
// baselines come from this image only (D-037), so this is how a Mac runs them. The app and the test
// runner stay on this machine, and the browsers reach its localhost through Playwright's
// exposeNetwork. Like pnpm e2e, it needs a production build (pnpm build).
//
// Usage: pnpm e2e:linux [playwright test options], for example --update-snapshots
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline";
import { exitStatus } from "./checks/processes.ts";

const IMAGE =
  "mcr.microsoft.com/playwright:v1.64.1-noble@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf";
const PORT = 3900;

/** This project's playwright-core: the browser server must be the test runner's exact version */
function playwrightCore(): string {
  const require = createRequire(import.meta.url);
  const runner = path.dirname(require.resolve("@playwright/test/package.json"));
  const playwright = path.dirname(require.resolve("playwright/package.json", { paths: [runner] }));
  return path.dirname(require.resolve("playwright-core/package.json", { paths: [playwright] }));
}

// --unsafe lets the config's launch options through, such as the fake camera. Only this machine can
// reach the port, so it lets in no one who couldn't already run browsers here.
const SERVER = `node /playwright-core/cli.js run-server --host 0.0.0.0 --port ${PORT} --unsafe`;

// The server ignores its stdin, so a shell stops it when the container's stdin closes, which happens
// when this script ends, however it ends
const browsers = spawn(
  "docker",
  [
    ...["run", "--rm", "--init", "--ipc=host", "--interactive", "--user", "pwuser"],
    ...["--publish", `127.0.0.1:${PORT}:${PORT}`, "--volume", `${playwrightCore()}:/playwright-core:ro`],
    IMAGE,
    ...["sh", "-c", `${SERVER} & cat >/dev/null; kill $!`],
  ],
  { stdio: ["pipe", "pipe", "inherit"] },
);
browsers.once("error", (error) => console.error(`e2e:linux: docker didn't run: ${error.message}`));

/** Whether the browser server came up, rather than the container stopping first */
async function listening(): Promise<boolean> {
  for await (const line of createInterface({ input: browsers.stdout })) {
    if (line.startsWith("Listening on ")) return true;
  }
  return false;
}

if (!(await listening())) {
  console.error("e2e:linux: the browser container stopped before its server was ready (Docker's message is above)");
  process.exit(1);
}
browsers.stdout.resume();

const tests = spawn("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    PW_TEST_CONNECT_WS_ENDPOINT: `ws://127.0.0.1:${PORT}/`,
    // The config runs the visual tests and Firefox for this image only, not for any remote browser
    MUFTAH_E2E_IMAGE: IMAGE,
    // The browsers load this machine's localhost: the app on 3000 and WebKit's HTTPS proxy on 3443
    PW_TEST_CONNECT_EXPOSE_NETWORK: "<loopback>",
  },
});
const status = await exitStatus(tests, "e2e:linux: playwright test");
browsers.stdin.end();
process.exitCode = status;
