import { AppError } from './errors.js';

export function sanitize(text: string, secrets: string[] = []): string {
  let result = text;
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]');
  return result.replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[REDACTED]@');
}

export function safeError(error: unknown): AppError {
  // External exception messages may contain URLs, credentials or headers. Never echo them.
  return error instanceof AppError ? error : new AppError('UPSTREAM_ERROR', '发生非预期内部错误，请检查本机服务配置。');
}

export function createLogger(level: string, secrets: string[] = [], write = (line: string) => console.error(line)) {
  const levels = ['error', 'warn', 'info', 'debug'];
  return (severity: string, message: string) => {
    if (levels.indexOf(severity) <= levels.indexOf(level)) write(sanitize(`[${severity}] ${message}`, secrets));
  };
}
