// SSE hub: dashboards subscribe under a key, the server publishes events to that key.
// Keys: reportId, 'watch:<watchId>', 'race:<raceId>'.

/** @type {Map<string, Set<import('node:http').ServerResponse>>} */
const subscribers = new Map();

/** Open an SSE stream on `res` and register it under `key`. Returns an unsubscribe function. */
export function subscribe(key, res) {
  key = String(key);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(res);

  const unsubscribe = () => {
    const set = subscribers.get(key);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) subscribers.delete(key);
  };
  // Only res 'close' (client went away). req 'close' can fire as soon as a GET body is read on some Node versions.
  res.on('close', unsubscribe);
  res.on('error', unsubscribe);
  return unsubscribe;
}

/** Write one event to one stream. Never throws. Returns false if the socket is dead. */
export function send(res, event) {
  let line;
  try { line = `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`; } catch { return true; } // bad event, socket is fine
  try {
    if (res.writableEnded || res.destroyed) return false;
    res.write(line);
    return true;
  } catch {
    return false;
  }
}

/** Keys an event belongs to: its reportId, 'watch:<watchId>' and 'race:<raceId>'. */
function keysOf(event) {
  const keys = [];
  if (event.reportId) keys.push(String(event.reportId));
  if (event.watchId) keys.push('watch:' + event.watchId);
  if (event.raceId) keys.push('race:' + event.raceId);
  return keys;
}

/** Send an event to everyone subscribed to its key(s). Never throws. Returns the number of streams written. */
export function publish(event) {
  try {
    if (!event || typeof event !== 'object') return 0;
    let data;
    try { data = JSON.stringify(event); } catch { return 0; } // unserialisable event: drop it, keep the sockets
    let sent = 0;
    for (const key of keysOf(event)) {
      const set = subscribers.get(key);
      if (!set) continue;
      for (const res of [...set]) {
        if (send(res, data)) sent++;
        else set.delete(res); // dead socket
      }
      if (set.size === 0) subscribers.delete(key);
    }
    return sent;
  } catch {
    return 0;
  }
}

export function subscriberCount(key) {
  return subscribers.get(String(key))?.size ?? 0;
}

// One global keep-alive so proxies do not close idle streams.
const pinger = setInterval(() => {
  for (const set of subscribers.values()) {
    for (const res of [...set]) {
      try {
        if (res.writableEnded || res.destroyed) set.delete(res);
        else res.write(': ping\n\n');
      } catch {
        set.delete(res);
      }
    }
  }
}, 15000);
pinger.unref();
