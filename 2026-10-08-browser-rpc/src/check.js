import assert from 'node:assert/strict';
import { createClient, Code } from '@connectrpc/connect';
import { createConnectTransport, createGrpcWebTransport } from '@connectrpc/connect-web';
import { EchoService } from './gen/lab_pb.js';
for (const [name, transport] of [
  ['connect', createConnectTransport({ baseUrl: 'http://127.0.0.1:8090' })],
  ['grpcweb', createGrpcWebTransport({ baseUrl: 'http://127.0.0.1:8091' })],
]) {
  const client = createClient(EchoService, transport);
  assert.equal((await client.echo({ text: 'test' })).text, 'test');
  const received = [];
  for await (const m of client.watch({ count: 3, intervalMs: 100 })) received.push(m.sequence);
  assert.deepEqual(received, [1, 2, 3]);
  const partial = [];
  await assert.rejects(async () => {
    for await (const m of client.watch({ count: 5, intervalMs: 100, failAfter: 3 })) partial.push(m.sequence);
  }, (e) => e.code === Code.Internal);
  assert.deepEqual(partial, [1, 2, 3]);
  const controller = new AbortController();
  const cancelled = [];
  await assert.rejects(async () => {
    for await (const m of client.watch({ count: 5, intervalMs: 100 }, { signal: controller.signal })) {
      cancelled.push(m.sequence);
      if (cancelled.length === 2) controller.abort();
    }
  }, (e) => e.code === Code.Canceled);
  assert.deepEqual(cancelled, [1, 2]);
  console.log(`${name}: unary, stream, partial error, cancellation PASS (Node fetch; browser checked separately)`);
}
