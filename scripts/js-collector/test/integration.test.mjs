import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Collector } from '../lib/collector.mjs';
import { Store } from '../lib/store.mjs';

async function server(handler, t) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return `http://127.0.0.1:${instance.address().port}`;
}

async function output() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'js-collector-test-'));
  return path.join(root, 'run');
}

const jsonl = async file => (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const send = (res, type, body, status = 200, headers = {}) => {
  res.writeHead(status, { 'content-type': type, ...headers }); res.end(body);
};

async function browserAvailable(t) {
  const { chromium } = await import('playwright');
  try { await access(chromium.executablePath()); return true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; t.skip('Chromium not installed'); return false; }
}

async function fixture(t) {
  const externalHits = [], cdnHits = [], hits = [];
  const external = await server((req, res) => { externalHits.push(req.url); send(res, 'text/javascript', 'external()'); }, t);
  const cdn = await server((req, res) => {
    cdnHits.push({ url: req.url, auth: req.headers.authorization, marker: req.headers['x-test'] });
    send(res, 'text/javascript', 'globalThis.cdnLoaded=true;');
  }, t);
  let origin;
  origin = await server((req, res) => {
    hits.push({ url: req.url, auth: req.headers.authorization, cookie: req.headers.cookie, time: Date.now() });
    const url = new URL(req.url, origin);
    if (url.pathname === '/start') return send(res, 'text/plain', '', 302, { location: '/app/' });
    if (url.pathname === '/app/') return send(res, 'text/html', `<!doctype html><html><body>
      <a href="/second">second</a><a href="${external}/page">external</a><a href="/logout">logout</a>
      <script id="__NEXT_DATA__" type="application/json">{"buildId":"build"}</script>
      <script src="/_next/static/chunks/webpack.js"></script>
      <script src="/entry.js?version=1"></script><script src="/entry.js?version=2"></script>
      <script src="${cdn}/cdn.js"></script><script src="${external}/blocked.js"></script>
      <script type="module">import('/only-in-browser');</script>
      <script>setTimeout(()=>{const s=document.createElement('script');s.src='/runtime-only.js';document.head.append(s)},20)</script>
      <script>fetch('/write',{method:'POST',body:'should-not-send'}).catch(()=>{});</script>
      <script src="/redirect.js"></script><script src="/escape.js"></script>
      <script src="/sets-cookie.js"></script><script src="/needs-cookie.js"></script>
      <button onclick="globalThis.clicked = true">Open</button></body></html>`);
    if (url.pathname === '/second') return send(res, 'text/html', '<script src="/second.js"></script>');
    if (url.pathname === '/_next/static/chunks/webpack.js') return send(res, 'text/javascript',
      `var r={};r.p='/_next/';r.u=e=>'static/chunks/'+e+'.'+{42:'abc'}[e]+'.js';`);
    if (url.pathname === '/_next/static/build/_buildManifest.js') return send(res, 'text/javascript',
      `self.__BUILD_MANIFEST={"/unvisited":["static/chunks/pages/unvisited.js"]};`);
    if (url.pathname === '/_next/static/build/_ssgManifest.js') return send(res, 'text/javascript', 'self.__SSG_MANIFEST=new Set;');
    if (url.pathname === '/entry.js') return send(res, 'text/javascript',
      `import './nested.mjs';\n//# sourceMappingURL=/entry.js.map`);
    if (url.pathname === '/nested.mjs') return send(res, 'text/javascript', `export const ready=true;`);
    if (url.pathname === '/entry.js.map') return send(res, 'application/json', JSON.stringify({ version: 3,
      sources: ['../../../../outside.ts', 'webpack://src/no-content.ts'],
      sourcesContent: ['export const marker="original source";', null], mappings: '' }));
    if (url.pathname === '/redirect.js') return send(res, 'text/plain', '', 302, { location: '/redirect-final.js' });
    if (url.pathname === '/escape.js') return send(res, 'text/plain', '', 302, { location: '/escape-hop.js' });
    if (url.pathname === '/escape-hop.js') return send(res, 'text/plain', '', 302, { location: `${external}/leak.js` });
    if (url.pathname === '/sets-cookie.js') return send(res, 'text/javascript', 'void 0;', 200, { 'set-cookie': 'fixture=yes; Path=/' });
    if (url.pathname === '/needs-cookie.js') return send(res, 'text/javascript', 'void 1;', req.headers.cookie?.includes('fixture=yes') ? 200 : 403);
    if (url.pathname === '/only-in-browser') return send(res, 'text/javascript', 'export const runtimeModule=true;');
    if (url.pathname.endsWith('.js')) return send(res, 'text/javascript', `globalThis.fixture=${JSON.stringify(url.pathname)};`);
    return send(res, 'text/plain', 'missing', 404);
  }, t);
  return { origin, cdn, external, externalHits, cdnHits, hits };
}

test('static end-to-end: chunks, manifests, maps, dedup, redirects, cookies, scope and provenance', async t => {
  const f = await fixture(t), out = await output();
  const collector = new Collector({ url: `${f.origin}/start`, out, mode: 'static', delay: 5,
    assetOrigins: [f.cdn], excludes: ['/logout'], headers: { authorization: 'Bearer fixture', 'x-test': 'private' } });
  const result = await collector.run();
  const assets = await jsonl(path.join(out, 'assets.jsonl'));
  for (const name of ['/entry.js?version=1', '/nested.mjs', '/_next/static/chunks/42.abc.js',
    '/_next/static/chunks/pages/unvisited.js', '/entry.js.map', '/second.js', '/redirect.js', '/needs-cookie.js']) {
    assert.equal(assets.find(r => r.url === `${f.origin}${name}`)?.state, 'saved', name);
  }
  const first = assets.find(r => r.url.endsWith('/entry.js?version=1'));
  const second = assets.find(r => r.url.endsWith('/entry.js?version=2'));
  assert.equal(first.path, second.path);
  assert.equal(second.duplicateOf, first.id);
  assert.ok(assets.find(r => r.url.endsWith('/entry.js.map')).sources[0].path.startsWith('sources/'));
  assert.equal(assets.find(r => r.url.endsWith('/entry.js.map')).sources[1].embedded, false);
  assert.ok(f.cdnHits.length);
  assert.ok(f.cdnHits.every(r => !r.auth && !r.marker));
  assert.equal(f.externalHits.length, 0);
  assert.ok(!f.hits.some(r => r.url === '/logout'));
  assert.ok(f.hits.every(r => r.auth === 'Bearer fixture'));
  const skipped = await jsonl(path.join(out, 'skipped.jsonl'));
  assert.ok(skipped.some(r => r.url === `${f.external}/blocked.js`));
  const graph = await jsonl(path.join(out, 'discovery.jsonl'));
  assert.ok(graph.some(e => e.via === 'webpack-runtime' && e.target.endsWith('/42.abc.js')));
  assert.equal(result.stopReason, 'discovery-exhausted');
  assert.ok(!result.warnings.length);
  await assert.rejects(new Collector({ url: f.origin, out, mode: 'static' }).run(), /EEXIST/);
});

test('request, asset, byte limits, invalid maps and indexed inline source maps remain auditable', async t => {
  const map = { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: {
    version: 3, sources: ['../app.ts'], sourcesContent: ['const x=1'], mappings: '' } }] };
  const origin = await server((req, res) => {
    if (req.url === '/') return send(res, 'text/html', '<script src="/inline-map.js"></script><script src="/huge.js"></script><script src="/bad.js"></script>');
    if (req.url === '/inline-map.js') return send(res, 'text/javascript', `void 0;\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`);
    if (req.url === '/huge.js') return send(res, 'text/javascript', 'x'.repeat(3000));
    if (req.url === '/bad.js') return send(res, 'text/javascript', 'void 0;', 200, { sourcemap: '/bad.map' });
    return send(res, 'application/json', '{invalid');
  }, t);
  const out = await output();
  await new Collector({ url: origin, out, mode: 'static', delay: 1, maxBytes: 2000 }).run();
  const assets = await jsonl(path.join(out, 'assets.jsonl'));
  assert.equal(assets.find(r => r.url.endsWith('/huge.js')).state, 'error');
  assert.match(assets.find(r => r.url.endsWith('/bad.map')).parseWarnings[0], /Invalid/);
  assert.ok(assets.find(r => r.discoveredBy === 'inline-source-map').sources[0].path);
  const limitedOut = await output();
  const result = await new Collector({ url: origin, out: limitedOut, mode: 'static', delay: 1, maxRequests: 1 }).run();
  assert.equal(result.requests, 1);
  assert.equal(result.stopReason, 'request limit reached');
  const byteOut = await output();
  const byteResult = await new Collector({ url: origin, out: byteOut, mode: 'static', delay: 1, maxTotalBytes: 10 }).run();
  assert.equal(byteResult.savedBytes, 0);
  assert.match((await jsonl(path.join(byteOut, 'pages.jsonl')))[0].error, /Saved-byte/);
  const assetOut = await output();
  const assetResult = await new Collector({ url: origin, out: assetOut, mode: 'static', delay: 1, maxAssets: 1 }).run();
  assert.equal(assetResult.assets, 1);
  assert.ok((await jsonl(path.join(assetOut, 'skipped.jsonl'))).some(r => r.reason === 'asset-limit'));
});

