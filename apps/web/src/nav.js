// Moves between pages by changing the URL hash; App.jsx listens for the change.
// Extra parts go after the page, e.g. navigate('test', newId, beforeId) -> #/test/<newId>/<beforeId>.
export function navigate(page, ...parts) {
  window.location.hash = ['#', page, ...parts.filter(Boolean).map(encodeURIComponent)].join('/');
}
