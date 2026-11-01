// Full-screen screenshot viewer (UI rule: every screenshot can be enlarged). Click anywhere or press Esc to close.
import { useEffect } from 'react';

export default function ShotViewer({ url, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div className="shot-viewer" role="dialog" aria-label="Screenshot" onClick={onClose}>
      <img src={url} alt="Screenshot from the agent's browser" />
      <span className="shot-viewer-hint">Click or press Esc to close</span>
    </div>
  );
}
