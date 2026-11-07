// Tabs with roving tabindex: Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern).
import { useRef } from 'react';

/** @param {{tabs:{id:string,label:string,count?:number}[], current:string, onChange:(id:string)=>void, label?:string, idPrefix?:string}} props */
export default function Tabs({ tabs, current, onChange, label = 'Sections', idPrefix = 'tab' }) {
  const refs = useRef({});
  const move = (e, i) => {
    const last = tabs.length - 1;
    const to = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };
  return (
    <div className="ar-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`${idPrefix}-${t.id}`}
          aria-selected={current === t.id} aria-controls={`${idPrefix}-panel-${t.id}`} tabIndex={current === t.id ? 0 : -1}
          className="ar-tab" onClick={() => onChange(t.id)} onKeyDown={(e) => move(e, i)}>
          {t.label}{t.count != null && <span className="ar-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The panel for one tab. Always mounted (so print can show every tab); hidden when not current. */
export function TabPanel({ id, current, idPrefix = 'tab', children }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-${id}`} hidden={current !== id} className="ar-tabpanel">
      {children}
    </div>
  );
}
