"use server";

import { defineAction } from "@/lib/actions/define-action";
import { registerMedia } from "@/lib/storage/register";
import { registerMediaSchema } from "@/lib/validation/media";

// The dealer workspace's Server Actions (SRS §8.2), each built with defineAction (§11.9) and listed
// in the role matrix (TC-29-6). A "use server" module exports its actions and nothing else.

// API-17. The storage checks read every file, so they run outside a transaction, which would stay
// open while they wait on the store. T-32 adds the Media row and the demo session's uploads.
export const registerMediaAction = defineAction(
  {
    name: "registerMedia",
    roles: ["owner", "staff"],
    schema: registerMediaSchema,
    rateLimit: "API-17",
    transaction: false,
  },
  async ({ input, ctx, requestId }) => ({ data: await registerMedia(input, { userId: ctx.userId }, requestId) }),
);
