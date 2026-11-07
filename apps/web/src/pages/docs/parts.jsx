// Small building blocks for docs pages: a section heading with an anchor, a table, a callout.
export function H2({ id, children }) {
  return <h2 id={id} className="ar-doc-h2"><a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: 'start' }); }} className="ar-doc-anchor" aria-hidden="true" tabIndex={-1}>#</a>{children}</h2>;
}

/** @param {{head:string[], rows:any[][], mono?:number[]}} props  mono: column indexes shown in mono */
export function Table({ head, rows, mono = [0] }) {
  return (
    <div className="ar-ledger-wrap ar-doc-table">
      <table className="ar-ledger">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={mono.includes(j) ? 'is-mono' : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Note({ children }) {
  return <p className="ar-doc-note">{children}</p>;
}
