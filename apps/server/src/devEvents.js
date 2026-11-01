// DEV STAND-IN for events.js (Akhil's SSE hub). loaders.js uses the real file as soon as it exists.
// Same contract: subscribe(channel, res) and publish(event).

const channels = new Map();

const channelOf = (event) => event.reportId ?? `watch:${event.watchId}`;

export function subscribe(channel, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  const clients = channels.get(channel) ?? new Set();
  clients.add(res);
  channels.set(channel, clients);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
    if (clients.size === 0) channels.delete(channel);
  });
}

export function publish(event) {
  for (const res of channels.get(channelOf(event)) ?? []) res.write(`data: ${JSON.stringify(event)}\n\n`);
}
