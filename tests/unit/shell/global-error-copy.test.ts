import { describe, expect, it } from "vitest";
import { GLOBAL_ERROR_COPY } from "@/features/shell/domain/global-error-copy";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// DESIGN §7.2.11: the global error page loads no catalog, so it carries its two lines itself, which
// must stay the catalogs' errors.global and common.reload

describe("the global error page's copy", () => {
  it("is the catalogs' errors.global and common.reload, in both languages", () => {
    expect(GLOBAL_ERROR_COPY).toStrictEqual({
      ar: { text: ar.errors.global, reload: ar.common.reload },
      en: { text: en.errors.global, reload: en.common.reload },
    });
  });
});
