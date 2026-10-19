import { setTimeout as delay } from 'node:timers/promises';
import { abortError, throwIfAborted, withAbort } from './errors.js';

export const codepoints = (value: string) => Array.from(value);
export function clip(value: string, max: number): string {
  const chars: string[] = [];
  for (const char of value) {
    if (chars.length >= max) break;
    chars.push(char);
  }
  return chars.join('');
}

export function paginate(value: string, offset: number, max: number) {
  let total = 0;
  const chars: string[] = [];
  for (const char of value) {
    if (total >= offset && chars.length < max) chars.push(char);
    total++;
  }
  return { content: chars.join(''), total, returned: chars.length };
}

export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  try { await delay(ms, undefined, { signal }); }
  catch { throw abortError(signal); }
}

/** One in-flight HTTP request; at least 300 ms between starts, including retries. */
export class Scheduler {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  constructor(private readonly intervalMs = 300) {}

  run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const next = this.tail.catch(() => undefined).then(async () => {
      throwIfAborted(signal);
      const wait = this.intervalMs - (Date.now() - this.lastStart);
      if (wait > 0) await sleep(wait, signal);
      throwIfAborted(signal);
      this.lastStart = Date.now();
      return job();
    });
    this.tail = next.catch(() => undefined);
    return withAbort(next, signal);
  }
}
