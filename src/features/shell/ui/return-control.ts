// FR-02.4 after a step back or forward: the focus goes back to the link or control the visitor left
// the page by, while it is still on the page, and else to its heading, so a keyboard or screen
// reader user goes on from their place (the owner's answer of 2026-10-31, D-047). The page a step
// brings back may render with other data, so a control is known by its kind, where a link leads or
// what any other control is called, and by which of that kind on screen it is. place-keeper.ts
// notes each history entry's control as its page is left and finds it again as a step brings the
// page back, and offers it here to route-arrival.tsx, whose arrival on that page takes it.

/** What a page can be left by: links, form controls and anything given a place in the tab order */
const CONTROL = [
  "a[href]",
  "area[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * A dialog, as the menu sheet, closes as the page it opened comes, so a control in one has gone by the
 * time a step brings that page back, though a sheet still closing holds it on screen a moment yet
 */
export const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]';

/** A control as the page rendered again finds it: its kind, and which of that kind on screen it is */
export type ControlKey = { kind: string; index: number };

/** A link's kind is where it leads; any other control's its element, type, name and label */
function kindOf(control: Element): string {
  const href = control.getAttribute("href");
  if (href !== null) return `${control.localName} ${href}`;
  const label = control.getAttribute("aria-label") ?? control.textContent ?? "";
  return [control.localName, control.getAttribute("type"), control.getAttribute("name"), label.trim()].join(" ");
}

/**
 * The controls of a kind on screen and outside dialogs, in the document's order: a page kept hidden for
 * a quick return has no boxes
 */
function shownOfKind(kind: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CONTROL)).filter(
    (control) => kindOf(control) === kind && control.getClientRects().length > 0 && control.closest(DIALOG) === null,
  );
}

/** The key of the control an element is or is in, while it shows outside a dialog; null for none */
export function controlKeyOf(element: EventTarget | null): ControlKey | null {
  if (!(element instanceof Element)) return null;
  const control = element.closest(CONTROL);
  if (control === null) return null;
  const kind = kindOf(control);
  const index = shownOfKind(kind).findIndex((shown) => shown === control);
  return index === -1 ? null : { kind, index };
}

/** The control a key names, while it shows */
export function controlOf(key: ControlKey): HTMLElement | null {
  return shownOfKind(key.kind)[key.index] ?? null;
}

/** The control offered for the arrival on a path */
let offered: { pathname: string; control: HTMLElement } | null = null;

/** Offers the arrival on a path the control its page was left by, or nothing */
export function offerReturn(pathname: string, control: HTMLElement | null): void {
  offered = control === null ? null : { pathname, control };
}

/** Takes the control offered for the arrival on a path: none for another path, and none a second time */
export function takeReturn(pathname: string): HTMLElement | null {
  const offer = offered;
  offered = null;
  return offer?.pathname === pathname ? offer.control : null;
}
