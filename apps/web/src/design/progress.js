// The state behind the top loading bar: busy while a page change is settling (a short sweep) or any server request is
// open. api.js wraps every request in begin()/end; App.jsx sweeps on every page change. No DOM here.

export function createProgress({ sweepMs = 350 } = {}) {
  let open = 0;
  let last = false;
  const listeners = new Set();
  const emit = () => {
    const now = open > 0;
    if (now === last) return;
    last = now;
    listeners.forEach((fn) => fn(now));
  };
  /** Starts one piece of work; the returned function ends it (calling it twice does nothing). */
  const begin = () => {
    open += 1;
    emit();
    let ended = false;
    return () => { if (ended) return; ended = true; open -= 1; emit(); };
  };
  return {
    begin,
    sweep: () => { const end = begin(); setTimeout(end, sweepMs); },
    busy: () => open > 0,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** The app's one loading bar. */
export const progress = createProgress();