test('Katana JSONL imports obey scope and preserve extensionless page seeds', async t => {
  const origin = await server((req, res) => send(res, req.url.endsWith('.js') ? 'text/javascript' : 'text/html', req.url.endsWith('.js') ? 'void 0;' : ''), t);
  const out = await output();
  const file = path.join(path.dirname(out), 'katana.jsonl');
  await writeFile(file, [JSON.stringify({ request: { endpoint: `${origin}/found.js` } }), JSON.stringify({ url: `${origin}/route` }),
    JSON.stringify({ request: { endpoint: 'https://outside.test/no.js' } })].join('\n'));
  const result = await new Collector({ url: origin, out, mode: 'static', delay: 1, seeds: [file] }).run();
  assert.equal(result.pages, 2);
  assert.equal(result.assets, 1);
});

test('CLI uses stored cookies, writes usable output and rejects invalid limits', async t => {
  const origin = await server((req, res) => {
    if (req.url === '/') return send(res, 'text/html', '<script src="/auth.js"></script>');
    return send(res, 'text/javascript', 'globalThis.auth=true;', req.headers.cookie?.includes('session=fixture') ? 200 : 403);
  }, t);
  const out = await output(), state = path.join(path.dirname(out), 'state.json');
  await writeFile(state, JSON.stringify({ cookies: [{ name: 'session', value: 'fixture', domain: '127.0.0.1',
    path: '/', secure: false, httpOnly: true, expires: -1, sameSite: 'Lax' }], origins: [] }));
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, [cli, origin, '--mode', 'static', '--out', out,
    '--storage-state', state, '--delay', '1']);
  assert.match(stdout, /Saved 1 script records \(2 unique files\)/);
  assert.equal((await jsonl(path.join(out, 'assets.jsonl')))[0].state, 'saved');
  await assert.rejects(run(process.execPath, [cli, origin, '--delay', '0']), error => {
    assert.match(error.stderr, /must be a positive integer/); return true;
  });
});

