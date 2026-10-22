import { expect, it } from "vitest";
import { CHROMIUM_FLAGS } from "../../../scripts/checks/chromium.ts";

// The machine running the tests never plays their sound or opens its camera

it("mutes Chromium and gives it a fake camera whose prompt answers itself", () => {
  expect(CHROMIUM_FLAGS).toEqual(
    expect.arrayContaining(["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]),
  );
});
