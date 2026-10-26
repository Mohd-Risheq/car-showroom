import "server-only";
import { handleUpload } from "@vercel/blob/client";
import { requireDealerSession } from "@/lib/auth/guard";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { AppError } from "@/lib/errors/app-error";
import { withErrorEnvelope } from "@/lib/errors/envelope";
import { parseJson, readJsonBody } from "@/lib/http/body";
import { uploadClientPayloadSchema, uploadTokenRequestSchema } from "@/lib/validation/media";
import { getStorageDriver } from "./driver";
import { uploadRepository } from "./repository";
import { extensionOf, MEDIA_TYPES, maxBytesFor, UPLOAD_TOKEN_TTL_MS, uploadPathname } from "./rules";

const MAX_REQUEST_BYTES = 4 * 1024;

// API-16: a client upload token scoped to one server-computed pathname, its content type and
// its variant's size cap (SEC-08). T-32 adds car ownership, the demo caps (BR-30) and the
// storage budget (BR-46); T-34 adds demo sessions and the logo path.
export const handleUploadTokenRequest = withErrorEnvelope("/api/upload", async (request) =>
  Response.json(await issueUploadToken(request)),
);

async function issueUploadToken(request: Request) {
  if (!isSameOriginRequest(request)) throw new AppError("FORBIDDEN", "not same-origin"); // SEC-14

  // The session, the disabled-user and onboarding guard (FR-29.6) and the role (§4.2)
  const { ctx } = await requireDealerSession(request.headers);

  // Uploads are off without a storage driver, and no storage call is made (TC-32-9)
  const driver = getStorageDriver();
  if (!driver) throw new AppError("CAP_REACHED", "uploads off", { message: "errors.uploadsOff" });

  const body = uploadTokenRequestSchema.safeParse(await readJsonBody(request, MAX_REQUEST_BYTES));
  if (!body.success) throw new AppError("VALIDATION_ERROR", "token request");

  return handleUpload({
    token: driver.readWriteToken,
    request,
    body: body.data,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const payload = uploadClientPayloadSchema.safeParse(parseJson(clientPayload ?? ""));
      if (!payload.success) throw new AppError("VALIDATION_ERROR", "client payload");
      const { carId, kind, clientUploadId, variant } = payload.data;
      if (kind === "logo") throw new AppError("VALIDATION_ERROR", "logo path"); // T-34

      const ext = extensionOf(pathname);
      const maxBytes = ext && maxBytesFor(kind, variant, ext, { demo: false });
      if (!ext || !maxBytes) throw new AppError("VALIDATION_ERROR", "variant or type");
      if (pathname !== uploadPathname({ carId, kind, clientUploadId, variant, ext })) {
        throw new AppError("VALIDATION_ERROR", "pathname");
      }

      const recorded = await uploadRepository.recordExpectedPath({
        userId: ctx.userId,
        carId,
        kind,
        clientUploadId,
        variant,
        pathname,
      });
      if (!recorded.ok) {
        throw new AppError(recorded.reason === "forbidden" ? "FORBIDDEN" : "VALIDATION_ERROR", recorded.reason);
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
