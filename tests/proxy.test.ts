import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { Agent, ProxyAgent, MockAgent } from 'undici';
import { createDispatcher, DeepSeekClient } from '../src/api/client.js';
import { searchResponseSchema } from '../src/api/schemas.js';
import { Scheduler } from '../src/lib/limit.js';
import { config } from './helpers.js';

it('constructs an explicit direct Agent without reading ambient proxy variables', async () => {
  const direct = createDispatcher();
  const proxy = createDispatcher('http://127.0.0.1:7890');
  expect(direct).toBeInstanceOf(Agent);
  expect(proxy).toBeInstanceOf(ProxyAgent);
  await Promise.all([direct.close(), proxy.close()]);
});

it('uses the injected dispatcher with native fetch without accessing the network', async () => {
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  dispatcher.get('https://api.deepseek.com').intercept({ path: '/v1/tools/search', method: 'POST', body: JSON.stringify({ query: 'test' }) }).reply(200, { results: [] });
  const client = new DeepSeekClient(config, { dispatcher, scheduler: new Scheduler(0) });
  try {
    expect(await client.post('search', { query: 'test' }, searchResponseSchema)).toEqual({ results: [] });
    dispatcher.assertNoPendingInterceptors();
  } finally { await client.close(); }
});

it('routes official-host connections exclusively to the configured local proxy', async () => {
  const connections: string[] = [];
  const proxy = createServer();
  proxy.on('connect', (request, socket) => {
    connections.push(request.url ?? '');
    expect(request.headers.authorization).toBeUndefined();
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const port = (proxy.address() as AddressInfo).port;
  const client = new DeepSeekClient({ ...config, proxyUrl: `http://127.0.0.1:${port}` }, { scheduler: new Scheduler(0), wait: async () => {} });
  try {
    await expect(client.post('search', {}, searchResponseSchema)).rejects.toMatchObject({ code: 'PROXY_ERROR' });
    expect(connections).toEqual(Array(3).fill('api.deepseek.com:443'));
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
  }
});
