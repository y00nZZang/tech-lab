import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { ConnectError, Code } from '@connectrpc/connect';
import { EchoService } from './gen/lab_pb.js';

const log = (transport, event, detail = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), transport, event, ...detail }));
const limits = (r) => ({ count: Math.min(r.count || 5, 20), interval: Math.max(100, Math.min(r.intervalMs || 1000, 3000)) });
const adapter = connectNodeAdapter({ grpc: false, grpcWeb: false, routes(router) {
  router.service(EchoService, {
    echo(request) { log('connect', 'echo'); return { text: request.text, sequence: 1 }; },
    async *watch(request, context) {
      const { count, interval } = limits(request);
      log('connect', 'start');
      try {
        for (let sequence = 1; sequence <= count; sequence++) {
          await delay(interval, undefined, { signal: context.signal });
          log('connect', 'send', { sequence });
          yield { text: `message ${sequence}`, sequence };
          if (request.failAfter === sequence) throw new ConnectError('synthetic failure', Code.Internal);
        }
        log('connect', 'complete');
      } finally { log('connect', 'finish', { aborted: context.signal.aborted }); }
    },
  });
} });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5178');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,connect-protocol-version,connect-timeout-ms,x-user-agent');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'grpc-status,grpc-message');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  adapter(req, res);
}).listen(8090, '127.0.0.1', () => log('connect', 'listening', { port: 8090 }));

const definition = grpc.loadPackageDefinition(loader.loadSync('proto/lab.proto', { defaults: true, keepCase: false }));
const server = new grpc.Server();
server.addService(definition.lab.v1.EchoService.service, {
  echo(call, callback) { log('grpc', 'echo'); callback(null, { text: call.request.text, sequence: 1 }); },
  async watch(call) {
    const { count, interval } = limits(call.request);
    const controller = new AbortController();
    let ended = false;
    call.on('cancelled', () => { if (!ended) { controller.abort(); log('grpc', 'cancel'); } });
    log('grpc', 'start');
    try {
      for (let sequence = 1; sequence <= count; sequence++) {
        await delay(interval, undefined, { signal: controller.signal });
        if (call.cancelled) break;
        call.write({ text: `message ${sequence}`, sequence });
        log('grpc', 'send', { sequence });
        if (call.request.failAfter === sequence) {
          call.emit('error', Object.assign(new Error('synthetic failure'), { code: grpc.status.INTERNAL }));
          return;
        }
      }
      ended = true; call.end(); log('grpc', 'complete');
    } catch (error) { if (!controller.signal.aborted) call.emit('error', error); }
    finally { log('grpc', 'finish', { aborted: controller.signal.aborted }); }
  },
});
// Docker Desktop's Envoy reaches this listener via host.docker.internal.
server.bindAsync('0.0.0.0:50061', grpc.ServerCredentials.createInsecure(), (error) => {
  if (error) throw error; log('grpc', 'listening', { port: 50061 });
});
