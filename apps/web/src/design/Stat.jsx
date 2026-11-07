// A big number with a mono label (score, cost, steps).
export default function Stat({ value, unit, label, tone }) {
  return (
    <div className={`ar-stat${tone ? ` ar-stat--${tone}` : ''}`}>
      <span className="ar-label">{label}</span>
      <span className="ar-stat-value">{value}{unit && <span className="ar-stat-unit">{unit}</span>}</span>
    </div>
  );
}
