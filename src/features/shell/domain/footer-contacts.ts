import type { PublicSettingsDTO } from "@/lib/db/public-dto";

// The contacts at the head of the footer's Contact column (DESIGN §7.1.1). In demo mode no contact
// leaves the site (BR-14): the number shows masked, with the Demo tag (Q-12), as text, and T-23
// turns it into the preview's trigger. Otherwise WhatsApp and the phone link out, each where the
// settings hold a number. The social links follow in either mode.

/** Q-12: the demo's number as it shows; the seed's number is never shown or dialled */
export const DEMO_NUMBER = "+962 7X XXX XXXX";

export type FooterContact =
  | { kind: "demo"; number: typeof DEMO_NUMBER }
  | { kind: "whatsapp"; href: string }
  | { kind: "phone"; href: string; e164: string };

export function footerContacts(
  settings: Pick<PublicSettingsDTO, "whatsappE164" | "phoneE164">,
  demo: boolean,
): FooterContact[] {
  if (demo) return [{ kind: "demo", number: DEMO_NUMBER }];
  const { whatsappE164, phoneE164 } = settings;
  return [
    ...(whatsappE164 === null ? [] : [{ kind: "whatsapp" as const, href: `https://wa.me/${whatsappE164.slice(1)}` }]),
    ...(phoneE164 === null ? [] : [{ kind: "phone" as const, href: `tel:${phoneE164}`, e164: phoneE164 }]),
  ];
}
