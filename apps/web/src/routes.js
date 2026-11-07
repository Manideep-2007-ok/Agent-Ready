// Hash routes (no router library). Three areas: the public site (#/, #/pricing), docs (#/docs/<slug>) and the app
// (#/app/...). Old dashboard links (#/test/<id>, #/watch, ...) printed by the CLI, Watch alerts and READMEs redirect.

const APP_PAGES = ['test', 'watch', 'race', 'leaderboard'];
const OLD_APP_PAGES = ['test', 'watch', 'race', 'leaderboard'];

const parts = (hash) => String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
const decode = (p) => { if (!p) return null; try { return decodeURIComponent(p); } catch { return p; } };

/** @returns {{area:'site'|'docs'|'app', page:string, id:string|null, extra:string|null}} */
export function parseHash(hash) {
  const [first = '', second, third, fourth] = parts(hash);
  if (first === 'docs') return { area: 'docs', page: decode(second) || 'getting-started', id: null, extra: null };
  if (first === 'app') {
    if (!APP_PAGES.includes(second) || (second === 'test' && !third)) return { area: 'app', page: 'tests', id: null, extra: null };
    return { area: 'app', page: second, id: decode(third), extra: decode(fourth) };
  }
  if (first === 'pricing') return { area: 'site', page: 'pricing', id: null, extra: null };
  return { area: 'site', page: 'landing', id: null, extra: null };
}

/** The new address for an old dashboard link, or null. Parts are kept exactly as given (already encoded). */
export function redirectFor(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [first, ...rest] = raw.split('/');
  if (!OLD_APP_PAGES.includes(first)) return null;
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
