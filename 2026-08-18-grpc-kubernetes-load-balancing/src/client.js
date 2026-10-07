import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.join(directory, '..', 'proto', 'lab.proto');
const definition = protoLoader.loadSync(protoPath, {
  defaults: true,
  keepCase: true,
  longs: String,
  oneofs: true,
});
const service = grpc.loadPackageDefinition(definition).lab;

const target = process.env.TARGET ?? 'localhost:50051';
const policy = process.env.LB_POLICY ?? 'pick_first';
const requests = Number(process.env.REQUESTS ?? 200);
const concurrency = Number(process.env.CONCURRENCY ?? 20);
const intervalMs = Number(process.env.INTERVAL_MS ?? 0);

const channelOptions = policy === 'round_robin'
  ? {
      'grpc.service_config': JSON.stringify({
        loadBalancingConfig: [{ round_robin: {} }],
      }),
    }
  : {};

const client = new service.Backend(
  target,
  grpc.credentials.createInsecure(),
  channelOptions,
);

function waitForReady() {
  return new Promise((resolve, reject) => {
    client.waitForReady(Date.now() + 30_000, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function call(sequence) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    client.work({ sequence }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ ...response, latency_ms: performance.now() - startedAt });
    });
  });
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil(sortedValues.length * ratio) - 1;
  return sortedValues[Math.max(0, index)];
}

await waitForReady();
const experimentStartedAt = performance.now();
let nextSequence = 1;
const results = [];

async function worker() {
  while (nextSequence <= requests) {
    const sequence = nextSequence;
    nextSequence += 1;
    results.push(await call(sequence));
    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
client.close();

const countsByPod = Object.fromEntries(
  Object.entries(
    results.reduce((counts, result) => {
      counts[result.pod] = (counts[result.pod] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort(([left], [right]) => left.localeCompare(right)),
);
const latencies = results.map((result) => result.latency_ms).sort((a, b) => a - b);
const queueWaits = results.map((result) => result.queue_wait_ms).sort((a, b) => a - b);
const durationMs = performance.now() - experimentStartedAt;

console.log(JSON.stringify({
  target,
  policy,
  requests,
  concurrency,
  intervalMs,
  counts_by_pod: countsByPod,
  duration_ms: Number(durationMs.toFixed(2)),
  throughput_rps: Number((requests / (durationMs / 1_000)).toFixed(2)),
  latency_ms: {
    p50: Number(percentile(latencies, 0.5).toFixed(2)),
    p95: Number(percentile(latencies, 0.95).toFixed(2)),
    max: Number(latencies.at(-1).toFixed(2)),
  },
  server_queue_wait_ms: {
    p50: Number(percentile(queueWaits, 0.5).toFixed(2)),
    p95: Number(percentile(queueWaits, 0.95).toFixed(2)),
    max: Number(queueWaits.at(-1).toFixed(2)),
  },
}, null, 2));
