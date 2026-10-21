// A preview route that never reads the editor's changes, so a token the
// server action issues for it is never consumed by its render.
export default function UnreadPage() {
  return <p>unread</p>;
}
