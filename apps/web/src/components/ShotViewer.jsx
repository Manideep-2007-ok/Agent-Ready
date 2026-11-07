// Full-size screenshot over the page. A modal dialog: focus moves to it and back to what opened it, the page behind
// stops scrolling, Esc or a click closes it. It fades in (no motion under reduced motion, base.css).
import { useEffect, useRef } from 'react';

export default function ShotViewer({ url, onClose }) {
  const box = useRef(null);
  useEffect(() => {
    if (!url) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { e.preventDefault(); box.current?.focus(); } // one control: keep focus in the dialog
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div ref={box} className="shot-viewer" role="dialog" aria-modal="true" aria-label="Screenshot" tabIndex={-1} onClick={onClose}>
      <img src={url} alt="Screenshot from the agent's browser" />
      <span className="shot-viewer-hint">Click or press Esc to close</span>
    </div>
  );
}
