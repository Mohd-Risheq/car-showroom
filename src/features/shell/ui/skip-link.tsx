// FR-02.1: the first thing Tab reaches on every public page, out of sight until it has the focus.
// It moves the focus to main, which can take it (tabindex -1), past the banner and the header.
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#content"
      className="sr-only bg-surface-2 px-5 text-ink shadow-overlay focus:not-sr-only focus:fixed focus:start-page focus:top-page focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-full"
    >
      {label}
    </a>
  );
}
