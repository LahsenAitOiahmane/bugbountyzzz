export function normalizeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function exactOrigin(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) throw new Error(`Invalid HTTP(S) origin: ${value}`);
  const url = new URL(normalized);
  if (url.pathname !== '/' || url.search) throw new Error(`Expected an origin without a path: ${value}`);
  return url.origin;
}

// A hostname-only seed is a convenience, never a wildcard scope expansion.
export function normalizeSeed(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  const candidate = /^[a-z\d.-]+(?::\d{1,5})?(?:[/?#]|$)/i.test(input) && !/^https?:/i.test(input)
    ? `https://${input}` : input;
  const url = normalizeUrl(candidate);
  if (!url) throw new Error('Seed must be an HTTP(S) URL or hostname without credentials');
  return url;
}

export class Scope {
  constructor(seed, { origins = [], assetOrigins = [], excludes = [] } = {}) {
    const url = normalizeSeed(seed);
    this.seed = url;
    this.primary = new URL(url).origin;
    this.origins = new Set([this.primary, ...origins.map(exactOrigin)]);
    this.assetOrigins = new Set([...this.origins, ...assetOrigins.map(exactOrigin)]);
    this.excludes = excludes.map(pattern => new RegExp(pattern, 'i'));
  }

  allows(value, role = 'asset') {
    const url = normalizeUrl(value);
    if (!url || this.excludes.some(re => re.test(url))) return false;
    return (role === 'page' ? this.origins : this.assetOrigins).has(new URL(url).origin);
  }

  describe() {
    return { pageOrigins: [...this.origins], assetOrigins: [...this.assetOrigins],
      excludes: this.excludes.map(re => re.source) };
  }
}

export class Budget {
  constructor({ delay = 500, maxRequests = 2000, duration = 300 } = {}) {
    this.delay = delay;
    this.maxRequests = maxRequests;
    this.deadline = Date.now() + duration * 1000;
    this.requests = 0;
    this.next = 0;
    this.tail = Promise.resolve();
    this.reason = null;
  }

  async take() {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (this.reason) throw new Error(this.reason);
      if (this.requests >= this.maxRequests) this.reason = 'request limit reached';
      const wait = Math.max(0, this.next - Date.now());
      if (Date.now() + wait >= this.deadline) this.reason = 'duration limit reached';
      if (this.reason) throw new Error(this.reason);
      // Timers may wake early. Recheck the wall clock so the configured spacing is
      // a lower bound rather than an approximate delay.
      while (Date.now() < this.next) await new Promise(resolve => setTimeout(resolve, this.next - Date.now()));
      this.requests++;
      this.next = Date.now() + this.delay;
      return { request: this.requests, startedAt: new Date().toISOString() };
    } finally { release(); }
  }
}
