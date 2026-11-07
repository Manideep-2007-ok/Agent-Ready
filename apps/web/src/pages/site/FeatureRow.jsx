// One landing feature: copy on one side, a real product panel on the other (sides alternate). No panel: copy only.
export default function FeatureRow({ eyebrow, title, points, panel, flip = false }) {
  return (
    <section className={`ar-feature${flip ? ' is-flip' : ''}${panel ? '' : ' is-solo'}`}>
      <div className="ar-feature-copy">
        <span className="ar-label ar-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
      {panel && <div className="ar-feature-panel">{panel}</div>}
    </section>
  );
}
