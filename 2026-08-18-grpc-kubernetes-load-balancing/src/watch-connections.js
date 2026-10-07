import grpc from '@grpc/grpc-js';
import os from 'node:os';

const targets = process.argv.slice(2).map((value) => value.replace(/:.*$/, ''));
const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 100);
const durationMs = Number(process.env.WATCH_DURATION_MS ?? 0);

if (targets.length === 0) {
  console.error('usage: node src/watch-connections.js <backend-pod-ip> [backend-pod-ip ...]');
  process.exit(2);
}

const ChannelzClient = grpc.makeClientConstructor(
  grpc.getChannelzServiceDefinition(),
  'Channelz',
);

function unary(client, method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function ownIPv4Addresses() {
  return new Set(
    Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => item.address),
  );
}

function formatAddress(address) {
  const tcp = address?.tcpip_address;
  if (!tcp) return address?.uds_address?.filename ?? 'unknown';
  const bytes = Buffer.from(tcp.ip_address);
  const host = bytes.length === 4
    ? [...bytes].join('.')
    : bytes.toString('hex').match(/.{1,4}/g)?.join(':') ?? 'unknown';
  return `${host}:${tcp.port}`;
}

function emit(event, details) {
  console.log(JSON.stringify({
    event,
    observed_at: new Date().toISOString(),
    ...details,
  }));
}

const ignoredRemoteIPs = ownIPv4Addresses();
const watchers = targets.map((backendIp) => ({
  backendIp,
  client: new ChannelzClient(
    `${backendIp}:50051`,
    grpc.credentials.createInsecure(),
  ),
  sockets: new Map(),
  initialized: false,
}));

async function snapshot(watcher) {
  const serversResponse = await unary(watcher.client, 'GetServers', {
    start_server_id: 0,
    max_results: 100,
  });
  const active = new Map();

  for (const server of serversResponse.server ?? []) {
    const serverId = server.ref?.server_id;
    if (serverId === undefined) continue;
    const socketsResponse = await unary(watcher.client, 'GetServerSockets', {
      server_id: serverId,
      start_socket_id: 0,
      max_results: 1000,
    });

    for (const socketRef of socketsResponse.socket_ref ?? []) {
      const socketId = socketRef.socket_id;
      let socketResponse;
      try {
        socketResponse = await unary(watcher.client, 'GetSocket', {
          socket_id: socketId,
        });
      } catch (error) {
        // A connection can close after GetServerSockets lists it but before
        // GetSocket reads its details. That is a normal snapshot race.
        if (error.code === grpc.status.NOT_FOUND) continue;
        throw error;
      }
      const socket = socketResponse.socket;
      const local = formatAddress(socket?.local);
      const remote = formatAddress(socket?.remote);
      const remoteIp = socket?.remote?.tcpip_address
        ? Buffer.from(socket.remote.tcpip_address.ip_address).join('.')
        : '';

      // The watcher's own Channelz query connection is not workload traffic.
      if (ignoredRemoteIPs.has(remoteIp)) continue;
      active.set(String(socketId), { socketId: String(socketId), local, remote });
    }
  }

  return active;
}

async function poll(watcher) {
  try {
    const current = await snapshot(watcher);

    if (watcher.initialized) {
      for (const [socketId, connection] of current) {
        if (!watcher.sockets.has(socketId)) {
          emit('connection_open', { backend_ip: watcher.backendIp, ...connection });
        }
      }
      for (const [socketId, connection] of watcher.sockets) {
        if (!current.has(socketId)) {
          emit('connection_closed', { backend_ip: watcher.backendIp, ...connection });
        }
      }
    } else {
      emit('watcher_ready', {
        backend_ip: watcher.backendIp,
        preexisting_connections: current.size,
      });
      watcher.initialized = true;
    }

    watcher.sockets = current;
  } catch (error) {
    emit('channelz_poll_error', {
      backend_ip: watcher.backendIp,
      message: error.message,
    });
  }
}

async function run() {
  const startedAt = Date.now();
  emit('watcher_started', {
    backend_ips: targets,
    interval_ms: intervalMs,
    duration_ms: durationMs || null,
  });
  while (durationMs === 0 || Date.now() - startedAt < durationMs) {
    await Promise.all(watchers.map(poll));
    if (durationMs === 0 || Date.now() - startedAt < durationMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  emit('watcher_stopped', { backend_ips: targets });
  for (const watcher of watchers) watcher.client.close();
}

for (const watcher of watchers) {
  watcher.client.waitForReady(Date.now() + 30_000, (error) => {
    if (error) {
      emit('channelz_unavailable', {
        backend_ip: watcher.backendIp,
        message: error.message,
      });
    }
  });
}

process.on('SIGINT', () => {
  for (const watcher of watchers) watcher.client.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  for (const watcher of watchers) watcher.client.close();
  process.exit(0);
});

await run();
