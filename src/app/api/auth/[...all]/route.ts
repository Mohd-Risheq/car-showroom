import { toNextJsHandler } from "better-auth/next-js";
import { handleAuthRequest } from "@/lib/auth/auth";

// API-05: the auth library's handler, behind the disabled-path guard
export const { GET, POST } = toNextJsHandler(handleAuthRequest);
