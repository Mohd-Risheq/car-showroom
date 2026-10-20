import {
  applyTextStyle,
  drawLines,
  type TextDirection,
  type TextStyle,
  wrapLines,
} from "@/features/share/renderer/text";

// Spike T-04: a 1080 × 1350 card (BR-34, the Instagram post size) in Arabic or English, drawn
// with the renderer's text layout. It runs on a page canvas and on an OffscreenCanvas in a
// worker. Development text only: the real templates and their copy arrive in T-33.

export type SpikeLocale = "ar" | "en";
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
const PAD = 72;
const TEXT_WIDTH = CARD_WIDTH - 2 * PAD;
// A system font: the brand fonts came with T-11, and T-33's renderer draws the card in them
export const FAMILY = "system-ui, sans-serif";

const NBSP = " ";

// Western digits in both languages (BR-02, DESIGN §9.4)
export function formatInteger(value: number, locale: SpikeLocale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO-u-nu-latn" : "en-JO").format(value);
}

export function spikeText(locale: SpikeLocale) {
  const price = formatInteger(14500, locale);
  const km = formatInteger(84000, locale);
  if (locale === "ar") {
    return {
      title: "تويوتا RAV4 هايبرد 2021 فل كامل مع فتحة سقف بانوراما وشاشة كبيرة",
      facts: `${price}${NBSP}د.أ · ${km}${NBSP}كم · 2021`,
      body:
        "فحص كامل للهيكل (شاصي) والمحرك والجير، 12 قطعة أصلية وقطعة واحدة مدهونة. " +
        "رقم الشاصي JTMBFREV5MD123456، والسيارة مرخّصة حتى 2027. " +
        "السعر لا يشمل الجمرك ولا التسجيل في عمّان.",
      question: "شو رأيك بهالسيارة؟",
    };
  }
  return {
    title: "Toyota RAV4 Hybrid 2021 full option with a panoramic sunroof and a large screen",
    facts: `JOD${NBSP}${price} · ${km}${NBSP}km · 2021`,
    body:
      "Full inspection of the chassis (frame), engine and gearbox: 12 original panels and 1 repainted panel. " +
      "VIN JTMBFREV5MD123456, licensed until 2027. " +
      "The price excludes customs and registration in Amman.",
    question: "What do you think of this car?",
  };
}

export type CardLines = Record<"title" | "facts" | "body" | "question", string[]>;

// Draws the card and returns the lines each block was broken into
export function drawSpikeCard(ctx: Context2D, locale: SpikeLocale): CardLines {
  const direction: TextDirection = locale === "ar" ? "rtl" : "ltr";
  // Arabic gets the taller line heights of DESIGN §3.3
  const leading = locale === "ar" ? { display: 1.25, body: 1.8 } : { display: 1.1, body: 1.5 };
  const startX = direction === "rtl" ? CARD_WIDTH - PAD : PAD;
  const text = spikeText(locale);

  ctx.fillStyle = "#101214";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  // Where the cover photo goes
  const photo = ctx.createLinearGradient(0, 0, CARD_WIDTH, 560);
  photo.addColorStop(0, "#2f3d33");
  photo.addColorStop(1, "#5b6b45");
  ctx.fillStyle = photo;
  ctx.fillRect(0, 0, CARD_WIDTH, 560);
  // The text box edges, so alignment shows in screenshots
  ctx.fillStyle = "#2a2e33";
  ctx.fillRect(PAD - 2, 600, 2, 680);
  ctx.fillRect(CARD_WIDTH - PAD, 600, 2, 680);

  const block = (value: string, size: number, weight: number, lineHeight: number, maxLines: number, y: number) => {
    const style: TextStyle = { font: `${weight} ${size}px ${FAMILY}`, direction };
    applyTextStyle(ctx, style);
    const lines = wrapLines(ctx, value, TEXT_WIDTH, locale, maxLines);
    drawLines(ctx, lines, style, { x: startX, y, lineHeight: size * lineHeight });
    return { lines, bottom: y + (lines.length - 1) * size * lineHeight };
  };

  ctx.fillStyle = "#f2efe8";
  const title = block(text.title, 68, 600, leading.display, 2, 690);
  ctx.fillStyle = "#c9d98f";
  const facts = block(text.facts, 44, 500, leading.body, 1, title.bottom + 100);
  ctx.fillStyle = "#d8d4cc";
  const body = block(text.body, 38, 400, leading.body, 4, facts.bottom + 90);
  ctx.fillStyle = "#f2efe8";
  const question = block(text.question, 50, 600, leading.display, 1, CARD_HEIGHT - 48);

  return { title: title.lines, facts: facts.lines, body: body.lines, question: question.lines };
}
