import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import os from 'node:os';
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

const port = Number(process.env.PORT ?? 50051);
const workMs = Number(process.env.WORK_MS ?? 50);
const maxConcurrency = Number(process.env.MAX_CONCURRENCY ?? 4);
const maxConnectionAgeMs = Number(process.env.MAX_CONNECTION_AGE_MS ?? 0);

let active = 0;
const waiters = [];

function acquire() {
  if (active < maxConcurrency) {
    active += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => waiters.push(resolve));
}

function release() {
  const next = waiters.shift();
  if (next) {
    next();
    return;
  }
  active -= 1;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function work(call, callback) {
  const queuedAt = performance.now();
  await acquire();
  const startedAt = performance.now();

  try {
    await delay(workMs);
    callback(null, {
      sequence: call.request.sequence,
      pod: os.hostname(),
      queue_wait_ms: startedAt - queuedAt,
      service_ms: performance.now() - startedAt,
    });
  } finally {
    release();
  }
}

const serverOptions = maxConnectionAgeMs > 0
  ? { 'grpc.max_connection_age_ms': maxConnectionAgeMs }
  : {};
const server = new grpc.Server(serverOptions);
server.addService(service.Backend.service, { work });
if (process.env.ENABLE_CHANNELZ === '1') {
  grpc.addAdminServicesToServer(server);
}
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (error) => {
    if (error) throw error;
    console.log(JSON.stringify({
      event: 'server_started',
      pod: os.hostname(),
      port,
      workMs,
      maxConcurrency,
      maxConnectionAgeMs,
    }));
  },
);

function shutdown() {
  server.tryShutdown(() => process.exit(0));
  setTimeout(() => server.forceShutdown(), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
