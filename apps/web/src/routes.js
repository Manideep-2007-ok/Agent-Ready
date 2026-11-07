// Hash routes (no router library). Three areas: the public site (#/, #/pricing), docs (#/docs/<slug>) and the app
// (#/app/...). Old dashboard links (#/test/<id>, #/watch, ...) printed by the CLI, Watch alerts and READMEs redirect.

/** App pages under #/app/<page>. Old links (#/<page>/...) for the same pages redirect there. */
export const APP_PAGES = ['test', 'watch', 'race', 'leaderboard'];
const NOT_FOUND = { page: 'not-found', id: null, extra: null };

const parts = (hash) => String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
const decode = (p) => { if (!p) return null; try { return decodeURIComponent(p); } catch { return p; } };

/** An address nobody knows is page 'not-found' in its area; the address stays as typed.
 * @returns {{area:'site'|'docs'|'app', page:string, id:string|null, extra:string|null}} */
export function parseHash(hash) {
  const [first = '', second, third, fourth, ...rest] = parts(hash);
  if (first === 'docs') return { area: 'docs', page: decode(second) || 'getting-started', id: null, extra: null };
  if (first === 'app') {
    if (!second || (second === 'test' && !third)) return { area: 'app', page: 'tests', id: null, extra: null };
    if (!APP_PAGES.includes(second) || rest.length) return { area: 'app', ...NOT_FOUND };
    return { area: 'app', page: second, id: decode(third), extra: decode(fourth) };
  }
  if (!first) return { area: 'site', page: 'landing', id: null, extra: null };
  if (first === 'pricing' && !second) return { area: 'site', page: 'pricing', id: null, extra: null };
  return { area: 'site', ...NOT_FOUND };
}

/** The new address for an old dashboard link, or null. Parts are kept exactly as given (already encoded). */
export function redirectFor(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [first, ...rest] = raw.split('/');
  if (!APP_PAGES.includes(first)) return null;
  if (first === 'test' && !rest.filter(Boolean).length) return '#/app';
  return ['#/app', first, ...rest.filter(Boolean)].join('/');
}

/** Build a hash link. href('app','tests') -> '#/app'; href('site','landing') -> '#/'; empty parts are skipped. */
export function href(area, page, ...more) {
  const tail = more.filter((p) => p != null && p !== '').map((p) => encodeURIComponent(p));
  if (area === 'site') return page === 'landing' ? '#/' : `#/${page}`;
  if (area === 'docs') return `#/docs/${encodeURIComponent(page)}`;
  if (page === 'tests') return '#/app';
  return ['#/app', page, ...tail].join('/');
}
