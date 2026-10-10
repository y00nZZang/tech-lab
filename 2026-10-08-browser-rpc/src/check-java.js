import assert from 'node:assert/strict';
import { createClient, Code } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { EchoService } from './gen/lab_pb.js';
const rest = await fetch('http://127.0.0.1:8092/api/echo', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello proto' }),
});
assert.equal(rest.status, 200);
assert.deepEqual(await rest.json(), { text: 'hello proto', sequence: 1 });
const client = createClient(EchoService, createGrpcWebTransport({ baseUrl: 'http://127.0.0.1:8093' }));
assert.equal((await client.echo({ text: 'hello proto' })).text, 'hello proto');
const received = [];
for await (const m of client.watch({ count: 3, intervalMs: 100 })) received.push(m.sequence);
assert.deepEqual(received, [1, 2, 3]);
const partial = [];
await assert.rejects(async () => {
  for await (const m of client.watch({ count: 5, intervalMs: 100, failAfter: 3 })) partial.push(m.sequence);
}, (e) => e.code === Code.Internal);
assert.deepEqual(partial, [1, 2, 3]);
const controller = new AbortController();
await assert.rejects(async () => {
  for await (const m of client.watch({ count: 5, intervalMs: 100 }, { signal: controller.signal })) {
    if (m.sequence === 2) controller.abort();
  }
}, (e) => e.code === Code.Canceled);
console.log('PASS: Spring REST, Armeria unary, stream, partial error, cancellation (Node fetch)');
