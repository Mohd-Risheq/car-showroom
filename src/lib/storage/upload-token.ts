import "server-only";
import { handleUpload } from "@vercel/blob/client";
import { auth } from "@/lib/auth/auth";
import { isUserRole } from "@/lib/auth/roles";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { uploadClientPayloadSchema, uploadTokenRequestSchema } from "@/lib/validation/media";
import { getStorageDriver } from "./driver";
import { StorageError, storageErrorResponse } from "./errors";
import { uploadRepository } from "./repository";
import { extensionOf, MEDIA_TYPES, maxBytesFor, UPLOAD_TOKEN_TTL_MS, uploadPathname } from "./rules";
import { readCapped } from "./stream";

const MAX_REQUEST_BYTES = 4 * 1024;

// API-16: a client upload token scoped to one server-computed pathname, its content type and
// its variant's size cap (SEC-08). T-32 adds car ownership, the demo caps (BR-30) and the
// storage budget (BR-46); T-34 adds demo sessions and the logo path.
export async function handleUploadTokenRequest(request: Request): Promise<Response> {
  try {
    return Response.json(await issueUploadToken(request));
  } catch (error) {
    if (error instanceof StorageError) return storageErrorResponse(request, error);
    throw error;
  }
}

async function issueUploadToken(request: Request) {
  if (!isSameOriginRequest(request)) throw new StorageError("FORBIDDEN", "not same-origin"); // SEC-14

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new StorageError("UNAUTHENTICATED", "no session");
  const { user } = session;
  // The disabled-user and onboarding guard (FR-29.6), then the role (§4.2)
  if (user.disabledAt || user.mustChangePassword) throw new StorageError("FORBIDDEN", "account guard");
  if (!isUserRole(user.role)) throw new StorageError("FORBIDDEN", "role");

  // Uploads are off without a storage driver, and no storage call is made (TC-32-9)
  const driver = getStorageDriver();
  if (!driver) throw new StorageError("CAP_REACHED", "uploads off");

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new StorageError("VALIDATION_ERROR", "not JSON");
  }
  const raw = await readCapped(request.body, MAX_REQUEST_BYTES);
  if (raw === "too_large") throw new StorageError("VALIDATION_ERROR", "request too large");
  const body = uploadTokenRequestSchema.safeParse(parseJson(new TextDecoder().decode(raw)));
  if (!body.success) throw new StorageError("VALIDATION_ERROR", "token request");

  return handleUpload({
    token: driver.readWriteToken,
    request,
    body: body.data,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const payload = uploadClientPayloadSchema.safeParse(parseJson(clientPayload ?? ""));
      if (!payload.success) throw new StorageError("VALIDATION_ERROR", "client payload");
      const { carId, kind, clientUploadId, variant } = payload.data;
      if (kind === "logo") throw new StorageError("VALIDATION_ERROR", "logo path"); // T-34

      const ext = extensionOf(pathname);
      const maxBytes = ext && maxBytesFor(kind, variant, ext, { demo: false });
      if (!ext || !maxBytes) throw new StorageError("VALIDATION_ERROR", "variant or type");
      if (pathname !== uploadPathname({ carId, kind, clientUploadId, variant, ext })) {
        throw new StorageError("VALIDATION_ERROR", "pathname");
      }

      const recorded = await uploadRepository.recordExpectedPath({
        userId: user.id,
        carId,
        kind,
        clientUploadId,
        variant,
        pathname,
      });
      if (!recorded.ok) {
        throw new StorageError(recorded.reason === "forbidden" ? "FORBIDDEN" : "VALIDATION_ERROR", recorded.reason);
      }

      return {
        allowedContentTypes: [MEDIA_TYPES[ext]],
        maximumSizeInBytes: maxBytes,
        addRandomSuffix: true, // stored URLs can't be guessed
        allowOverwrite: false,
        validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
      };
    },
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
