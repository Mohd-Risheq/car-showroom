// Text layout for the shared canvas renderer (SRS §11.6), from spike T-04. The browser shapes
// and joins Arabic and orders mixed-direction text itself (the Unicode bidi algorithm), so the
// renderer only sets the direction, measures whole lines, and breaks them where
// Intl.Segmenter finds a space.

export type TextDirection = "rtl" | "ltr";

export type TextStyle = {
  font: string;
  direction: TextDirection;
};

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Measure = Pick<Context2D, "measureText">;

// Lines break only at these spaces. A no-break space (U+00A0) keeps a number with its unit,
// as in "84,000 km" (DESIGN §9.4).
const BREAKABLE_SPACE = /^[ \t]+$/;
const ELLIPSIS = "…";

export function applyTextStyle(ctx: Context2D, style: TextStyle): void {
  ctx.font = style.font;
  ctx.direction = style.direction;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// Splits text into lines no wider than maxWidth. A "\n" starts a new line. Past maxLines, the
// last line ends with an ellipsis.
export function wrapLines(
  ctx: Measure,
  text: string,
  maxWidth: number,
  locale: string,
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const fits = (line: string) => ctx.measureText(line).width <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const unit of breakUnits(paragraph, locale)) {
      const candidate = line ? `${line} ${unit}` : unit;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (fits(unit)) {
        line = unit;
      } else {
        // A word wider than the line: break it at word segments, then at graphemes
        const pieces = splitOverlong(ctx, unit, maxWidth, locale);
        line = pieces.pop() ?? "";
        lines.push(...pieces);
      }
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = withEllipsis(ctx, kept[maxLines - 1] ?? "", maxWidth, locale);
  return kept;
}

// Draws lines from the start edge: the right edge in RTL, the left edge in LTR.
export function drawLines(
  ctx: Context2D,
  lines: readonly string[],
  style: TextStyle,
  at: { x: number; y: number; lineHeight: number },
): void {
  applyTextStyle(ctx, style);
  lines.forEach((line, index) => ctx.fillText(line, at.x, at.y + index * at.lineHeight));
}

// The text between breakable spaces, as one unit each
function breakUnits(paragraph: string, locale: string): string[] {
  const units: string[] = [];
  let unit = "";
  for (const { segment } of new Intl.Segmenter(locale, { granularity: "word" }).segment(paragraph)) {
    if (BREAKABLE_SPACE.test(segment)) {
      if (unit) units.push(unit);
      unit = "";
    } else {
      unit += segment;
    }
  }
  if (unit) units.push(unit);
  return units;
}

function splitOverlong(ctx: Measure, unit: string, maxWidth: number, locale: string): string[] {
  const pieces: string[] = [];
  let piece = "";
  const add = (part: string) => {
    if (!piece || ctx.measureText(piece + part).width <= maxWidth) {
      piece += part;
    } else {
      pieces.push(piece);
      piece = part;
    }
  };
  for (const { segment } of new Intl.Segmenter(locale, { granularity: "word" }).segment(unit)) {
    if (ctx.measureText(segment).width <= maxWidth) {
      add(segment);
    } else {
      for (const grapheme of new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(segment)) {
        add(grapheme.segment);
      }
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

// Drops whole words, then graphemes, from the end until the line and an ellipsis fit
function withEllipsis(ctx: Measure, line: string, maxWidth: number, locale: string): string {
  const fits = (text: string) => ctx.measureText(text + ELLIPSIS).width <= maxWidth;
  const units = breakUnits(line, locale);
  while (units.length > 1 && !fits(units.join(" "))) units.pop();
  let text = units.join(" ");
  if (!fits(text)) {
    const graphemes = [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text)].map(
      (grapheme) => grapheme.segment,
    );
    while (graphemes.length > 0 && !fits(graphemes.join(""))) graphemes.pop();
    text = graphemes.join("");
  }
  return text + ELLIPSIS;
}
