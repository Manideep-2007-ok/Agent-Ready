// iPad-style pointer: a soft round dot that follows the mouse on a critically damped spring (no overshoot),
// grows into a halo over anything clickable, and shrinks a little on press (feedback on pointer-down).
// Text fields keep the normal I-beam. Only mounted with a real mouse and when motion is welcome (see App.jsx).
import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

const CLICKABLE = 'a, button, select, summary, label, [role="button"], [role="tab"], .fact, .bento-card, canvas';
const TEXT = 'input, textarea, [contenteditable="true"]';
const SPRING = { stiffness: 900, damping: 60, mass: 0.6 }; // ~critically damped: quick, no bounce

export default function PointerCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, SPRING);
  const sy = useSpring(y, SPRING);
  const [mode, setMode] = useState('dot'); // dot | hover | text | hidden
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('has-pointer-cursor');
    const move = (e) => {
      if (e.pointerType === 'touch') return;
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target instanceof Element ? e.target : null;
      setMode(el?.closest(TEXT) ? 'text' : el?.closest(CLICKABLE) ? 'hover' : 'dot');
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    const leave = () => setMode('hidden');
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      document.documentElement.classList.remove('has-pointer-cursor');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [x, y]);

  const size = mode === 'hover' ? 40 : 16;
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-cursor pointer-cursor--${mode}`}
      style={{ x: sx, y: sy }}
    >
      <motion.span
        className="pointer-cursor-dot"
        animate={{ width: size, height: size, scale: pressed ? 0.85 : 1, opacity: mode === 'hidden' || mode === 'text' ? 0 : 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      />
    </motion.div>
  );
}
