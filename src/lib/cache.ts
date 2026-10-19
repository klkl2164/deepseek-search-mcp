export class PageCache<T> {
  private entries = new Map<string, { value: T; expires: number; bytes: number }>();
  private bytes = 0;
  constructor(private ttlMs: number, private maxEntries: number, readonly maxBytes = 20 * 1024 * 1024, private now = Date.now) {}

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) { this.bytes -= entry.bytes; this.entries.delete(key); }
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.remove(key); return undefined; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, bytes: number): boolean {
    this.remove(key);
    if (bytes > this.maxBytes) return false;
    for (const [oldKey, entry] of this.entries) if (entry.expires <= this.now()) this.remove(oldKey);
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes, expires: this.now() + this.ttlMs });
    this.bytes += bytes;
    return true;
  }
}
