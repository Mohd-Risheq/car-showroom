import { handleUploadTokenRequest } from "@/lib/storage/upload-token";

// API-16: client upload tokens (the Vercel Blob handleUpload pattern)
export const POST = handleUploadTokenRequest;
