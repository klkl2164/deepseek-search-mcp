import { describe, expect, it, vi } from 'vitest';
import { FetchService } from '../src/api/fetch.js';
import { validatePublicUrl, isPublicIp } from '../src/lib/url-validation.js';
import { createLogger, safeError, sanitize } from '../src/lib/sanitize.js';
import { loadConfig } from '../src/config.js';
import { clientWith, config } from './helpers.js';

describe('URL security', () => {
  it.each([
    'file:///etc/passwd', 'ftp://example.com/a', 'data:text/plain,a', 'https://user:pass@example.com',
    'http://localhost', 'http://foo.localhost', 'http://box.local', 'http://127.0.0.1', 'http://127.1', 'http://2130706433',
    'http://0x7f000001', 'http://10.1.1.1', 'http://172.16.0.1', 'http://192.168.1.1', 'http://169.254.169.254',
    'http://100.100.100.200', 'http://0.0.0.0', 'http://224.0.0.1', 'http://198.18.0.1', 'http://192.0.2.1',
    'http://[::1]', 'http://[::]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'http://[fe80::1]',
    'http://[2001:db8::1]', 'http://[2002:7f00:1::]', 'http://[64:ff9b::7f00:1]', 'http://localhost.',
    'https://example.com/\npath', 'https://example.com\\@localhost/a', 'https://', 'not-a-url',
  ])('blocks %s before upstream HTTP', async url => {
    const transport = vi.fn();
    const { client } = clientWith(transport);
    await expect(new FetchService(client, config).fetch({ url })).rejects.toMatchObject({ code: 'UNSAFE_URL' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects DNS with any internal answer, including mixed A/AAAA', async () => {
    await expect(validatePublicUrl('https://example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }])).rejects.toMatchObject({ code: 'UNSAFE_URL' });
  });
  it('classifies resolver failure without echoing exception data', async () => {
    await expect(validatePublicUrl('https://example.com', async () => { throw new Error('sk-secret'); })).rejects.toMatchObject({ code: 'DNS_FAILED' });
  });
  it('permits global IPv4 and IPv6, retains query and removes fragment', async () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('2001:4860:4860::8888')).toBe(true);
    expect(await validatePublicUrl('https://example.com/a?q=1#b', async () => [{ address: '8.8.8.8', family: 4 }])).toBe('https://example.com/a?q=1');
  });
});

describe('configuration and secrets', () => {
  it('allows no key for discovery but refuses anonymous requests', async () => {
    const transport = vi.fn();
    const { client } = clientWith(transport, { apiKey: undefined });
    await expect(client.post('search', {}, { safeParse: () => ({ success: true }) } as never)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    expect(transport).not.toHaveBeenCalled();
    expect(loadConfig({}).apiKey).toBeUndefined();
  });
  it.each([
    { DEEPSEEK_MCP_TIMEOUT_MS: 'NaN' }, { DEEPSEEK_MCP_MAX_OUTPUT_CHARS: '1' },
    { DEEPSEEK_MCP_PROXY_URL: 'socks5://localhost:7890' }, { DEEPSEEK_MCP_LOG_LEVEL: 'verbose' },
    { DEEPSEEK_MCP_CACHE_MAX_ENTRIES: '0' }, { DEEPSEEK_API_KEY: 'key\nheader' },
  ])('rejects invalid configuration %j', env => expect(() => loadConfig(env)).toThrow());
  it('redacts keys, bearer tokens and proxy userinfo in stderr', () => {
    const write = vi.fn();
    const key = 'unit-test-private-key';
    const log = createLogger('warn', [key], write);
    log('info', key);
    expect(write).not.toHaveBeenCalled();
    log('error', `${key} Bearer token123 http://user:pass@127.0.0.1:7890 sk-anotherkey`);
    const line = write.mock.calls[0][0];
    expect(line).not.toContain(key);
    expect(line).not.toContain('token123');
    expect(line).not.toContain('user:pass');
    expect(line).not.toContain('sk-anotherkey');
    expect(safeError(new Error(key)).message).not.toContain(key);
    expect(sanitize(key, [key])).toBe('[REDACTED]');
  });
});
