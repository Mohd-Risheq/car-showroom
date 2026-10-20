// Next.js keeps only the first 10 MB of a request body that passes through proxy.ts, as every
// /{locale}/dev/** request does, and drops the rest without an error (proxyClientMaxBodySize,
// D-030). So a development upload goes in parts no bigger than this.
export const DEV_UPLOAD_PART_BYTES = 8 * 1024 * 1024;
