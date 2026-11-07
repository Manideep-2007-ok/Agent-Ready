// A mono code block with a Copy button (CLI commands, Action YAML, API calls).
import { useRef, useState } from 'react';

export default function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const pre = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="ar-code">
      <div className="ar-code-head">
        <span className="ar-label">{label ?? 'Code'}</span>
        <button type="button" className="ar-code-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre ref={pre}><code>{code}</code></pre>
    </div>
  );
}
