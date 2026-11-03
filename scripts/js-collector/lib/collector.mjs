import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Scope, Budget, normalizeUrl } from './scope.mjs';
import { Store, hash } from './store.mjs';
import { Transport } from './transport.mjs';
import { extractHtml, extractJs, isJsUrl } from './extract.mjs';
import { AuthGate, authKind } from './auth.mjs';
import { buildInventory, writeInventory } from './inventory.mjs';
import { assessScopeDependencies } from './scope-dependencies.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const JS_TYPE = /(?:javascript|ecmascript)/i;
const HTML_TYPE = /(?:text\/html|application\/xhtml\+xml)/i;

export const defaults = {
  mode: 'hybrid', depth: 2, maxPages: 25, maxAssets: 1000, maxRequests: 2000,
  maxBytes: 20 * 1024 * 1024, maxTotalBytes: 200 * 1024 * 1024,
  maxSources: 5000, delay: 500, timeout: 20000, settle: 1500, duration: 300,
  sourceMaps: true, headed: false, manualSeconds: 0, origins: [], assetOrigins: [], excludes: [], postUrls: [],
  authPolicy: 'stop', authPaths: []
};

export class Collector {
  constructor(options) {
    this.options = { ...defaults, ...options };
    this.scope = new Scope(options.url, this.options);
    this.auth = new AuthGate(this.scope, this.options.authPolicy);
    if (!this.scope.allows(this.scope.seed, 'page')) throw new Error('Seed is excluded by scope rules');
    this.budget = new Budget(this.options);
    this.store = new Store(options.out, this.options);
    this.transport = new Transport(this.scope, this.budget, { ...this.options, onResponse: event => {
      if (this.network.length < 10000) this.network.push({ ...event, pageUrl: this.httpRecord?.kind === 'page' ? this.httpRecord.url : null,
        resourceType: this.httpRecord?.kind || 'asset' });
      if (this.httpRecord?.kind === 'page' && event.location) {
        const next = normalizeUrl(event.location, event.url);
        if (next) { this.auth.redirect(event.url, next); this.edge(event.url, next, 'http-redirect'); }
      }
      if (!this.bootstrapping) this.auth.challenge(event.url, this.httpRecord?.url || event.url, event.status, event.authenticationChallenge);
    } });
    this.assets = new Map();
    this.pages = new Map();
    this.inline = new Map();
    this.edges = [];
    this.edgeKeys = new Set();
    this.skipped = new Map();
    this.warnings = new Set();
    this.pending = new Set();
    this.started = new Date().toISOString();
    this.moduleContexts = new Map();
    this.sourceCount = 0;
    this.stopping = false;
    this.pendingNavigation = null;
    this.sessionEvents = [];
    this.postUrls = this.options.postUrls.map(pattern => new RegExp(pattern));
    this.network = [];
    this.inflightBrowser = new Set();
    this.calls = new Map();
    this.browserErrors = [];
  }

  skip(url, reason, parent = null) {
    if (this.skipped.size < 10000) this.skipped.set(`${url}:${reason}`, { url, reason, parent });
  }

  edge(parent, target, via) {
    const key = JSON.stringify([parent, target, via]);
    if (this.edgeKeys.has(key)) return;
    if (this.edges.length >= 50000) { this.warnings.add('Discovery graph limit reached'); return; }
    this.edgeKeys.add(key);
    this.edges.push({ parent, target, via });
  }

  enqueue(value, parent, via, kind = 'script', depth = 0) {
    const url = normalizeUrl(value, parent || this.scope.seed);
    if (!url) return null;
    this.edge(parent, url, via);
    const role = kind === 'page' ? 'page' : 'asset';
    if (!this.scope.allows(url, role)) { this.skip(url, 'outside-scope', parent); return null; }
    const records = kind === 'page' ? this.pages : this.assets;
    if (records.has(url)) return records.get(url);
    if (this.options.strictAssets && role === 'asset' &&
        ['js-string', 'js-literal', 'json-string'].includes(via)) {
      this.skip(url, 'unverified-script-reference', parent); return null;
    }
    if (kind === 'page' && depth > this.options.depth) { this.skip(url, 'depth-limit', parent); return null; }
    if (records.size >= (kind === 'page' ? this.options.maxPages : this.options.maxAssets)) {
      this.skip(url, `${kind === 'page' ? 'page' : 'asset'}-limit`, parent); return null;
    }
    const record = { id: url, url, kind, depth, state: 'queued', discoveredBy: via, parent };
    records.set(url, record);
    return record;
  }

