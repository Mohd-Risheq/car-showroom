import { emailAddress, text } from "../../src/lib/validation/fields.ts";
import { validate } from "../../src/lib/validation/issues.ts";
import { z } from "../../src/lib/validation/zod.ts";

// The first owner's account, as scripts/create-owner.ts reads it from the environment (SRS §6.4,
// §15.1). The script writes the rows itself (D-045), so it lowercases the address, as the auth
// library does when it stores an address and when it looks one up at sign-in.

// No VR bounds a person's name: 100 characters hold a real one
const NAME_MAX = 100;

const ownerEnvironment = z.object({
  DEALER_SLUG: text({ max: 40 }),
  OWNER_EMAIL: emailAddress().transform((email) => email.toLowerCase()),
  OWNER_NAME: text({ max: NAME_MAX }),
});

export type OwnerInput = { readonly dealerSlug: string; readonly email: string; readonly name: string };

/** The owner's dealer, address and name, or a problem for each variable that's missing or wrong */
export function ownerInput(
  environment: Readonly<Record<string, string | undefined>>,
): { input: OwnerInput } | { problems: string[] } {
  const { DEALER_SLUG, OWNER_EMAIL, OWNER_NAME } = environment;
  const result = validate(ownerEnvironment, { DEALER_SLUG, OWNER_EMAIL, OWNER_NAME });
  if (!result.ok) {
    return {
      problems: Object.entries(result.fieldErrors).flatMap(([name, issues]) =>
        (issues ?? []).map(({ key }) => `${name}: ${key}`),
      ),
    };
  }
  return {
    input: { dealerSlug: result.data.DEALER_SLUG, email: result.data.OWNER_EMAIL, name: result.data.OWNER_NAME },
  };
}
