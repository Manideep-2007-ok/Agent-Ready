// Whole-row links in a Ledger: follow only a plain left click with no text selected, so Ctrl/Cmd/Shift-click, middle
// click and selecting a host name keep their normal browser behaviour.
export function followsRowClick(e, selectedText = '') {
  if (e.defaultPrevented || e.button !== 0) return false;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
  return !selectedText;
}