  async processHtml(html, url, depth, recordOverride = null) {
    const result = extractHtml(html, url);
    const pageRecord = this.pages.get(url) || recordOverride;
    if (pageRecord) {
      pageRecord.signals = result.signals;
      pageRecord.baseUrl = result.base;
      pageRecord.scriptReferences = result.scripts.slice(0, 5000).map(item => {
        const target = normalizeUrl(item.value, result.base);
        return target ? { url: target, via: item.via, inScope: this.scope.allows(target, 'asset') } : null;
      }).filter(Boolean);
      if (result.scripts.length > 5000) this.warnings.add('Page script-reference metadata limit reached (5000)');
      pageRecord.links = result.linkDetails.map(link => ({ ...link, inScope: this.scope.allows(link.url, 'page'),
        authHint: authKind(link.url) || (/\b(?:log\s*in|sign\s*in|inloggen|aanmelden)\b/i.test(link.text) ? 'login-link' : null) }));
      if (!this.bootstrapping) this.auth.page(pageRecord, result.signals);
    }
    const nextScript = result.scripts.map(item => normalizeUrl(item.value, result.base)).find(value => value?.includes('/_next/'));
    const context = {
      importMap: Object.fromEntries(Object.entries(result.importMap).map(([key, value]) => [key, typeof value === 'string' ? normalizeUrl(value, result.base) : null])),
      publicPath: nextScript ? nextScript.slice(0, nextScript.indexOf('/_next/') + 7) : undefined
    };
    this.moduleContexts.set(url, context);
    for (const item of result.scripts) {
      const target = normalizeUrl(item.value, result.base);
      if (target) this.moduleContexts.set(target, context);
      this.enqueue(target, url, item.via);
    }
    for (const value of result.manifests) this.enqueue(value, url, 'next-build-manifest');
    const prioritized = [...result.linkDetails].sort((a, b) => Number(!!authKind(b.url)) - Number(!!authKind(a.url)));
    for (const link of prioritized) this.enqueue(link.url, url, 'page-link', 'page', depth + 1);
    for (const item of result.inline) {
      const id = `${url}#${item.kind}-${hash(item.content).slice(0, 24)}`;
      if (this.inline.has(id)) continue;
      if (this.inline.size >= this.options.maxAssets) { this.warnings.add('Inline-script limit reached'); break; }
      const record = { id, url, kind: item.kind, type: item.type, parent: url, state: 'saved' };
      this.inline.set(id, record);
      this.edge(url, id, item.kind);
      try {
        await this.store.save(record, Buffer.from(item.content), item.kind, item.kind === 'inline-data' ? /json|importmap/.test(item.type) ? 'json' : 'txt' : 'js');
        await this.processJs(item.content, result.base, record, context);
      } catch (error) { record.state = 'error'; record.error = error.message; }
    }
  }

  async processJs(source, url, record, context = this.moduleContexts.get(url) || {}) {
    const result = extractJs(source, url, { ...context, parseAst: record.kind !== 'inline-data' });
    if (result.warnings.length) record.parseWarnings = result.warnings;
    for (const call of result.calls || []) {
      if (this.calls.size >= 10000) { this.warnings.add('Static call-reference limit reached'); break; }
      const key = JSON.stringify([record.id, call.rawUrl, call.method, call.start]);
      this.calls.set(key, { ...call, sourceId: record.id, sourcePath: record.path || null,
        inScope: call.url ? this.scope.allows(call.url, 'page') : null });
      if (call.url) this.edge(record.id, call.url, `inferred-call:${call.method}`);
    }
    for (const item of result.references) {
      if (!this.moduleContexts.has(item.url)) this.moduleContexts.set(item.url, context);
      this.enqueue(item.url, record.id, item.via);
    }
    if (this.options.sourceMaps) {
      for (const value of result.maps) {
        if (value.startsWith('data:')) await this.inlineMap(value, url, record);
        else this.enqueue(normalizeUrl(value, url), record.id, 'source-map-comment', 'map');
      }
    }
  }

