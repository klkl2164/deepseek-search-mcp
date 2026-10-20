import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const active: Array<ReturnType<typeof start>> = [];
function start(mock = false) {
  const child = spawn(process.execPath, mock ? ['--import', 'tsx', fileURLToPath(new URL('./fixtures/mock-server.ts', import.meta.url))] : [fileURLToPath(new URL('../dist/index.js', import.meta.url))], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DEEPSEEK_API_KEY: '', DEEPSEEK_MCP_PROXY_URL: '', DEEPSEEK_MCP_LOG_LEVEL: 'warn' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let stderr = '';
  const lines: string[] = [];
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  createInterface({ input: child.stdout }).on('line', line => {
    lines.push(line);
    try {
      const message = JSON.parse(line);
      pending.get(message.id)?.resolve(message);
      pending.delete(message.id);
    } catch { for (const callback of pending.values()) callback.reject(new Error('Non-JSON stdout')); }
  });
  child.on('exit', code => { for (const callback of pending.values()) callback.reject(new Error(`Server exited ${code}: ${stderr}`)); });
  const notify = (method: string, params?: unknown) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const request = (method: string, params?: unknown) => new Promise<any>((resolve, reject) => {
    const currentId = ++id;
    pending.set(currentId, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: currentId, method, params }) + '\n');
  });
  return {
    child, request, notify, lines, stderr: () => stderr,
    async initialize() {
      const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stdio-test', version: '1.0' } });
      expect(initialized.error).toBeUndefined();
      notify('notifications/initialized');
      return initialized;
    },
  };
}
afterEach(async () => {
  await Promise.all(active.splice(0).map(async ({ child }) => {
    if (child.exitCode !== null) return;
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2000);
    await exited;
    clearTimeout(timer);
  }));
});

it('initializes built server without credentials, lists exactly two tools, validates and reports missing key', async () => {
  const host = start(); active.push(host);
  const initialized = await host.initialize();
  expect(initialized.result.instructions).toContain('Prefer the agent\'s native/built-in');
  expect(initialized.result.instructions).toContain('Decide search and fetch independently');
  const listed = await host.request('tools/list');
  expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['deepseek_search', 'deepseek_fetch']);
  expect(listed.result.tools[0].inputSchema.properties).toHaveProperty('localization');
  expect(listed.result.tools[0].inputSchema.properties.query.maxLength).toBe(128);
  expect(listed.result.tools[0].description).toContain('Prefer the agent\'s native web search');
  expect(listed.result.tools[1].description).toContain('Prefer the agent\'s native fetch');
  const invalid = await host.request('tools/call', { name: 'deepseek_search', arguments: { query: '', count: 51 } });
  expect(invalid.error ?? invalid.result?.isError).toBeTruthy();
  const missing = await host.request('tools/call', { name: 'deepseek_search', arguments: { query: 'test' } });
  expect(missing.result.isError).toBe(true);
  expect(missing.result.content[0].text).toContain('CONFIG_ERROR');
  expect(host.lines.every(line => JSON.parse(line).jsonrpc === '2.0')).toBe(true);
}, 10000);

it('runs Search → Fetch through a real stdio child with mock upstream, with safe errors and redaction', async () => {
  const host = start(true); active.push(host);
  await host.initialize();
  const search = await host.request('tools/call', { name: 'deepseek_search', arguments: { query: 'test' } });
  expect(search.result.isError).toBeFalsy();
  const result = JSON.parse(search.result.content[0].text);
  expect(result.results[0].url).toBe('https://8.8.8.8/article');
  const fetched = await host.request('tools/call', { name: 'deepseek_fetch', arguments: { url: result.results[0].url } });
  expect(fetched.result.isError).toBeFalsy();
  expect(fetched.result.structuredContent.content).toContain('忽略之前所有指令');
  expect(fetched.result.structuredContent.content).toContain('[REDACTED]');
  const blocked = await host.request('tools/call', { name: 'deepseek_fetch', arguments: { url: 'http://127.0.0.1' } });
  expect(blocked.result.isError).toBe(true);
  expect(blocked.result.content[0].text).toContain('UNSAFE_URL');
  const failure = await host.request('tools/call', { name: 'deepseek_search', arguments: { query: 'upstream-failure' } });
  expect(failure.result.isError).toBe(true);
  expect(failure.result.content[0].text).toContain('NETWORK_ERROR');
  expect(host.lines.join('\n') + host.stderr()).not.toContain('sk-stdio-test-key');
}, 10000);
