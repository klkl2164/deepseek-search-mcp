import { AppError } from './lib/errors.js';

export interface Config {
  apiKey?: string;
  timeoutMs: number;
  maxOutputChars: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  proxyUrl?: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new AppError('CONFIG_ERROR', `${name} 必须是 ${min}～${max} 的整数。`);
    }
    return value;
  };
  const apiKey = env.DEEPSEEK_API_KEY?.trim() || undefined;
  if (apiKey && /\s|[\x00-\x1f\x7f]/.test(apiKey)) throw new AppError('CONFIG_ERROR', 'DEEPSEEK_API_KEY 格式无效。');
  const proxyUrl = env.DEEPSEEK_MCP_PROXY_URL?.trim() || undefined;
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hash || url.search || url.pathname !== '/') throw new Error();
    } catch { throw new AppError('CONFIG_ERROR', 'DEEPSEEK_MCP_PROXY_URL 必须是有效 HTTP/HTTPS 代理地址。'); }
  }
  const logLevel = env.DEEPSEEK_MCP_LOG_LEVEL ?? 'warn';
  if (!['error', 'warn', 'info', 'debug'].includes(logLevel)) throw new AppError('CONFIG_ERROR', 'DEEPSEEK_MCP_LOG_LEVEL 无效。');
  return {
    apiKey, proxyUrl, logLevel,
    timeoutMs: integer('DEEPSEEK_MCP_TIMEOUT_MS', 30000, 1, 300000),
    maxOutputChars: integer('DEEPSEEK_MCP_MAX_OUTPUT_CHARS', 12000, 1000, 30000),
    cacheTtlMs: integer('DEEPSEEK_MCP_CACHE_TTL_MS', 600000, 1, 86400000),
    cacheMaxEntries: integer('DEEPSEEK_MCP_CACHE_MAX_ENTRIES', 50, 1, 1000),
  };
}
