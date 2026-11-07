// Grey placeholder rows while data loads.
export default function Skeleton({ rows = 3, label = 'Loading' }) {
  return (
    <div className="ar-skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <span key={i} />)}
    </div>
  );
}
