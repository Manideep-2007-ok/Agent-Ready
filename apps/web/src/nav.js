// Moves between pages by changing the URL hash; App.jsx listens for the change.
export function navigate(page, param) {
  window.location.hash = param ? `#/${page}/${encodeURIComponent(param)}` : `#/${page}`;
}
