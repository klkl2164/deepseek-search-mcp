import { fetchInputSchema, fetchResponseSchema, type FetchInput, type FetchParams, type Page } from './schemas.js';
import type { DeepSeekClient } from './client.js';
import type { Config } from '../config.js';
import { PageCache } from '../lib/cache.js';
import { AppError, throwIfAborted, withAbort } from '../lib/errors.js';
import { clip, paginate } from '../lib/limit.js';
import { validatePublicUrl, normalizeUrl, type Resolver } from '../lib/url-validation.js';

export class FetchService {
  private cache: PageCache<Page>;
  private pending = new Map<string, Promise<void>>();
  constructor(private client: DeepSeekClient, private config: Config, private resolver?: Resolver, cache?: PageCache<Page>) {
    this.cache = cache ?? new PageCache(config.cacheTtlMs, config.cacheMaxEntries);
  }
  async fetch(raw: FetchInput, signal?: AbortSignal) {
    const input = fetchInputSchema(this.config.maxOutputChars).parse(raw);
    throwIfAborted(signal);
    const url = normalizeUrl(input.url).href;
    // Serialize per URL and recheck cache after the first request completes.
    // Each caller retains its own cancellation; one caller cannot cancel another.
    const previous = this.pending.get(url) ?? Promise.resolve();
    const task = previous.then(() => this.getPage(input, url, signal));
    const settled = task.then(() => {}, () => {});
    this.pending.set(url, settled);
    void settled.then(() => { if (this.pending.get(url) === settled) this.pending.delete(url); });
    return signal ? withAbort(task, signal) : task;
  }
  private async getPage(input: FetchParams, url: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    let page = this.cache.get(url);
    const cached = page !== undefined;
    if (!page) {
      this.client.assertConfigured();
      await validatePublicUrl(url, this.resolver, signal);
      page = await this.client.post('fetch', { url }, fetchResponseSchema, signal);
      if (!page.content.trim()) throw new AppError('FETCH_NOT_FOUND', 'DeepSeek 返回空网页正文。');
      const bytes = Math.max(2 * (page.title.length + page.content.length), Buffer.byteLength(page.title, 'utf8') + Buffer.byteLength(page.content, 'utf8'));
      if (!this.cache.set(url, page, bytes)) throw new AppError('RESPONSE_TOO_LARGE', '网页超过 20 MiB 完整正文缓存上限。');
    }
    const { content, total, returned } = paginate(page.content, input.offset, input.max_chars);
    const hasMore = input.offset + returned < total;
    return {
      url, title: clip(page.title, 500), content, offset: input.offset, returned_chars: returned,
      total_chars: total, has_more: hasMore, next_offset: hasMore ? input.offset + returned : null,
      cached, source_trust: 'untrusted_web_content',
    };
  }
}
