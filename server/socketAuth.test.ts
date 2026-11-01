import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';
import { createSocketAuthGuard } from './socketAuth';

test('socket connections require the service token when API auth is enabled', async () => {
  const http = createServer();
  const io = new Server(http);
  io.use(createSocketAuthGuard('test-service-token'));
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as { port: number };
  const connect = (token?: string) => new Promise<string>((resolve) => {
    const socket = client(`http://127.0.0.1:${port}`, { auth: { apiToken: token }, reconnection: false, timeout: 2000 });
    socket.on('connect', () => { socket.disconnect(); resolve('connected'); });
    socket.on('connect_error', err => { socket.disconnect(); resolve(err.message); });
  });
  try {
    assert.equal(await connect(), 'Unauthorized');
    assert.equal(await connect('wrong-token'), 'Unauthorized');
    assert.equal(await connect('test-service-token'), 'connected');
  } finally {
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});
