import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchResponseSchema, searchResponseSchema } from '../src/api/schemas.js';
import { retryAfterMs } from '../src/api/client.js';
import { Scheduler } from '../src/lib/limit.js';
import { AppError } from '../src/lib/errors.js';
import { clientWith, json } from './helpers.js';

afterEach(() => vi.useRealTimers());
describe('HTTP error policy', () => {
  it.each([[400, 'INVALID_ARGUMENT'], [401, 'AUTH_FAILED'], [402, 'INSUFFICIENT_BALANCE'], [403, 'FETCH_FORBIDDEN'], [404, 'FETCH_NOT_FOUND'], [413, 'INVALID_ARGUMENT']])('does not retry HTTP %s', async (status, code) => {
    const transport = vi.fn(async () => json({ error: { message: 'sk-unit-test-secret-never-real' } }, status as number));
    const { client } = clientWith(transport);
    await expect(client.post('fetch', { url: 'https://example.com' }, fetchResponseSchema)).rejects.toMatchObject({ code, status });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([408, 429, 500, 502, 503, 504])('retries HTTP %s at most twice', async status => {
    const transport = vi.fn(async () => json({}, status, { 'Retry-After': '2' }));
    const { client, wait } = clientWith(transport);
    await expect(client.post('search', {}, searchResponseSchema)).rejects.toMatchObject({ status });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(call => call[0])).toEqual([2000, 2000]);
  });
  it('recovers after a retry and sends fixed auth and endpoint without redirects', async () => {
    const transport = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ results: [] }));
    const { client } = clientWith(transport);
    expect(await client.post('search', { query: 'a' }, searchResponseSchema)).toEqual({ results: [] });
    expect(transport.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/tools/search');
    expect(transport.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer sk-unit-test-secret-never-real', 'Content-Type': 'application/json' } });
  });
  it('bounds Retry-After seconds and HTTP dates', () => {
    expect(retryAfterMs('999999')).toBe(5000);
    expect(retryAfterMs('0.5')).toBe(500);
    expect(retryAfterMs('not a date')).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
    const now = Date.now();
    expect(retryAfterMs(new Date(now + 10000).toUTCString(), now)).toBe(5000);
  });
  it('rejects malformed JSON without retries', async () => {
    const transport = vi.fn(async () => new Response('<html>not JSON</html>'));
    const { client } = clientWith(transport);
    await expect(client.post('search', {}, searchResponseSchema)).rejects.toMatchObject({ code: 'UPSTREAM_SCHEMA_ERROR' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('enforces body size even if upstream omits Content-Length', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(25 * 1024 * 1024)); controller.close(); } });
    const { client } = clientWith(async () => new Response(stream));
    await expect(client.post('fetch', {}, fetchResponseSchema)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });
  it('times out hung connections, aborts and respects the overall deadline', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const transport = vi.fn(async (_url, options) => { signals.push(options.signal!); return new Promise<Response>(() => {}); });
    const { client } = clientWith(transport, { timeoutMs: 300 });
    const assertion = expect(client.post('search', {}, searchResponseSchema)).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.runAllTimersAsync();
    await assertion;
    expect(transport).toHaveBeenCalledTimes(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
  it('times out stalled response bodies', async () => {
    vi.useFakeTimers();
    const { client } = clientWith(async () => new Response(new ReadableStream()), { timeoutMs: 300 });
    const assertion = expect(client.post('fetch', {}, fetchResponseSchema)).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.runAllTimersAsync();
    await assertion;
  });
  it('cancels in-flight calls with no retry', async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    let requestSignal: AbortSignal | undefined;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const transport = vi.fn(async (_url, options) => {
      requestSignal = options.signal!;
      markStarted();
      return new Promise<Response>(() => {});
    });
    const { client } = clientWith(transport);
    const pending = client.post('search', {}, searchResponseSchema, controller.signal);
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
  });
  it('limits retry of network exceptions and never echoes their secrets', async () => {
    const transport = vi.fn(async () => { throw new Error('Authorization: Bearer secret sk-unit-test-secret-never-real'); });
    const { client } = clientWith(transport);
    const failure = await client.post('search', {}, searchResponseSchema).catch(error => error as AppError);
    expect(failure).toMatchObject({ code: 'NETWORK_ERROR' });
    expect((failure as AppError).message).not.toContain('secret');
    expect(transport).toHaveBeenCalledTimes(3);
  });
});

it('serializes requests and spaces start times, including cancelled queued calls', async () => {
  const scheduler = new Scheduler(20);
  const starts: number[] = [];
  const signal = new AbortController().signal;
  const job = () => scheduler.run(async () => { starts.push(Date.now()); await new Promise(resolve => setTimeout(resolve, 5)); }, signal);
  await Promise.all([job(), job(), job()]);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(18);
  expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(18);
});
