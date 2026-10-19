import { searchInputSchema, searchResponseSchema, type SearchInput } from './schemas.js';
import type { DeepSeekClient } from './client.js';
import { clip, codepoints } from '../lib/limit.js';

export class SearchService {
  constructor(private client: DeepSeekClient) {}
  async search(raw: SearchInput, signal?: AbortSignal) {
    const input = searchInputSchema.parse(raw);
    const response = await this.client.post('search', input, searchResponseSchema, signal);
    let truncated = response.results.length > input.count;
    let remaining = 12000;
    const bounded = (value: string, max: number) => {
      const result = clip(value, max);
      if (result !== value) truncated = true;
      return result;
    };
    const results = response.results.slice(0, input.count).map(({ content, ...result }) => {
      const normalized = { ...result, title: bounded(result.title, 500), snippet: bounded(result.snippet, 500), summary: bounded(result.summary, 1200), site_name: result.site_name === null ? null : bounded(result.site_name, 200) };
      if (!input.need_content || !content) return normalized;
      const excerpt = bounded(content, Math.min(2000, remaining));
      remaining -= codepoints(excerpt).length;
      return { ...normalized, content: excerpt };
    });
    return { query: input.query, count: results.length, results, cached: false, truncated, source_trust: 'untrusted_web_content' };
  }
}
