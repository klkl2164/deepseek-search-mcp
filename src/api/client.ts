import { Agent, ProxyAgent, type Dispatcher } from 'undici';
import type { ZodType } from 'zod/v4';
import type { Config } from '../config.js';
import { AppError, abortError, httpError, throwIfAborted, withAbort } from '../lib/errors.js';
import { Scheduler, sleep } from '../lib/limit.js';

export type HttpTransport = (url: string, init: RequestInit & { dispatcher?: Dispatcher }) => Promise<Response>;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

/** Explicit Agent ignores ambient HTTP(S)_PROXY and NODE_USE_ENV_PROXY. */
export function createDispatcher(proxyUrl?: string): Dispatcher {
  return proxyUrl ? new ProxyAgent(proxyUrl) : new Agent();
}

export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (value === null || !value.trim()) return undefined;
  const milliseconds = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(milliseconds) ? Math.min(5000, Math.max(0, milliseconds)) : undefined;
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new AppError('RESPONSE_TOO_LARGE', 'DeepSeek 响应超过 24 MiB 上限。');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('UPSTREAM_SCHEMA_ERROR', 'DeepSeek 返回空响应。');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await withAbort(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new AppError('RESPONSE_TOO_LARGE', 'DeepSeek 响应超过 24 MiB 上限。');
      chunks.push(chunk.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new AppError('UPSTREAM_SCHEMA_ERROR', 'DeepSeek 返回无效 JSON。'); }
  } finally { void reader.cancel().catch(() => undefined); }
}

export class DeepSeekClient {
  private dispatcher?: Dispatcher;
  private scheduler: Scheduler;
  constructor(private config: Config, private options: {
    transport?: HttpTransport; scheduler?: Scheduler; random?: () => number;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
    dispatcher?: Dispatcher;
  } = {}) {
    this.dispatcher = options.dispatcher;
    this.scheduler = options.scheduler ?? new Scheduler();
  }

  assertConfigured() {
    if (!this.config.apiKey) throw new AppError('CONFIG_ERROR', '请在 MCP 进程环境设置 DEEPSEEK_API_KEY（DeepSeek 官方密钥）。');
  }

  async post<T>(endpoint: 'search' | 'fetch', body: object, schema: ZodType<T>, callerSignal?: AbortSignal): Promise<T> {
    this.assertConfigured();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new AppError('TIMEOUT', 'DeepSeek 请求超过总超时预算。')), this.config.timeoutMs);
    const signal = callerSignal ? AbortSignal.any([timeout.signal, callerSignal]) : timeout.signal;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        throwIfAborted(signal);
        let waitMs: number | undefined;
        try {
          return await this.scheduler.run(async () => {
            const attemptTimeout = new AbortController();
            const attemptTimer = setTimeout(() => attemptTimeout.abort(new AppError('TIMEOUT', 'DeepSeek 单次请求超时。')), Math.max(1, Math.floor(this.config.timeoutMs / 3)));
            const attemptSignal = AbortSignal.any([signal, attemptTimeout.signal]);
            try {
              this.dispatcher ??= createDispatcher(this.config.proxyUrl);
              const response = await withAbort((this.options.transport ?? globalThis.fetch)(`https://api.deepseek.com/v1/tools/${endpoint}`, {
                method: 'POST', redirect: 'error',
                headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: attemptSignal, dispatcher: this.dispatcher,
              }), attemptSignal);
              if (response.status !== 200) {
                waitMs = retryAfterMs(response.headers.get('retry-after'));
                // Do not expose upstream error text: it can echo credentials or arbitrary input.
                void response.body?.cancel().catch(() => undefined);
                throw httpError(response.status);
              }
              const parsed = schema.safeParse(await readJson(response, attemptSignal));
              if (!parsed.success) throw new AppError('UPSTREAM_SCHEMA_ERROR', 'DeepSeek 成功响应不符合官方 schema。');
              return parsed.data;
            } finally { clearTimeout(attemptTimer); }
          }, signal);
        } catch (error) {
          if (signal.aborted) throw abortError(signal);
          const classified = error instanceof AppError ? error : new AppError(this.config.proxyUrl ? 'PROXY_ERROR' : 'NETWORK_ERROR', this.config.proxyUrl ? '无法通过 MCP 独立代理连接 DeepSeek。' : '无法连接 DeepSeek API。');
          const retryable = classified.status !== undefined ? [408, 429, 500, 502, 503, 504].includes(classified.status) : ['NETWORK_ERROR', 'PROXY_ERROR', 'TIMEOUT'].includes(classified.code);
          if (!retryable || attempt === 2) throw classified;
          const backoff = [500, 1500][attempt] + Math.floor((this.options.random ?? Math.random)() * 200);
          await (this.options.wait ?? sleep)(Math.max(backoff, waitMs ?? 0), signal);
        }
      }
      throw new AppError('UPSTREAM_ERROR', 'DeepSeek 请求失败。');
    } finally { clearTimeout(timer); }
  }
  async close() { await this.dispatcher?.close(); }
}
