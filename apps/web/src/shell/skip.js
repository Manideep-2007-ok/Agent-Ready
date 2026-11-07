// "Skip to content": the hash is the router here, so the link must not change it; it moves focus to <main> instead.
export function skipToMain(e) {
  e.preventDefault();
  document.getElementById('main')?.focus();
}
