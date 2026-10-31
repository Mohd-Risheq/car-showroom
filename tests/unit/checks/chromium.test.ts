import { expect, it } from "vitest";
import { CHROMIUM_FLAGS, lighthouseChromeFlags } from "../../../scripts/checks/chromium.ts";

// The machine running the tests never plays their sound or opens its camera

it("mutes Chromium and gives it a fake camera whose prompt answers itself", () => {
  expect(CHROMIUM_FLAGS).toEqual(
    expect.arrayContaining(["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]),
  );
});

it("starts LHCI's Chromium without its sandbox on Linux alone, where with it Chromium aborted at its start", () => {
  expect(lighthouseChromeFlags("linux")).toStrictEqual([...CHROMIUM_FLAGS, "--no-sandbox"]);
  expect(lighthouseChromeFlags("darwin")).toStrictEqual(CHROMIUM_FLAGS);
  expect(lighthouseChromeFlags("win32")).toStrictEqual(CHROMIUM_FLAGS);
});
