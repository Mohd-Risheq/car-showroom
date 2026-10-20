import { landSvg } from "@/features/journey/land";

// The land of the Journey's static map (FR-17.6). It reads no request data, so Cache Components
// prerenders it when the app is built and serves the result as a file (SRS §14: no runtime fetch).
export function GET(): Response {
  return new Response(landSvg(), { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
}
