// FR-47.4's fixed bot list: API-03 drops an event whose user agent any pattern matches. Every
// browser sends a user agent, so a request without one is dropped too. Pure, so a test can hold
// each pattern to a bot that only it catches.

export const BOT_PATTERNS: readonly RegExp[] = [
  // Crawlers and services that call themselves bots: Googlebot, bingbot, Slackbot-LinkExpanding,
  // Pingdom.com_bot, botify. CUBOT makes phones.
  /(?<!cu)bot/i,
  // Crawlers that call themselves spiders or crawlers: Baiduspider, Bytespider
  /spider|crawl/i,
  // Link previewers that name neither: Facebook's, WhatsApp's (Signal's too), Skype's, Bing's
  /facebookexternalhit|facebookcatalog|whatsapp\/|skypeuripreview|bingpreview|embedly|iframely|vkshare/i,
  // Headless browsers and tools that render a page: Chrome's, Lighthouse's, PhantomJS, Google's
  // inspection tool
  /headless|lighthouse|phantomjs|google-inspectiontool/i,
  // HTTP libraries and command-line tools, by the user agent each sends unless told otherwise
  /^(curl|wget|python-|go-http-client|java\/|okhttp|node-fetch|undici|axios|node$|libwww-perl|httpie)/i,
];

export function isBot(userAgent: string | null): boolean {
  if (userAgent === null || userAgent.trim() === "") return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
