import "server-only";
import { requestIdFrom } from "@/lib/log/request-id";
import { AppError } from "./app-error";
import { logRefusal } from "./refusal";

type RouteHandler = (request: Request) => Promise<Response>;

type EnvelopeOptions = {
  /** Whether a refusal of the client's request (4xx) is logged. A server's (5xx) always is. */
  readonly logClientRefusals?: boolean;
};

// SRS §8.1's Route Handler error envelope. The handler throws AppError, and the answer carries the
// code, the catalog message the client shows (§13.2), each field's issue and a request ID, which
// the one log line of the refusal also carries (§11.9). The reason stays in the log. API-34 logs no
// client refusal, as its spec and D-041 say. Anything else is rethrown: a Route Handler has no error
// boundary, so Next answers it with an empty 500 and passes it to onRequestError (§13.4), until
// T-36 gives it the envelope.
export function withErrorEnvelope(
  route: string,
  handle: RouteHandler,
  { logClientRefusals = true }: EnvelopeOptions = {},
): RouteHandler {
  return async (request) => {
    const started = performance.now();
    try {
      return await handle(request);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const requestId = requestIdFrom(request.headers);
      if (logClientRefusals || error.status >= 500) {
        logRefusal(error, { route, requestId, durationMs: Math.round(performance.now() - started) });
      }
      return errorResponse(error, requestId);
    }
  };
}

function errorResponse(error: AppError, requestId: string): Response {
  const details = Object.entries(error.fieldErrors ?? {}).flatMap(([field, issues = []]) =>
    issues.map(({ key, values }) => ({ field, issue: key, ...(values ? { values } : {}) })),
  );
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.messageKey,
        ...(details.length > 0 ? { details } : {}),
        requestId,
      },
    },
    {
      status: error.status,
      headers: error.retryAfter === undefined ? {} : { "retry-after": String(error.retryAfter) },
    },
  );
}
