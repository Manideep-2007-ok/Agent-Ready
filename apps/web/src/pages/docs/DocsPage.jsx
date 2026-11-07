// Docs (#/docs/<slug>): left nav, the page, and "On this page" built from its section headings. An unknown slug says
// so and keeps the nav, never a blank page.
import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState } from '../../design/index.js';
import { href } from '../../routes.js';
import { DOC_GROUPS, DOCS } from './nav.js';

function OnThisPage({ slug, body }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems([...(body.current?.querySelectorAll('h2[id]') ?? [])].map((h) => ({ id: h.id, text: h.textContent.replace(/^#/, '') })));
  }, [slug, body]);
  if (items.length < 2) return null;
  return (
    <nav className="ar-doc-toc" aria-label="On this page">
      <span className="ar-label">On this page</span>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(i.id)?.scrollIntoView({ block: 'start' }); }}>{i.text}</a>
      ))}
    </nav>
  );
}

export default function DocsPage({ slug }) {
  const body = useRef(null);
  const doc = DOCS[slug];
  useEffect(() => {
    document.title = doc ? `${doc.title} · AgentReady docs` : 'Docs · AgentReady';
    return () => { document.title = 'AgentReady'; }; // leaving the docs must not keep their title
  }, [doc]);
  const Page = doc?.default;
  return (
    <div className="ar-docs">
      <nav className="ar-doc-nav" aria-label="Docs">
        {DOC_GROUPS.map((g) => (
          <div key={g.label} className="ar-doc-group">
            <span className="ar-label">{g.label}</span>
            {g.pages.map(([s, m]) => (
              <a key={s} href={href('docs', s)} aria-current={s === slug ? 'page' : undefined}>{m.title}</a>
            ))}
          </div>
        ))}
      </nav>
      <article className="ar-doc" ref={body}>
        {doc ? (
          <>
            <span className="ar-label ar-eyebrow">Docs</span>
            <h1>{doc.title}</h1>
            <p className="ar-doc-lead">{doc.lead}</p>
            <Page />
          </>
        ) : (
          <EmptyState title="This page does not exist" body="It may have moved. Pick a page from the list, or start at the beginning."
            action={<Button as="a" href={href('docs', 'getting-started')}>Getting started</Button>} />
        )}
      </article>
      {doc && <OnThisPage slug={slug} body={body} />}
    </div>
  );
}
