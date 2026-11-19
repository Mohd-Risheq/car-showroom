// The 404's heading, and the line under it when it has one (DESIGN §7.2.11), apart from the view, so
// a page that heads its 404 itself, as the car page does for a car that has gone, keeps its look.

/** A 404 view's heading, with the line under it */
export function NotFoundIntro({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex max-w-measure flex-col gap-3">
      <h1 className="type-head">{title}</h1>
      {body === undefined ? null : <p className="type-lead text-muted">{body}</p>}
    </div>
  );
}
