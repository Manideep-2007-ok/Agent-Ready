import data from '../../docs/generated.json';
import { H2, Note } from './parts.jsx';

export const title = 'Findings reference';
export const lead = 'Every problem AgentReady can report, the likely cause on your site and the fix. Generated from the engine, so it always matches what a report says.';

const name = (type) => type.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// One short row per finding, grouped by kind of site; a row opens for the cause, standard and pass check.
const GROUPS = [
  ['access', 'Getting in', 'Whether AI agents can reach the site at all.'],
  ['any', 'Any site', 'Found on every kind of site.'],
  ['shop', 'Online stores', 'Shop pack tasks and product pages.'],
  ['saas', 'SaaS', 'SaaS pack tasks.'],
  ['content', 'Content sites', 'Content pack tasks.'],
  ['local', 'Local businesses', 'Local pack tasks.'],
];

export default function Findings() {
  return (
    <>
      <Note>Causes are inferred from what the agents saw, so reports show them as "Likely cause". They always name something on the site, never the agent.</Note>
      {GROUPS.map(([group, heading, blurb]) => {
        const rows = data.findings.filter((f) => f.group === group);
        return (
          <section key={group}>
            <H2 id={`group-${group}`}>{heading} <span className="ar-faint ar-doc-count">{rows.length}</span></H2>
            <p className="ar-muted">{blurb}</p>
            <div className="ar-doc-findings">
              {rows.map((f) => (
                <details key={f.type} id={f.type} className="ar-doc-finding">
                  <summary>
                    <span className="ar-doc-finding-name">{name(f.type)}</span>
                    <span className="ar-doc-finding-fix">{f.fix}</span>
                  </summary>
                  <dl>
                    <dt>Type</dt><dd><code className="ar-doc-type">{f.type}</code></dd>
                    <dt>Likely cause</dt><dd>{f.likelyCause}</dd>
                    {f.standard && <><dt>Standard</dt><dd>{f.standard}</dd></>}
                    {f.passCheck && <><dt>Fixed when</dt><dd>{f.passCheck}</dd></>}
                  </dl>
                  {f.example && <pre className="ar-snippet">{f.example}</pre>}
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
