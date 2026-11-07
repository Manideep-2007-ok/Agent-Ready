import data from '../../docs/generated.json';
import { H2, Note } from './parts.jsx';

export const title = 'Findings reference';
export const lead = 'Every problem AgentReady can report, the likely cause on your site and the fix. Generated from the engine, so it always matches what a report says.';

const name = (type) => type.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function Findings() {
  return (
    <>
      <Note>Causes are inferred from what the agents saw, so reports show them as "Likely cause". They always name something on the site, never the agent.</Note>
      {data.findings.map((f) => (
        <section key={f.type} className="ar-doc-finding">
          <H2 id={f.type}>{name(f.type)} <code className="ar-doc-type">{f.type}</code></H2>
          <dl>
            <dt>Likely cause</dt><dd>{f.likelyCause}</dd>
            <dt>Fix</dt><dd>{f.fix}</dd>
            {f.standard && <><dt>Standard</dt><dd>{f.standard}</dd></>}
            {f.passCheck && <><dt>Fixed when</dt><dd>{f.passCheck}</dd></>}
          </dl>
          {f.example && <pre className="ar-snippet">{f.example}</pre>}
        </section>
      ))}
    </>
  );
}
