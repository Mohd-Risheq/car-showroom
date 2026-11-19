import type { Dialog } from "@base-ui/react/dialog";

// How a dialog's open or close was asked for: a keyboard-driven change doesn't animate
// (DESIGN §4.2, --dur-instant), so a sheet or the fullscreen gallery opened or closed from the
// keyboard shows or leaves at once.

/** How a change was asked for */
export type Input = "keyboard" | "pointer";

/** The input behind a click: a key, where it counts no presses, as a click a key makes does */
export const inputOfClick = ({ detail }: { readonly detail: number }): Input => (detail === 0 ? "keyboard" : "pointer");

/**
 * The input behind an open or close Base UI reports, where its event tells: Escape is a key and a
 * press outside the dialog a pointer, and a press of the trigger or the close button is a key when
 * its click counts no presses, as a click a key makes does. Null where the event doesn't tell, as
 * for the close a drag's release asks for.
 */
export function inputOf({ reason, event }: Pick<Dialog.Root.ChangeEventDetails, "reason" | "event">): Input | null {
  switch (reason) {
    case "escape-key":
      return "keyboard";
    case "outside-press":
      return "pointer";
    case "trigger-press":
    case "close-press":
      if (event instanceof KeyboardEvent) return "keyboard";
      return event instanceof MouseEvent ? inputOfClick(event) : "pointer";
    default:
      return null;
  }
}
