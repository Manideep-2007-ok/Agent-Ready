// "Agent-Ready" badge: a flat, shields-style SVG. Pure function, no I/O, text is escaped.
// Colours: green >= 90, yellow-green >= 75, amber >= 50, red below; stopped / error / unknown are grey.

const COLORS = { green: '#3fb950', yellowgreen: '#a4b72b', amber: '#e5a00d', red: '#d73a49', grey: '#8b949e' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Rough Verdana 11px width, close enough for a badge (no font metrics available without a dependency).
const textWidth = (s) => Math.round([...String(s)].reduce((w, ch) => w + (/[ijl.,:'!|]/.test(ch) ? 3.4 : /[mwMW@]/.test(ch) ? 10.2 : /[A-Z0-9%]/.test(ch) ? 7.4 : 6.2), 0));

/** @returns {{text:string, color:string}} what the right half of the badge says */
export function badgeValue(score) {
  if (score === 'stopped' || score === 'error' || score === 'unknown') return { text: score, color: COLORS.grey };
  const n = Number(score);
  if (score === null || score === undefined || score === '' || !Number.isFinite(n)) return { text: 'unknown', color: COLORS.grey };
  const s = Math.max(0, Math.min(100, Math.round(n)));
  const color = s >= 90 ? COLORS.green : s >= 75 ? COLORS.yellowgreen : s >= 50 ? COLORS.amber : COLORS.red;
  return { text: `${s}/100`, color };
}

/**
 * @param {{score:number|'stopped'|'error'|'unknown'|null, label?:string}} opts
 * @returns {string} SVG document
 */
export function badgeSvg({ score, label = 'agent-ready' } = {}) {
  const { text, color } = badgeValue(score);
  const left = String(label).slice(0, 40);
  const lw = textWidth(left) + 14;
  const rw = textWidth(text) + 14;
  const w = lw + rw;
  const title = esc(`${left}: ${text}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(left)}</text><text x="${lw / 2}" y="14">${esc(left)}</text>` +
    `<text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(text)}</text><text x="${lw + rw / 2}" y="14">${esc(text)}</text>` +
    `</g></svg>\n`;
}

/** Badge for a finished SiteReport: cancelled -> "stopped", missing/unscored -> "unknown". */
export function badgeForReport(report) {
  if (!report) return badgeSvg({ score: 'unknown' });
  if (report.status === 'cancelled') return badgeSvg({ score: 'stopped' });
  if (report.status === 'running' || typeof report.score !== 'number') return badgeSvg({ score: 'unknown' });
  return badgeSvg({ score: report.score });
}
