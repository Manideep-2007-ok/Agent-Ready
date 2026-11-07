import data from '../../docs/generated.json';
import { H2, Note, Table } from './parts.jsx';

export const title = 'Task packs';
export const lead = 'Four everyday tasks for each kind of site. Pick one, or let the Instant Scan detect which fits.';

export default function TaskPacks() {
  return (
    <>
      <p>With <b>Detect it for me</b>, the Instant Scan reads the page (schema.org types and words such as cart, pricing, sign up, article, opening hours) and picks the pack that fits best. If it cannot read the page, the online store pack is used.</p>
      {data.packs.map((p) => (
        <section key={p.id}>
          <H2 id={p.id}>{p.label} <code className="ar-doc-type">--pack {p.id}</code></H2>
          <p>{p.blurb}</p>
          <Table head={['Task', 'What the agent is asked to do']} mono={[]} rows={p.tasks.map((t) => [<span key={t.id}><b>{t.label}</b><br /><code>{t.id}</code></span>, t.goal])} />
          <p className="ar-faint ar-small">Quick run (<code>--tasks quick</code>): {p.quick.join(', ')}</p>
        </section>
      ))}
      <Note>The online store tasks were tested on live sites. The SaaS, content and local tasks follow the same wording style and are still being tuned on live agents.</Note>
    </>
  );
}
