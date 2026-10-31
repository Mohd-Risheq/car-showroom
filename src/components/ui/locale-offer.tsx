import { getTranslations } from "next-intl/server";
import { getAppLocale } from "@/lib/i18n/server";
import { LocalePrompt } from "./locale-prompt";

/** FR-01.2a's offer of the English page, made on Arabic pages only (DESIGN §7.1.1) */
export async function LocaleOffer() {
  if ((await getAppLocale()) !== "ar") return null;
  const prompt = await getTranslations("locale.prompt");
  return <LocalePrompt text={prompt("text")} switchLabel={prompt("switch")} stayLabel={prompt("stay")} />;
}