test('concurrent browser captures deduplicate atomically and respect the saved-byte budget', async () => {
  const out = await output(), store = new Store(out, { maxTotalBytes: 6 });
  await store.init();
  const records = [1, 2, 3].map(n => ({ id: `https://app.test/${n}.js`, url: `https://app.test/${n}.js` }));
  await Promise.all(records.map(r => store.save(r, Buffer.from('abc'), 'scripts', 'js')));
  assert.equal(store.bytes, 3);
  assert.equal(new Set(records.map(r => r.path)).size, 1);
  const extra = [4, 5].map(n => ({ id: `https://app.test/${n}.js`, url: `https://app.test/${n}.js` }));
  const results = await Promise.allSettled(extra.map((r, i) => store.save(r, Buffer.from(i ? 'ghi' : 'def'), 'scripts', 'js')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.bytes, 6);
});

test('hybrid captures dynamic script insertion and extensionless imports; redirects cannot escape scope', async t => {
  const { chromium } = await import('playwright');
  let browser;
  try { browser = await chromium.launch(); } catch (error) {
    if (/Executable doesn't exist|Please run.*playwright install/s.test(error.message)) return t.skip('Chromium not installed');
    throw error;
  }
  await browser.close();
  const f = await fixture(t), out = await output();
  const result = await new Collector({ url: `${f.origin}/start`, out, mode: 'hybrid', delay: 5, settle: 700,
    assetOrigins: [f.cdn], excludes: ['/logout'], headers: { authorization: 'Bearer browser-fixture' } }).run();
  const assets = await jsonl(path.join(out, 'assets.jsonl'));
  assert.equal(assets.find(r => r.url.endsWith('/runtime-only.js'))?.state, 'saved');
  assert.equal(assets.find(r => r.url.endsWith('/only-in-browser'))?.state, 'saved');
  assert.equal(f.externalHits.length, 0);
  assert.ok(f.cdnHits.every(r => !r.auth));
  assert.ok(!f.hits.some(r => r.url === '/write'));
  assert.equal(result.stopReason, 'discovery-exhausted');
  assert.ok((await readdir(out)).includes('manifest.json'));
});

test('cross-origin session flow preserves cookies, scopes POST, isolates private headers and exports reusable state', async t => {
  if (!await browserAvailable(t)) return;
  const hits = [];
  let app;
  const identity = await server((req, res) => {
    hits.push({ origin: 'identity', method: req.method, url: req.url,
      secret: req.headers.authorization, researcher: req.headers['x-intigriti-username'] });
    if (req.url === '/choose' && req.method === 'POST') return send(res, 'text/plain', '', 303, { location: `${app}/return` });
    return send(res, 'text/html', '<form method="post" action="/choose"><input type="password" name="password"><button id="necessary">Continue</button></form>');
  }, t);
  app = await server((req, res) => {
    hits.push({ origin: 'app', method: req.method, url: req.url,
      secret: req.headers.authorization, researcher: req.headers['x-intigriti-username'] });
    if (req.url === '/return') return send(res, 'text/plain', '', 302, { location: '/', 'set-cookie': 'completed=1; Path=/; HttpOnly' });
    if (req.url === '/app.js') return send(res, 'text/javascript', 'globalThis.loggedIn=true;');
    if (!req.headers.cookie?.includes('completed=1')) return send(res, 'text/plain', '', 302, { location: `${identity}/consent` });
    return send(res, 'text/html', '<script src="/app.js"></script>');
  }, t);
  const out = await output(), state = path.join(path.dirname(out), 'storage-state-test.json');
  process.env.COLLECTOR_FIXTURE_PASSWORD = 'private-fixture-password';
  t.after(() => { delete process.env.COLLECTOR_FIXTURE_PASSWORD; });
  const flow = path.join(path.dirname(out), 'flow.json');
  await writeFile(flow, JSON.stringify({ steps: [
    { action: 'navigate', url: app },
    { action: 'fill', selector: 'input[type=password]', origin: identity, valueEnv: 'COLLECTOR_FIXTURE_PASSWORD' },
    { action: 'click', selector: '#necessary', origin: identity },
    { action: 'wait-url', pattern: `^${app.replaceAll('.', '\\.').replaceAll('/', '\\/')}/?$` }
  ] }));
  const result = await new Collector({ url: app, out, mode: 'hybrid', origins: [identity],
    postUrls: [`^${identity}/choose$`], sessionFlow: flow, saveStorageState: state,
    researcher: 'fixture-handle', headers: { authorization: 'Bearer private' }, delay: 5, settle: 250 }).run();
  assert.equal(result.outcome, 'collected');
  assert.equal((await jsonl(path.join(out, 'assets.jsonl'))).find(r => r.url.endsWith('/app.js')).state, 'saved');
  assert.ok(hits.every(r => r.researcher === 'fixture-handle'));
  assert.ok(hits.filter(r => r.origin === 'identity').every(r => !r.secret));
  assert.equal(hits.filter(r => r.method === 'POST').length, 1);
  assert.ok(JSON.parse(await readFile(state, 'utf8')).cookies.some(c => c.name === 'completed'));
  assert.ok(!(await readFile(path.join(out, 'session.json'), 'utf8')).includes('private-fixture-password'));
  const reusedOut = await output();
  const reused = await new Collector({ url: app, out: reusedOut, mode: 'static', storageState: state, delay: 1 }).run();
  assert.equal(reused.outcome, 'collected');
  assert.equal(reused.requests, 2);
});

test('redirect loops and WAF denials are reported without treating denial-page scripts as collected application code', async t => {
  if (!await browserAvailable(t)) return;
  const origin = await server((req, res) => {
    if (req.url === '/loop') return send(res, 'text/plain', '', 302, { location: '/loop' });
    return send(res, 'text/html', '<html><body>Access Denied<script>globalThis.denied=true;</script></body></html>', 403);
  }, t);
  const deniedOut = await output();
  const denied = await new Collector({ url: `${origin}/denied`, out: deniedOut, mode: 'hybrid', delay: 5, settle: 20 }).run();
  assert.equal(denied.outcome, 'blocked');
  assert.equal(denied.savedScripts, 0);
  assert.ok((await readdir(deniedOut)).includes('browser-last.png'));
  const loopOut = await output();
  const loop = await new Collector({ url: `${origin}/loop`, out: loopOut, mode: 'hybrid', delay: 5, settle: 20 }).run();
  assert.equal(loop.requests, 1);
  assert.equal(loop.savedScripts, 0);
  assert.equal(loop.outcome, 'blocked');
  assert.match((await jsonl(path.join(loopOut, 'pages.jsonl')))[0].navigationError, /Redirect loop/);
});

test('browser observation waits for throttled scripts without a DOMContentLoaded navigation timeout', async t => {
  if (!await browserAvailable(t)) return;
  const origin = await server((req, res) => {
    if (req.url === '/') return send(res, 'text/html', Array.from({ length: 8 }, (_, i) => `<script src="/${i}.js"></script>`).join(''));
    return send(res, 'text/javascript', `globalThis.loaded${req.url.slice(1, 2)}=true;`);
  }, t);
  const out = await output();
  const result = await new Collector({ url: origin, out, mode: 'hybrid', delay: 150, timeout: 500, settle: 100, duration: 10 }).run();
  assert.equal(result.savedScripts, 8);
  assert.ok(!(await jsonl(path.join(out, 'pages.jsonl')))[0].navigationError);
  const log = await jsonl(path.join(out, 'network.jsonl'));
  assert.equal(log.length, result.requests);
  const starts = log.sort((a, b) => a.request - b.request).map(r => Date.parse(r.startedAt));
  assert.ok(starts.slice(1).every((time, i) => time - starts[i] >= 140));
});
