// Landing motion without a library: reveal on first scroll into view, count-ups, and an in-view flag that pauses loops
// off screen. Everything settles to its final state when the visitor prefers reduced motion (base.css also turns
// transitions off then), when IntersectionObserver is missing, and in print.
import { useEffect, useRef, useState } from 'react';

const query = '(prefers-reduced-motion: reduce)';
export const prefersReduced = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);

export function useReducedMotion() {
  const [reduce, setReduce] = useState(prefersReduced);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const on = () => setReduce(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduce;
}

/** [ref, inView]. once: stays true after the first time. Without IntersectionObserver it is always in view. */
export function useInView({ once = false, amount = 0.2 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); } else if (!once) setInView(false);
    }, { threshold: amount });
    io.observe(el);
    return () => io.disconnect();
  }, [once, amount]);
  return [ref, inView];
}

/** Fades and rises its children in once, the first time they scroll into view. */
export function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const reduce = useReducedMotion();
  const [ref, inView] = useInView({ once: true, amount: 0.15 });
  const shown = reduce || inView;
  return (
    <Tag ref={ref} className={`ar-reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

/** Shows its children one after another (CSS delays on .ar-stagger) the first time it scrolls into view. */
export function Stagger({ className = '', children }) {
  const reduce = useReducedMotion();
  const [ref, inView] = useInView({ once: true, amount: 0.3 });
  return <div ref={ref} className={`${className} ar-stagger${reduce || inView ? ' is-in' : ''}`}>{children}</div>;
}

/** Eases from `from` to `to` once `run` turns true; jumps to `to` under reduced motion. */
export function useCountUp(from, to, run, duration = 1100) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : from);
  useEffect(() => {
    if (!run) return undefined;
    if (reduce) { setV(to); return undefined; }
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setV(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, from, to, duration, reduce]);
  return v;
}
