import { expect, test } from "@playwright/test";

// Better Auth refuses a POST that carries cookies from an origin it doesn't trust (SEC-02). Each
// project's page origin must be trusted, WebKit's HTTPS front included (D-028), or every signed-in
// request from that browser fails with 403 INVALID_ORIGIN.

test("the auth API takes a request from the page's own origin", async ({ page }) => {
  await page.goto("/en");
  const { status, body } = await page.evaluate(async () => {
    // The cookie makes Better Auth check the origin; signing out without a session reads no data
    document.cookie = "muftah-origin-probe=1; path=/";
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return { status: response.status, body: await response.text() };
  });
  expect({ status, body: JSON.parse(body) }).toStrictEqual({ status: 200, body: { success: true } });
});
