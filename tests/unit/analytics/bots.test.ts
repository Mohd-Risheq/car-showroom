import { devices } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { BOT_PATTERNS, isBot } from "@/lib/analytics/bots";

// FR-47.4: API-03 drops the events of crawlers, link previewers and headless browsers, by the user
// agent each sends

// Each kind of bot the patterns are there for, as it names itself
const BOTS = {
  Googlebot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/141.0.7390.122 Safari/537.36",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  Applebot:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  "Slack's link previews": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Telegram's link previews": "TelegramBot (like TwitterBot)",
  "Discord's link previews": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "LinkedIn's link previews": "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "Pingdom's checks": "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
  // A name that runs on past "bot"
  "Botify's crawler": "Mozilla/5.0 (compatible; botify; http://botify.com)",
  Baiduspider: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
  Bytespider:
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "Seekport's crawler": "Mozilla/5.0 (compatible; Seekport Crawler; http://seekport.com/)",
  "Facebook's link previews": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Facebook's catalog": "facebookcatalog/1.0",
  // Signal's link previews send WhatsApp's user agent too
  "WhatsApp's link previews": "WhatsApp/2.23.20.0 A",
  "Skype's link previews":
    "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
  "Bing's link previews":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) BingPreview/1.0b",
  Embedly: "Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)",
  Iframely: "Iframely/1.3.1 (+https://iframely.com/docs/about)",
  "VK's link previews": "Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)",
  "Headless Chrome":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36",
  Lighthouse:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  PhantomJS: "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
  // It renders a page and runs its scripts, as Search Console's URL inspection asks
  "Google's inspection tool":
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
  curl: "curl/8.7.1",
  Wget: "Wget/1.24.5",
  "Python's requests": "python-requests/2.32.3",
  "Python's urllib": "Python-urllib/3.12",
  "Go's HTTP client": "Go-http-client/2.0",
  "Java's HTTP client": "Java/21.0.4",
  OkHttp: "okhttp/4.12.0",
  "node-fetch": "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
  undici: "undici",
  axios: "axios/1.7.7",
  "Node's fetch": "node",
  "Perl's LWP": "libwww-perl/6.77",
  HTTPie: "HTTPie/3.2.3",
};

// People's browsers, in-app ones included, which the patterns must leave alone
const PEOPLE = {
  "Safari on an iPhone":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Chrome on Android":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Samsung Internet":
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  "Firefox on Android": "Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
  "Edge on Windows":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  "Facebook's in-app browser":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/530.0.0.43.109;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBLC/ar_AR;FBOP/80]",
  "Instagram's in-app browser":
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 Instagram 402.0.0.38.86 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; ar_JO; 815213040)",
  // CUBOT makes phones
  "Chrome on a CUBOT phone":
    "Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9 Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36",
};

describe("isBot", () => {
  it.each(Object.entries(BOTS))("drops %s", (_, agent) => {
    expect(isBot(agent)).toBe(true);
  });

  it.each(Object.entries(PEOPLE))("keeps %s", (_, agent) => {
    expect(isBot(agent)).toBe(false);
  });

  it("keeps every browser in Playwright's device list, whose user agents the end-to-end tests send", () => {
    const flagged = Object.entries(devices).filter(([, device]) => isBot(device.userAgent));
    expect(flagged.map(([name]) => name)).toStrictEqual([]);
  });

  it("names a tool by the start of its user agent, where the tool puts it, not later in a browser's", () => {
    for (const tool of ["curl/8.7.1", "python-requests/2.32.3", "okhttp/4.12.0", "Java/21.0.4"]) {
      expect(isBot(`${PEOPLE["Chrome on Android"]} ${tool}`), tool).toBe(false);
    }
  });

  it("drops a request with no user agent, which every browser sends", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("   ")).toBe(true);
  });

  it("has a bot above that only it catches, for each pattern", () => {
    const caughtBy = (agent: string) => BOT_PATTERNS.filter((pattern) => pattern.test(agent));
    for (const pattern of BOT_PATTERNS) {
      const own = Object.values(BOTS).filter((agent) => caughtBy(agent).length === 1 && pattern.test(agent));
      expect(own, String(pattern)).not.toHaveLength(0);
    }
  });
});
