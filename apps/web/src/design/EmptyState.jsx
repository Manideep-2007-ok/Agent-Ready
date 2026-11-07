// An invitation where there is nothing yet: a headline, one line, one action.
export default function EmptyState({ title, body, action }) {
  return (
    <div className="ar-empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
