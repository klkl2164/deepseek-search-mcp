import { afterEach, vi } from 'vitest';
import { DeepSeekClient, type HttpTransport } from '../src/api/client.js';
import { loadConfig } from '../src/config.js';
import { Scheduler } from '../src/lib/limit.js';

export const config = loadConfig({ DEEPSEEK_API_KEY: 'sk-unit-test-secret-never-real' });
export const result = {
  title: '测试标题', url: 'https://example.com/article', snippet: '摘要', summary: '长摘要', content: '',
  date: null, site_name: 'Example', site_icon: null, rerank_score: 2.1, authority: 3,
};
export const json = (body: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
const clients: DeepSeekClient[] = [];
export function clientWith(transport: HttpTransport, overrides: Partial<typeof config> = {}, wait = vi.fn(async (_ms: number, _signal: AbortSignal) => {})) {
  const client = new DeepSeekClient({ ...config, ...overrides }, { transport, scheduler: new Scheduler(0), random: () => 0, wait });
  clients.push(client);
  return { client, wait };
}
afterEach(async () => { await Promise.all(clients.splice(0).map(client => client.close())); });
