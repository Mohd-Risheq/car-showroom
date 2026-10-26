// SRS §13.4: a request's ID is the platform's x-vercel-id header, or a new UUID where there is
// none, as locally. The header's form is checked first, so a client can't write into the logs or
// the error envelope.
const VERCEL_ID = /^[a-z0-9:-]{1,128}$/i;

export function requestIdFrom(headers: Headers): string {
  const id = headers.get("x-vercel-id");
  return id !== null && VERCEL_ID.test(id) ? id : crypto.randomUUID();
}