  async inlineMap(value, url, parent) {
    const match = /^data:application\/json(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(value);
    if (!match || value.length > this.options.maxBytes * 2) {
      this.warnings.add('Unsupported or oversized inline source map'); return;
    }
    try {
      const body = match[1] ? Buffer.from(match[2], 'base64') : Buffer.from(decodeURIComponent(match[2]));
      if (body.length > this.options.maxBytes) throw new Error('Inline source map exceeds per-file limit');
      const id = `${parent.id}#map-${hash(body).slice(0, 16)}`;
      if (this.inline.has(id)) return;
      if (this.inline.size >= this.options.maxAssets) throw new Error('Inline-script limit reached');
      const record = { id, url, parent: parent.id, kind: 'map', state: 'saved', discoveredBy: 'inline-source-map' };
      this.inline.set(id, record);
      this.edge(parent.id, id, 'inline-source-map');
      await this.store.save(record, body, 'maps', 'map');
      await this.processMap(body.toString(), url, record);
    } catch (error) { this.warnings.add(`Inline map: ${error.message}`); }
  }

  async processMap(source, url, record) {
    let map;
    try { map = JSON.parse(source); } catch { record.parseWarnings = ['Invalid source-map JSON']; return; }
    if (map.version !== 3) { record.parseWarnings = ['Unsupported source-map version']; return; }
    record.sources = [];
    const visit = async (part, section = 'root', level = 0) => {
      if (!part || typeof part !== 'object' || level > 20) return;
      if (Array.isArray(part.sections)) {
        for (const [i, item] of part.sections.entries()) {
          if (item.url) this.enqueue(normalizeUrl(item.url, url), url, 'source-map-section', 'map');
          if (item.map) await visit(item.map, `${section}-${i}`, level + 1);
        }
      }
      if (!Array.isArray(part.sources)) return;
      for (const [index, name] of part.sources.entries()) {
        if (this.sourceCount >= this.options.maxSources) { this.warnings.add('Source-map source limit reached'); break; }
        this.sourceCount++;
        const content = Array.isArray(part.sourcesContent) ? part.sourcesContent[index] : null;
        const item = { name, sourceRoot: part.sourceRoot || '', embedded: typeof content === 'string' };
        record.sources.push(item);
        if (typeof content !== 'string') continue;
        const body = Buffer.from(content);
        if (body.length > this.options.maxBytes) { item.error = 'Source exceeds per-file limit'; continue; }
        // Remote names are metadata, never filesystem paths or network requests.
        const file = { id: `${record.id}#source-${section}-${index}`, url };
        try {
          await this.store.save(file, body, 'sources', /\.[cm]?[jt]sx?$/.test(String(name)) ? String(name).split('.').pop() : 'txt');
          Object.assign(item, { path: file.path, sha256: file.sha256, bytes: file.bytes });
        } catch (error) { item.error = error.message; }
      }
    };
    await visit(map);
  }

  async accept(record, result, via) {
    record.status = result.status;
    record.contentType = result.contentType;
    record.fetchedAt = new Date().toISOString();
    record.finalUrl = result.url;
    record.redirects = result.redirects || [];
    for (const hop of record.redirects) this.edge(hop.from, hop.to, 'http-redirect');
    record.transport = via;
    if (result.status < 200 || result.status >= 300) {
      record.state = 'http-error'; return;
    }
    if (result.body.length > this.options.maxBytes) throw new Error('Response exceeds per-file limit');
    const text = result.body.toString('utf8');
    if (record.kind === 'page') {
      if (!HTML_TYPE.test(result.contentType) && !/^\s*(?:<!doctype html|<html)/i.test(text)) {
        record.state = 'not-html'; return;
      }
      await this.store.save(record, result.body, 'pages', 'html');
      record.state = 'saved';
      await this.processHtml(text, result.url, record.depth, record);
      return;
    }
    if (record.kind === 'map') {
      // A common catch-all route returns an HTML login page with status 200.
      if (HTML_TYPE.test(result.contentType) || /^\s*</.test(text)) { record.state = 'not-map'; return; }
      await this.store.save(record, result.body, 'maps', 'map');
      record.state = 'saved';
      await this.processMap(text, result.url, record);
      return;
    }
    if (HTML_TYPE.test(result.contentType) || /^\s*(?:<!doctype html|<html)/i.test(text)) {
      record.state = 'not-javascript'; return;
    }
    await this.store.save(record, result.body, 'scripts', 'js');
    record.state = 'saved';
    if (result.sourceMap && this.options.sourceMaps) this.enqueue(normalizeUrl(result.sourceMap, result.url), result.url, 'source-map-header', 'map');
    await this.processJs(text, result.url, record);
  }

  track(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise)).catch(() => {});
  }

  async drain() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  async startBrowser() {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: !(this.options.headed || this.options.manualSeconds),
      args: ['--disable-background-networking', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
    this.context = await this.browser.newContext({ serviceWorkers: 'block', acceptDownloads: false,
      storageState: this.options.storageState });
    this.context.setDefaultTimeout(this.options.timeout);
    await this.context.routeWebSocket('**/*', socket => socket.close());
    await this.context.route('**/*', async route => {
      const request = route.request();
      const url = request.url();
      const type = request.resourceType();
      const requestHeaders = request.headers();
      const speculative = /prefetch/i.test(`${requestHeaders['sec-purpose'] || ''} ${requestHeaders.purpose || ''}`);
      let pageUrl = this.activePageUrl || this.scope.seed;
      try { const frameUrl = request.frame().url(); if (normalizeUrl(frameUrl)) pageUrl = frameUrl; } catch { /* worker */ }
      if (request.isNavigationRequest()) pageUrl = url;
      const role = request.isNavigationRequest() || ['fetch', 'xhr', 'eventsource'].includes(type) ? 'page' : 'asset';
      const block = !this.scope.allows(url, role) ? 'outside-scope' :
        speculative ? 'speculative-prefetch-deferred' :
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
          !(request.method() === 'POST' && this.postUrls.some(re => re.test(url))) ? 'non-read-method' :
        ['image', 'media', 'font', 'eventsource'].includes(type) ? 'unneeded-resource' :
        !this.bootstrapping && this.auth.paused && ['fetch', 'xhr'].includes(type) ? 'authentication-handoff-pending' :
        !this.bootstrapping && !this.options.manualSeconds && this.auth.paused && request.isNavigationRequest() &&
          !this.auth.navigationUrls.has(url) && !authKind(url) ? 'authentication-handoff-pending' :
        this.stopping ? 'collector-stopping' : null;
      if (block) { this.skip(url, block); await route.abort().catch(() => {}); return; }
      this.inflightBrowser.add(request);
      try {
        const ticket = await this.budget.take();
        const headers = { ...request.headers() };
        if (new URL(url).origin === this.scope.primary) Object.assign(headers, this.options.headers || {});
        if (this.options.researcher) headers['x-intigriti-username'] = this.options.researcher;
        // route.continue() can let a redirect chain escape interception. Fetch
        // one hop explicitly and schedule redirects as separately scoped URLs.
        const response = await route.fetch({ headers, maxRedirects: 0, timeout: this.options.timeout });
        const status = response.status();
        const responseHeaders = response.headers();
        if (this.network.length < 10000) this.network.push({ ...ticket, url, method: request.method(), status,
          pageUrl, resourceType: type, at: new Date().toISOString(), transport: 'browser' });
        if (['fetch', 'xhr'].includes(type)) this.edge(pageUrl, url, `observed-call:${request.method()}`);
        if (!this.bootstrapping) this.auth.challenge(url, pageUrl, status, !!responseHeaders['www-authenticate']);
        if ([301, 302, 303, 307, 308].includes(status) && responseHeaders.location) {
          const next = normalizeUrl(responseHeaders.location, url);
          const kind = request.isNavigationRequest() ? 'page' : 'script';
          const record = this.bootstrapping ? null : this.enqueue(url, null, 'browser-redirect', kind, this.currentDepth || 0);
          if (record) Object.assign(record, { state: 'redirect', status, finalUrl: next });
          if (next) {
            this.edge(url, next, 'browser-redirect');
            if (!this.bootstrapping && request.isNavigationRequest()) this.auth.redirect(url, next);
            if (!this.scope.allows(next, kind === 'page' ? 'page' : 'asset')) this.skip(next, 'outside-scope', url);
            else if (request.isNavigationRequest()) {
              if ([307, 308].includes(status) && request.method() !== 'GET') {
                this.skip(next, 'post-preserving-redirect-requires-manual-session', url);
              } else this.pendingNavigation = { from: url, url: next, status };
            } else this.enqueue(next, url, 'browser-redirect', kind, this.currentDepth || 0);
          }
          // ERR_ABORTED cancels this hop without launching a competing Chromium
          // error-page navigation while the next scoped hop is started.
          await route.abort('aborted').catch(() => {});
        } else if (Number(responseHeaders['content-length']) > this.options.maxBytes) {
          this.skip(url, 'response-size-limit');
          await route.abort().catch(() => {});
        } else {
          const body = await response.body();
          if (body.length > this.options.maxBytes) {
            this.skip(url, 'response-size-limit');
            await route.abort().catch(() => {});
          } else await route.fulfill({ response });
        }
        await response.dispose();
      } catch (error) { this.skip(url, error.message); await route.abort().catch(() => {}); }
      finally { this.inflightBrowser.delete(request); }
    });
    this.context.on('response', response => {
      this.track(this.captureResponse(response).catch(error => this.warnings.add(`Browser capture: ${error.message}`)));
    });
    this.page = await this.context.newPage();
    this.context.on('page', page => {
      if (page !== this.page) page.close().catch(() => {});
    });
    this.page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    this.page.on('pageerror', error => {
      if (this.browserErrors.length < 100) this.browserErrors.push({ url: this.page.url(), message: error.message.slice(0, 2000) });
    });
    if (this.options.manualSeconds) {
      this.page.on('domcontentloaded', () => {
        this.track((async () => {
          const url = this.page.url();
          if (this.bootstrapping || !this.scope.allows(url, 'page')) return;
          this.enqueue(url, this.scope.seed, 'manual-navigation', 'page', 0);
          await this.processHtml(await this.page.content(), url, 0);
        })().catch(error => this.warnings.add(`Manual DOM: ${error.message}`)));
      });
    }
  }

  async captureResponse(response) {
    if (this.bootstrapping) return;
    const request = response.request();
    const url = normalizeUrl(response.url());
    if (!url || !this.scope.allows(url, request.isNavigationRequest() ? 'page' : 'asset')) return;
    const headers = await response.allHeaders();
    const type = headers['content-type'] || '';
    let record;
    if (request.isNavigationRequest() && request.resourceType() === 'document') {
      record = this.enqueue(url, null, 'browser-document', 'page', this.currentDepth || 0);
    } else if (request.resourceType() === 'script' || ['worker', 'sharedworker'].includes(request.resourceType()) || JS_TYPE.test(type) || isJsUrl(new URL(url).pathname)) {
      let parent = this.scope.seed;
      try { parent = request.frame().url(); } catch { /* Service/worker requests may lack a frame. */ }
      record = this.enqueue(url, parent, 'browser-response');
    } else return;
    if (!record || ['saved', 'capturing', 'fetching'].includes(record.state)) return;
    if (Number(headers['content-length']) > this.options.maxBytes) {
      record.state = 'error'; record.error = 'Response exceeds per-file limit'; return;
    }
    record.state = 'capturing';
    try {
      await this.accept(record, { url, status: response.status(), contentType: type,
        sourceMap: headers.sourcemap || headers['x-sourcemap'], body: await response.body() }, 'browser');
    } catch (error) { record.state = 'error'; record.error = error.message; }
  }

  async navigate(url) {
    const visited = new Set();
    let response;
    for (let hops = 0; hops <= 10; hops++) {
      if (!this.scope.allows(url, 'page')) throw new Error(`Navigation outside scope: ${url}`);
      const fingerprint = `${url}:${hash(JSON.stringify(await this.context.cookies(url)))}`;
      if (visited.has(fingerprint)) throw new Error(`Redirect loop without session progress: ${url}`);
      visited.add(fingerprint);
      this.pendingNavigation = null;
      this.activePageUrl = url;
      try { response = await this.page.goto(url, { waitUntil: 'commit', timeout: this.options.timeout }); }
      catch (error) { if (!this.pendingNavigation) throw error; }
      if (!this.pendingNavigation) return response;
      const next = this.pendingNavigation;
      this.sessionEvents.push({ action: 'redirect', ...next });
      url = next.url;
    }
    throw new Error('Browser redirect limit reached (10)');
  }

  async followNavigation() {
    if (this.pendingNavigation) {
      const next = this.pendingNavigation;
      this.sessionEvents.push({ action: 'redirect', ...next });
      await this.navigate(next.url);
    }
  }

  async observeBrowser() {
    const started = Date.now();
    let quietSince = started;
    while (Date.now() < this.budget.deadline && !this.budget.reason) {
      if (this.pendingNavigation) await this.followNavigation();
      if (this.inflightBrowser.size) quietSince = Date.now();
      if (Date.now() - started >= this.options.settle && Date.now() - quietSince >= 300) break;
      await sleep(100);
    }
  }

  async checkpoint(label) {
    try {
      const url = this.page.url();
      if (!this.scope.allows(url, 'page')) return;
      await writeFile(path.join(this.store.root, 'browser-last.html'), await this.page.content());
      await this.page.screenshot({ path: path.join(this.store.root, 'browser-last.png'), fullPage: true, timeout: 10000 });
      this.sessionEvents.push({ action: 'checkpoint', label, url });
    } catch (error) { this.warnings.add(`Browser checkpoint: ${error.message}`); }
  }

  async runSessionFlow(flow) {
    if (!Array.isArray(flow.steps) || flow.steps.length > 50) throw new Error('Session flow needs an array of at most 50 steps');
    this.bootstrapping = true;
    try {
      for (const [index, step] of flow.steps.entries()) {
        const event = { step: index + 1, action: step.action, state: 'started' };
        this.sessionEvents.push(event);
        try {
          if (step.action === 'navigate') {
            const response = await this.navigate(step.url);
            if (response && [401, 403, 429].includes(response.status())) throw new Error(`Session page returned HTTP ${response.status()}: ${this.page.url()}`);
          } else {
            if (!this.scope.allows(this.page.url(), 'page')) throw new Error('Session action outside approved origins');
            if (step.origin && new URL(this.page.url()).origin !== step.origin) throw new Error('Session action origin does not match');
            if (step.action === 'click') {
              await this.page.locator(step.selector).click({ noWaitAfter: true, timeout: this.options.timeout });
            } else if (step.action === 'fill') {
              if (typeof step.valueEnv !== 'string' || !process.env[step.valueEnv]) throw new Error('Missing environment variable for session field');
              await this.page.locator(step.selector).fill(process.env[step.valueEnv]);
            } else if (step.action === 'wait-url') {
              const expected = new RegExp(step.pattern);
              const deadline = Math.min(Date.now() + this.options.timeout, this.budget.deadline);
              while (Date.now() < deadline) {
                await this.followNavigation();
                if (expected.test(this.page.url())) break;
                await sleep(100);
              }
              if (!expected.test(this.page.url())) throw new Error('Expected session URL was not reached');
            } else if (step.action === 'wait-selector') {
              await this.followNavigation();
              await this.page.locator(step.selector).waitFor({ state: 'visible', timeout: this.options.timeout });
            } else throw new Error(`Unsupported session action: ${step.action}`);
            await sleep(150);
            await this.followNavigation();
          }
          event.state = 'complete';
        } catch (error) { event.state = 'error'; event.error = error.message; throw error; }
      }
      await this.transport.seedCookies(await this.context.cookies(), true);
    } finally { await this.checkpoint('session-flow'); this.bootstrapping = false; }
  }

  async captureRenderedPage(record, response) {
    const url = this.page.url();
    if (!this.scope.allows(url, 'page')) return;
    const html = await this.page.content();
    const target = this.pages.get(url) || this.enqueue(url, record.url, 'browser-route', 'page', record.depth);
    if (!target) {
      // A page cap must not hide a login boundary reached by client-side routing.
      const result = extractHtml(html, url);
      this.auth.page({ url, finalUrl: url, status: response?.status() || record.status || 200 }, result.signals);
      return;
    }
    if (!target.domSnapshot) {
      const snapshot = { id: `${url}#rendered-dom`, url };
      await this.store.save(snapshot, Buffer.from(html), 'pages', 'html');
      target.domSnapshot = { path: snapshot.path, sha256: snapshot.sha256, bytes: snapshot.bytes };
      if (!target.path) Object.assign(target, { ...target.domSnapshot, state: 'saved', status: response?.status() || record.status || 200,
        statusEvidence: 'inherited-document-response', documentUrl: record.finalUrl || record.url, transport: 'browser-dom' });
    }
    await this.processHtml(html, url, record.depth, target);
  }

  async browse(record) {
    this.currentDepth = record.depth;
    record.state = 'loading';
    try {
      const response = await this.navigate(record.url);
      await this.observeBrowser();
      if (this.options.manualSeconds && !this.manualDone) {
        this.manualDone = true;
        console.log(`Browser open for ${this.options.manualSeconds}s: navigate and open menus to load additional chunks.`);
        const end = Math.min(Date.now() + this.options.manualSeconds * 1000, this.budget.deadline);
        while (Date.now() < end && !this.page.isClosed() && !this.budget.reason) {
          await this.followNavigation();
          await sleep(Math.min(500, Math.max(0, end - Date.now())));
        }
      }
      await this.drain();
      if (response && [401, 403, 429].includes(response.status())) await this.checkpoint(`http-${response.status()}`);
      else await this.captureRenderedPage(record, response);
    } catch (error) { record.navigationError = error.message; }
    await this.drain();
    await this.transport.seedCookies(await this.context.cookies(), true);
    if (record.state === 'loading') { record.state = 'error'; record.error = record.navigationError || 'No HTML response captured'; }
  }

  async importSeeds(file) {
    const text = await readFile(file, 'utf8');
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      let value = line.trim();
      if (value.startsWith('{')) {
        try { const data = JSON.parse(value); value = data.request?.endpoint || data.url || data.endpoint; }
        catch { throw new Error(`Invalid JSONL seed on line ${index + 1}`); }
      }
      if (typeof value !== 'string') continue;
      const url = normalizeUrl(value, this.scope.seed);
      if (!url) continue;
      this.enqueue(url, this.scope.seed, 'imported-seed', /\.map(?:\?|$)/.test(url) ? 'map' : isJsUrl(url) ? 'script' : 'page', 0);
    }
  }

  async run() {
    await this.store.init();
    let failure;
    try {
      if (this.options.storageState) {
        const state = JSON.parse(await readFile(this.options.storageState, 'utf8'));
        await this.transport.seedCookies(state.cookies);
      }
      this.enqueue(this.scope.seed, null, 'seed', 'page');
      for (const value of this.options.authPaths) this.enqueue(normalizeUrl(value, this.scope.seed), this.scope.seed, 'explicit-auth-path', 'page', 0);
      for (const file of this.options.seeds || []) await this.importSeeds(file);
      if (this.options.mode === 'hybrid') await this.startBrowser();
      if (this.options.sessionFlow) await this.runSessionFlow(JSON.parse(await readFile(this.options.sessionFlow, 'utf8')));
      while (!this.budget.reason && Date.now() < this.budget.deadline) {
        const candidates = this.auth.paused ? [...this.assets.values()] : [...this.pages.values(), ...this.assets.values()];
        const record = candidates.find(r => r.state === 'queued');
        if (!record) break;
        if (record.kind === 'page' && this.browser && !this.options.manualSeconds) {
          await this.browse(record);
        } else if (record.kind === 'page' && this.browser && !this.manualDone) {
          await this.browse(record);
        } else {
          record.state = 'fetching';
          this.httpRecord = record;
          try { await this.accept(record, await this.transport.get(record.url, record.kind === 'page' ? 'page' : 'asset'), 'http'); }
          catch (error) { record.state = 'error'; record.error = error.message; }
          finally { this.httpRecord = null; }
        }
      }
      if (Date.now() >= this.budget.deadline) this.budget.reason ||= 'duration limit reached';
    } catch (error) { failure = error; this.warnings.add(error.message); }
    finally {
      this.stopping = true;
      if (this.browser) {
        if (this.context && this.options.saveStorageState) {
          try {
            await mkdir(path.dirname(path.resolve(this.options.saveStorageState)), { recursive: true });
            await writeFile(this.options.saveStorageState, JSON.stringify(await this.context.storageState(), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
          } catch (error) { this.warnings.add(`Session export: ${error.message}`); }
        }
        if (this.context) await this.context.close().catch(() => {});
        await this.drain();
        await this.browser.close().catch(() => {});
      }
      await this.finish(failure);
    }
    if (failure) throw failure;
    return this.summary;
  }

  async finish(failure) {
    if (this.auth.paused) for (const record of this.pages.values()) {
      if (record.state === 'queued') { record.state = 'deferred-auth'; record.reason = 'User login/session required before continuing page traversal'; }
    }
    const records = [...this.assets.values(), ...this.inline.values()];
    const queued = [...this.pages.values(), ...this.assets.values()].filter(r => r.state === 'queued');
    const counts = {};
    for (const record of records) counts[record.state] = (counts[record.state] || 0) + 1;
    const savedScripts = records.filter(r => r.state === 'saved' && ['script', 'inline-script', 'inline-handler'].includes(r.kind)).length;
    const scriptsByOrigin = {};
    for (const r of records) if (r.state === 'saved' && r.kind === 'script') {
      const origin = new URL(r.url).origin;
      scriptsByOrigin[origin] = (scriptsByOrigin[origin] || 0) + 1;
    }
    const limitsHit = {};
    for (const r of this.skipped.values()) if (r.reason.endsWith('-limit')) limitsHit[r.reason] = (limitsHit[r.reason] || 0) + 1;
    const blockers = [...this.pages.values()].filter(r => r.navigationError || ['error', 'http-error'].includes(r.state))
      .map(r => ({ url: r.url, status: r.status, reason: r.error || r.navigationError || `HTTP ${r.status}` }));
    for (const r of this.skipped.values()) if (r.reason === 'outside-scope' && [...this.pages.values()].some(p => p.finalUrl === r.url)) blockers.push(r);
    const scopeDependencies = assessScopeDependencies([...this.pages.values()], records);
    const incomplete = Object.keys(limitsHit).length || blockers.length || queued.length || this.budget.reason || this.browserErrors.length ||
      records.some(r => ['error', 'http-error', 'not-javascript', 'not-map'].includes(r.state));
    this.summary = { startedAt: this.started, endedAt: new Date().toISOString(), seed: this.scope.seed,
      outcome: failure ? 'failed' : scopeDependencies.required ? 'blocked' : this.auth.paused ? 'needs-auth' : savedScripts ? incomplete ? 'partial' : 'collected' : blockers.length ? 'blocked' : 'empty',
      browserErrorCount: this.browserErrors.length,
      scopeDependencies,
      authentication: this.auth.describe(),
      savedScripts, scriptsByOrigin, limitsHit, blockers,
      assetErrors: records.filter(r => ['error', 'http-error'].includes(r.state)).length,
      mode: this.options.mode, scope: this.scope.describe(), requests: this.budget.requests,
      savedBytes: this.store.bytes, uniqueFiles: this.store.blobs.size,
      pages: this.pages.size, assets: this.assets.size, inline: this.inline.size, sourceEntries: this.sourceCount,
      states: counts, queued: queued.length, skipped: this.skipped.size,
      stopReason: failure ? 'fatal-error' : scopeDependencies.required ? 'out-of-scope-script-dependency' : this.auth.paused ? 'authentication-required' : this.budget.reason || 'discovery-exhausted',
      warnings: [...this.warnings], fatalError: failure?.message,
      limits: Object.fromEntries(['depth', 'maxPages', 'maxAssets', 'maxRequests', 'maxBytes', 'maxTotalBytes', 'maxSources', 'delay', 'duration'].map(key => [key, this.options[key]])),
      coverage: 'Reachable client assets only; no guarantee of all scripts or server-side source. See skipped.jsonl, pages.jsonl and assets.jsonl.' };
    await this.store.json('manifest.json', this.summary);
    await this.store.jsonl('assets.jsonl', records);
    await this.store.jsonl('pages.jsonl', [...this.pages.values()]);
    await this.store.jsonl('discovery.jsonl', this.edges);
    await this.store.jsonl('skipped.jsonl', [...this.skipped.values()]);
    await this.store.jsonl('network.jsonl', this.network);
    await this.store.json('session.json', this.sessionEvents);
    await this.store.jsonl('browser-errors.jsonl', this.browserErrors);
    await this.store.jsonl('calls.jsonl', [...this.calls.values()]);
    const inventory = buildInventory({ pages: [...this.pages.values()], assets: records, edges: this.edges,
      calls: [...this.calls.values()], network: this.network, scope: this.scope, auth: this.auth,
      session: { storageStateProvided: !!this.options.storageState, explicitSessionFlowProvided: !!this.options.sessionFlow } });
    await writeInventory(this.store, inventory);
    if (scopeDependencies.required) {
      await this.store.json('scope-required.json', scopeDependencies);
      await writeFile(path.join(this.store.root, 'SCOPE-REQUIRED.md'), '# Scope clarification required\n\n' +
        scopeDependencies.blockedPages.map(p => `Page: ${p.pageUrl}\n\n${p.reason}\n\nBlocked entries:\n${p.entryScripts.map(url => `- ${url}`).join('\n')}\n`).join('\n') +
        `\n${scopeDependencies.nextStep}\n\nSuggested program question: Does the application scope authorize downloading the static JavaScript assets it directly references on the excluded CDN solely for application analysis, without testing the CDN infrastructure?\n`);
    }
    if (this.auth.required) {
      const resume = new Set([this.scope.seed, ...[...this.pages.values()].filter(p => p.state === 'deferred-auth').map(p => p.url),
        ...[...this.auth.requirements.values()].flatMap(r => r.protectedUrls).filter(Boolean)]);
      const resumeUrls = [...resume].filter(url => this.scope.allows(url, 'page'));
      await this.store.json('auth-required.json', { ...this.auth.describe(), resumeUrls,
        nextStep: 'Complete normal sign-in with your own authorized account. Provide a local storage-state JSON file with --storage-state, and resume using --seeds resume-seeds.txt in a NEW output directory. Never paste passwords or session tokens into chat.' });
      await writeFile(path.join(this.store.root, 'resume-seeds.txt'), resumeUrls.join('\n') + '\n');
      await writeFile(path.join(this.store.root, 'AUTH-REQUIRED.md'), '# User authentication or consent needed\n\n' +
        [...this.auth.requirements.values()].map(r => `${r.action}\n\nPage: ${r.pageUrl}\n\nLogin: ${r.loginUrl || 'not identified'}\n\nEvidence: ${r.reason}\n`).join('\n') +
        '\nPublic login-page scripts and the inventory have been retained. ' + (this.auth.paused
          ? 'Automatic page traversal is paused for a user session. '
          : 'This run uses the record policy; boundaries are recorded while other public pages may continue. ') +
        'Use auth-required.json and resume-seeds.txt to continue with an authorized saved session in a new output directory.\n');
    }
    await writeFile(`${this.store.root}/urls.txt`, [...this.assets.values()].filter(r => r.state === 'saved').map(r => r.url).join('\n') + '\n');
    await writeFile(`${this.store.root}/SUMMARY.md`, `# JavaScript collection\n\nSeed: ${this.scope.seed}\n\nMode: ${this.options.mode}\n\n` +
      `${this.store.blobs.size} unique files, ${this.store.bytes} saved bytes, ${this.budget.requests} requests.\n\n` +
      `Outcome: ${this.summary.outcome}. Script records: ${savedScripts}. Limit skips: ${JSON.stringify(limitsHit)}.\n\n` +
      `Stop reason: ${this.summary.stopReason}. Queued: ${queued.length}. Skipped: ${this.skipped.size}.\n\n` +
      'Use assets.jsonl to map URLs to local paths and sources, discovery.jsonl for the dependency graph, and pages.jsonl/skipped.jsonl for coverage gaps.\n\n' +
      'Open inventory.html or INVENTORY.md for page/script/form/call relationships. Authentication handoffs, when needed, are in AUTH-REQUIRED.md.\n\n' +
      'A completed collection does not imply full application coverage. Lazy interactions, authentication, unsupported runtimes and server-only code can leave gaps.\n');
  }
}
