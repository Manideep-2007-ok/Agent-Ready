// Smoke test for events.js: node apps/server/scripts/events-smoke.js
import http from 'node:http';
import assert from 'node:assert/strict';
import { subscribe, publish, subscriberCount } from '../src/events.js';

const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/events\/(.+)$/);
  if (m) return subscribe(decodeURIComponent(m[1]), res);
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const ac = new AbortController();
const resp = await fetch(`http://127.0.0.1:${port}/events/rep1`, { signal: ac.signal });
assert.equal(resp.headers.get('content-type'), 'text/event-stream');
await new Promise((r) => setTimeout(r, 100));
assert.equal(subscriberCount('rep1'), 1);

publish({ type: 'a', reportId: 'rep1', n: 1 });
publish({ type: 'b', reportId: 'rep1', n: 2 });
publish({ type: 'other', reportId: 'nobody' }); // no subscribers: must not throw

const reader = resp.body.getReader();
const dec = new TextDecoder();
let buf = '';
while (!(buf.includes('"n":1') && buf.includes('"n":2'))) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value);
}
assert.ok(buf.includes('data: {"type":"a"'), 'event a received');
assert.ok(buf.includes('"type":"b"'), 'event b received');

ac.abort();
await new Promise((r) => setTimeout(r, 150));
assert.equal(subscriberCount('rep1'), 0, 'unsubscribed on close');
server.close();
console.log('PASS events-smoke');
process.exit(0);
