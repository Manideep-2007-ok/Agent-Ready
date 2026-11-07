// The thin bar at the very top: it runs while a page change settles or the page waits for the server (progress.js),
// then fills and fades. Decorative (aria-hidden); pages say what they are loading in words.
import { useEffect, useRef, useState } from 'react';
import { progress } from './progress.js';

export default function RouteProgress() {
  const [state, setState] = useState('idle'); // idle -> busy -> done -> idle
  const timer = useRef(null);
  useEffect(() => progress.subscribe((busy) => {
    clearTimeout(timer.current);
    if (busy) { setState('busy'); return; }
    setState('done');
    timer.current = setTimeout(() => setState('idle'), 400);
  }), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className="ar-progress" data-state={state} aria-hidden="true"><span /></div>;
}
