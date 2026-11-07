// Status chip: mono uppercase text on a soft tint of its colour. Always carries a word, never colour alone.
import { statusBadge } from './status.js';

export default function Badge({ tone = 'neutral', children, title }) {
  return <span className={`ar-badge ar-badge--${tone}`} title={title}>{children}</span>;
}

/** Badge for a task status (and its bot-wall verdict). */
export function StatusBadge({ status, verdict }) {
  const { tone, label } = statusBadge(status, verdict);
  return <Badge tone={tone}>{label}</Badge>;
}
