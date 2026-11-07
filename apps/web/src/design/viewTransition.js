// Page and theme changes as a short crossfade, with the browser's View Transitions where it has them. The sidebar and
// the top bars carry their own view-transition-name (shell.css), so within a layout they stay put and only the content
// changes. No View Transitions, or reduced motion: the update just happens, as before.
import { flushSync } from 'react-dom';

const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Runs `update` (which may set React state) inside a view transition when the browser can. */
export function runTransition(update) {
  if (typeof document === 'undefined' || !document.startViewTransition || calm()) { update(); return; }
  try { document.startViewTransition(() => flushSync(update)); } catch { update(); }
}
