import { Cookie, CookieJar } from 'tough-cookie';
import { normalizeUrl } from './scope.mjs';

export class Transport {
  constructor(scope, budget, { headers = {}, researcher, onResponse, maxBytes = 20 * 1024 * 1024, timeout = 20000 } = {}) {
    this.scope = scope;
    this.budget = budget;
    this.headers = headers;
    this.researcher = researcher;
    this.onResponse = onResponse;
    this.maxBytes = maxBytes;
    this.timeout = timeout;
    this.jar = new CookieJar();
  }

  async seedCookies(cookies, replace = false) {
    if (replace) await this.jar.removeAllCookies();
    for (const c of cookies || []) {
      const domain = c.domain.replace(/^\./, '');
      const origin = `${c.secure ? 'https' : 'http'}://${domain}`;
      // Omit Domain for host-only cookies; setting it turns IP/localhost cookies
      // into invalid domain cookies under the public-suffix checks.
      const cookie = new Cookie({ key: c.name, value: c.value, domain: c.domain.startsWith('.') ? domain : undefined, path: c.path || '/',
        secure: !!c.secure, httpOnly: !!c.httpOnly, hostOnly: !c.domain.startsWith('.'),
        expires: c.expires > 0 ? new Date(c.expires * 1000) : 'Infinity' });
      await this.jar.setCookie(cookie, origin, { ignoreError: true });
    }
  }

  async get(value, role = 'asset') {
    let url = value;
    const redirects = [];
    for (let hop = 0; hop <= 10; hop++) {
      if (!this.scope.allows(url, role)) throw new Error(`Blocked ${role} URL outside scope: ${url}`);
      const ticket = await this.budget.take();
      const headers = { 'User-Agent': 'bugbountyzzz-js-collector/0.1', Accept: '*/*' };
      // Explicit session/attribution headers belong only to the seed origin.
      if (new URL(url).origin === this.scope.primary) Object.assign(headers, this.headers);
      if (this.researcher) headers['X-Intigriti-Username'] = this.researcher;
      const cookie = await this.jar.getCookieString(url);
      if (cookie && !Object.keys(headers).some(key => key.toLowerCase() === 'cookie')) headers.Cookie = cookie;
      const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(this.timeout) });
      this.onResponse?.({ ...ticket, url, method: 'GET', status: response.status, location: response.headers.get('location'),
        authenticationChallenge: response.headers.has('www-authenticate'), at: new Date().toISOString(), transport: 'http' });
      for (const cookie of response.headers.getSetCookie()) await this.jar.setCookie(cookie, url, { ignoreError: true });
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location')) {
        const next = normalizeUrl(response.headers.get('location'), url);
        await response.body?.cancel();
        if (!next) throw new Error('Invalid redirect URL');
        redirects.push({ from: url, to: next, status: response.status });
        url = next;
        continue;
      }
      const declared = Number(response.headers.get('content-length'));
      if (declared > this.maxBytes) {
        await response.body?.cancel();
        throw new Error(`Response exceeds per-file limit (${this.maxBytes} bytes)`);
      }
      const parts = [];
      let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { value: part, done } = await reader.read();
            if (done) break;
            size += part.length;
            if (size > this.maxBytes) throw new Error(`Decoded response exceeds per-file limit (${this.maxBytes} bytes)`);
            parts.push(part);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      }
      return { url, status: response.status, contentType: response.headers.get('content-type') || '',
        sourceMap: response.headers.get('sourcemap') || response.headers.get('x-sourcemap'),
        body: Buffer.concat(parts), redirects };
    }
    throw new Error('Redirect limit reached');
  }
}
