import { describe, expect, it } from "vitest";
import { DEMO_NUMBER, footerContacts } from "@/features/shell/domain/footer-contacts";

// The footer's contacts (src/features/shell/domain/footer-contacts.ts): in demo mode no contact
// leaves the site (BR-14), and the number shows masked with the Demo tag (Q-12); otherwise WhatsApp
// and the phone link out where the settings hold a number

/** Numbers no one has: Jordan gives out no mobile number under 70 */
const NUMBERS = { whatsappE164: "+962700000001", phoneE164: "+962700000002" };

describe("the footer's contacts", () => {
  it("are the masked number alone in demo mode, which links nowhere (BR-14, Q-12)", () => {
    for (const settings of [NUMBERS, { whatsappE164: null, phoneE164: null }]) {
      expect(footerContacts(settings, true)).toStrictEqual([{ kind: "demo", number: DEMO_NUMBER }]);
    }
    expect(DEMO_NUMBER).toBe("+962 7X XXX XXXX");
  });

  it("are WhatsApp and the phone, linking out, outside demo mode", () => {
    expect(footerContacts(NUMBERS, false)).toStrictEqual([
      { kind: "whatsapp", href: "https://wa.me/962700000001" },
      { kind: "phone", href: "tel:+962700000002", e164: "+962700000002" },
    ]);
  });

  it("leave out a number the settings don't hold", () => {
    expect(footerContacts({ ...NUMBERS, whatsappE164: null }, false).map(({ kind }) => kind)).toStrictEqual(["phone"]);
    expect(footerContacts({ ...NUMBERS, phoneE164: null }, false).map(({ kind }) => kind)).toStrictEqual(["whatsapp"]);
    expect(footerContacts({ whatsappE164: null, phoneE164: null }, false)).toStrictEqual([]);
  });
});
