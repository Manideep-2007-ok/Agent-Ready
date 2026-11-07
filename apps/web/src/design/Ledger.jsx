import { followsRowClick } from './rowClick.js';

// Numbered table rows (Vouch-style ledger). A row with href is a link across the whole row; hideOnPhone drops a column under 640 px.
/**
 * @param {{columns:{key:string,label:string,align?:'left'|'right',hideOnPhone?:boolean,mono?:boolean}[],
 *          rows:{id:string,cells:Record<string,any>,href?:string,onClick?:()=>void,tone?:string}[], empty?:any, caption?:string}} props
 */
export default function Ledger({ columns, rows, empty = null, caption }) {
  if (!rows.length && empty) return empty;
  const cls = (c) => [c.align === 'right' && 'is-right', c.hideOnPhone && 'hide-phone', c.mono && 'is-mono'].filter(Boolean).join(' ') || undefined;
  return (
    <div className="ar-ledger-wrap">
      <table className="ar-ledger">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col" className="ar-ledger-id">ID</th>
            {columns.map((c) => <th key={c.key} scope="col" className={cls(c)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.href || r.onClick ? 'is-link' : undefined}
              onClick={r.onClick ?? (r.href ? (e) => { if (followsRowClick(e, window.getSelection?.().toString())) window.location.hash = r.href.replace(/^#/, ''); } : undefined)}>
              <td className="ar-ledger-id">
                {r.href ? <a href={r.href} onClick={(e) => e.stopPropagation()}>{r.id}</a> : r.id}
              </td>
              {columns.map((c) => <td key={c.key} className={cls(c)}>{r.cells[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
