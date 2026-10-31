// GitHub Actions' workflow commands, for a script whose findings should show on the run's page as
// annotations, where anyone can read them, rather than only in the job's log.

/** Escapes a command's text as the Actions toolkit does, so a line break can't end it early */
const data = (text: string) => text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

/** Escapes a command's property, where a colon or a comma would also end it */
const property = (text: string) => data(text).replaceAll(":", "%3A").replaceAll(",", "%2C");

/** A workflow command that the run shows as an annotation with this title and text */
export function workflowCommand(level: "notice" | "error", title: string, message: string): string {
  return `::${level} title=${property(title)}::${data(message)}`;
}
