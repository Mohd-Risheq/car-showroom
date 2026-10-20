import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

// A loopback HTTP server in front of route handlers, so a client library can call them over
// HTTP inside a test while the test reads the same in-memory state.

type Route = {
  method: string;
  path: string;
  // Handles path and everything below it, passing the decoded segments after it
  prefix?: boolean;
  handle: (request: Request, segments: string[]) => Promise<Response>;
};

export async function startRouteServer(routes: Route[]) {
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
      const route = routes.find(
        ({ method, path, prefix }) =>
          method === incoming.method && (prefix ? url.pathname.startsWith(`${path}/`) : url.pathname === path),
      );
      if (!route) {
        outgoing.writeHead(404).end();
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of [value ?? []].flat()) headers.append(name, item);
      }
      const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
      const request = new Request(`${origin}${incoming.url ?? "/"}`, {
        method: incoming.method ?? "GET",
        headers,
        body: hasBody ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>) : null,
        duplex: "half",
      } as RequestInit);
      const segments = route.prefix ? url.pathname.slice(route.path.length + 1).split("/").map(decodeURIComponent) : [];
      const response = await route.handle(request, segments);
      const responseHeaders = Object.fromEntries(response.headers);
      // A handler that stopped reading the body (a size cap) leaves the connection unusable,
      // so it closes after the response, as an HTTP server does
      if (!incoming.complete) responseHeaders.connection = "close";
      outgoing.writeHead(response.status, responseHeaders);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    })().catch((error: unknown) => {
      outgoing.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
