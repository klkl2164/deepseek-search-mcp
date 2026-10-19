import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '../src/api/search.js';
import { clientWith, json, result } from './helpers.js';

describe('search', () => {
  it('maps official fields, default values and exact operators', async () => {
    const transport = vi.fn(async () => json({ results: [result, { ...result, url: 'https://example.org/b' }] }));
    const { client } = clientWith(transport);
    const output = await new SearchService(client).search({ query: '  site:github.com "DeepSeek" after:2026  ', localization: '8.8.8.8', ori_question: ' 搜索官方资料 ' });
    expect(output.count).toBe(2);
    const { content: _content, ...expected } = result;
    expect(output.results[0]).toEqual(expected);
    expect(output.results[1].url).toBe('https://example.org/b');
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/tools/search');
    expect(JSON.parse(options.body as string)).toEqual({ query: 'site:github.com "DeepSeek" after:2026', count: 5, need_content: false, localization: '8.8.8.8', ori_question: '搜索官方资料' });
    expect(options.headers).toHaveProperty('Authorization');
  });
  it('treats empty search as success and never caches searches', async () => {
    const transport = vi.fn(async () => json({ results: [] }));
    const { client } = clientWith(transport);
    const service = new SearchService(client);
    expect(await service.search({ query: 'none' })).toMatchObject({ results: [], count: 0, cached: false });
    await service.search({ query: 'none' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([{ query: '' }, { query: ' ' }, { query: '😀'.repeat(129) }, { query: 'a', count: 51 }, { query: 'a', count: 0 }, { query: 'a', count: 1.5 }, { query: 'a', ori_question: '' }, { query: 'a', localization: 'example.com' }])('rejects bad input before HTTP: %j', async input => {
    const transport = vi.fn();
    const { client } = clientWith(transport);
    await expect(new SearchService(client).search(input)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('accepts 128 Unicode code points and IPv6 localization', async () => {
    const { client } = clientWith(async () => json({ results: [] }));
    expect((await new SearchService(client).search({ query: '😀'.repeat(128), localization: '2001:4860:4860::8888' })).query).toBe('😀'.repeat(128));
  });
  it('omits unsolicited body; caps individual and total requested bodies', async () => {
    const { client } = clientWith(async () => json({ results: Array.from({ length: 50 }, () => ({ ...result, content: '😀'.repeat(4000) })) }));
    const service = new SearchService(client);
    const noContent = await service.search({ query: 'test', count: 50 });
    expect(noContent.results.every(item => !('content' in item))).toBe(true);
    const withContent = await service.search({ query: 'test', count: 50, need_content: true });
    const lengths = withContent.results.map(item => 'content' in item ? Array.from(item.content).length : 0);
    expect(Math.max(...lengths)).toBe(2000);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(12000);
    expect(withContent.truncated).toBe(true);
  });
  it.each([{ results: [{}] }, { results: [{ ...result, date: 'not-a-date' }] }, { results: [{ ...result, authority: 8 }] }, { results: null }])('rejects invalid upstream schema: %j', async body => {
    const { client } = clientWith(async () => json(body));
    await expect(new SearchService(client).search({ query: 'test' })).rejects.toMatchObject({ code: 'UPSTREAM_SCHEMA_ERROR' });
  });
});
