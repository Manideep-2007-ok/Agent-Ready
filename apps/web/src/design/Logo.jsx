// Step-path mark (dots on a path ending in a check) and the lowercase wordmark. Below 20 px the dashed path is dropped.
export function LogoMark({ size = 24, compact = size < 20, title }) {
  return (
    <svg className="ar-logo-mark" width={size} height={size} viewBox="0 0 32 32" role={title ? 'img' : undefined}
      aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <circle cx="8" cy="22" r="2.2" fill="var(--accent-ink)" />
      <circle cx="14" cy="15" r="2.2" fill="var(--accent-ink)" />
      {!compact && <path d="M8 22 L14 15 L18 18" stroke="var(--accent-ink)" strokeWidth="1.6" strokeDasharray="2 2" fill="none" />}
      <path d="M17 18 L20.5 21.5 L26 11" stroke="var(--accent-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ size = 24, wordmark = true, href }) {
  const body = (
    <>
      <LogoMark size={size} />
      {wordmark && <span className="ar-logo-word">agentready</span>}
    </>
  );
  return href
    ? <a className="ar-logo" href={href} aria-label="AgentReady home">{body}</a>
    : <span className="ar-logo" aria-label="AgentReady">{body}</span>;
}
