export type ErrorCode = 'CONFIG_ERROR' | 'INVALID_ARGUMENT' | 'UNSAFE_URL' | 'DNS_FAILED' | 'AUTH_FAILED' | 'INSUFFICIENT_BALANCE' | 'FETCH_FORBIDDEN' | 'FETCH_NOT_FOUND' | 'RATE_LIMITED' | 'TIMEOUT' | 'CANCELLED' | 'PROXY_ERROR' | 'NETWORK_ERROR' | 'UPSTREAM_ERROR' | 'UPSTREAM_SCHEMA_ERROR' | 'RESPONSE_TOO_LARGE';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'AppError';
  }
}

export function abortError(signal: AbortSignal): AppError {
  return signal.reason instanceof AppError ? signal.reason : new AppError('CANCELLED', '请求已取消。');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

export function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function httpError(status: number): AppError {
  const mapping: Partial<Record<number, [ErrorCode, string]>> = {
    400: ['INVALID_ARGUMENT', 'DeepSeek 拒绝请求参数。'],
    401: ['AUTH_FAILED', 'DeepSeek 官方 API Key 无效或未授权。'],
    402: ['INSUFFICIENT_BALANCE', 'DeepSeek 账户余额不足，请充值后重试。'],
    403: ['FETCH_FORBIDDEN', 'DeepSeek 安全策略拒绝访问目标页面。'],
    404: ['FETCH_NOT_FOUND', 'DeepSeek 无法取得可用的网页正文。'],
    408: ['TIMEOUT', 'DeepSeek 请求超时。'],
    413: ['INVALID_ARGUMENT', 'DeepSeek 拒绝过大的请求。'],
    429: ['RATE_LIMITED', 'DeepSeek 限速，请稍后重试。'],
  };
  const [code, message] = mapping[status] ?? ['UPSTREAM_ERROR', 'DeepSeek 服务请求失败。'];
  return new AppError(code, `${message} (HTTP ${status})`, status);
}
