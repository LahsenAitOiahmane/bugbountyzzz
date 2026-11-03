import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Collector } from '../lib/collector.mjs';
import { extractJs } from '../lib/extract.mjs';
import { AuthGate } from '../lib/auth.mjs';
import { Scope } from '../lib/scope.mjs';
import { buildInventory } from '../lib/inventory.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const read = async (out, name) => JSON.parse(await readFile(path.join(out, name), 'utf8'));
const output = async () => path.join(await mkdtemp(path.join(os.tmpdir(), 'js-inventory-test-')), 'run');
const send = (res, type, body, status = 200, headers = {}) => { res.writeHead(status, { 'content-type': type, ...headers }); res.end(body); };
async function serve(t, handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return `http://127.0.0.1:${instance.address().port}`;
}
async function browserAvailable(t) {
  const { chromium } = await import('playwright');
  try { await access(chromium.executablePath()); return true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; t.skip('Chromium not installed'); return false; }
}

test('static calls retain method/source evidence without inventing dynamic URLs', () => {
  const result = extractJs(`fetch('/api/profile',{method:'POST',body:'private-body'});
    window.fetch('/api/list'); axios.get('/api/items'); axios({url:'/api/change',method:'patch'});
    request.open('DELETE','/api/item'); navigator.sendBeacon('/metrics','private'); fetch(dynamicUrl);`, 'https://app.test/main.js');
  assert.deepEqual(result.calls.map(c => [c.method, c.rawUrl]), [
    ['POST', '/api/profile'], ['GET', '/api/list'], ['GET', '/api/items'],
    ['PATCH', '/api/change'], ['DELETE', '/api/item'], ['POST', '/metrics']
  ]);
  assert.ok(result.calls.every(c => c.evidence === 'inferred-static-call' && Number.isInteger(c.start)));
  assert.ok(!JSON.stringify(result.calls).includes('private-body'));
  assert.equal(extractJs("fetch('/api/dynamic',{method:verb})", 'https://app.test/main.js').calls[0].method, 'UNKNOWN');
});

test('relative API references from CDN scripts resolve against each document base, not the CDN directory', () => {
  const script = 'https://cdn.test/assets/app.js', page = 'https://app.test/tenant/';
  const scope = new Scope(page, { assetOrigins: ['https://cdn.test'] });
  const calls = extractJs("fetch('/api/root');fetch('api/relative')", script).calls.map(c => ({ ...c, sourceId: script }));
  const inventory = buildInventory({ pages: [{ id: page, url: page, state: 'saved', path: 'pages/index.html', baseUrl: page }],
    assets: [{ id: script, url: script, kind: 'script', state: 'saved' }], edges: [{ parent: page, target: script, via: 'script-src' }],
    calls, network: [], scope, auth: new AuthGate(scope) });
  assert.deepEqual(inventory.pages[0].inferredCalls.map(c => c.url), ['https://app.test/api/root', 'https://app.test/tenant/api/relative']);
});

test('page inventory joins shared scripts, inline dependencies, descriptions, forms and static calls without fetching APIs', async t => {
  const hits = [];
  const origin = await serve(t, (req, res) => {
    hits.push(req.url);
    if (req.url === '/') return send(res, 'text/html', `<title>Home</title><meta name="description" content="Public application">
      <a href="/about">About</a><script src="/shared.js"></script><script>import('./inline-dep.js')</script>`);
    if (req.url === '/about') return send(res, 'text/html', '<title>About</title><h1>About us</h1><script src="/shared.js"></script>');
    if (req.url === '/shared.js') return send(res, 'text/javascript', `import './dep.js'; fetch('/api/data',{method:'POST',body:'private-body'});`);
    return send(res, 'text/javascript', 'void 0;');
  });
  const out = await output();
  await new Collector({ url: origin, out, mode: 'static', delay: 1 }).run();
  const inventory = await read(out, 'inventory.json');
  const shared = inventory.scripts.find(s => s.url.endsWith('/shared.js'));
  assert.equal(shared.usedByPages.length, 2);
  assert.ok(shared.dependsOn.includes(`${origin}/dep.js`));
  assert.ok(inventory.sharedScripts.includes(shared.id));
  const home = inventory.pages.find(p => p.url === `${origin}/`);
  assert.equal(home.description, 'Public application');
  assert.ok(home.relatedScripts.includes(`${origin}/inline-dep.js`));
  assert.ok(home.relatedScripts.includes(`${origin}/dep.js`));
  assert.ok(home.inferredCalls.some(c => c.url === `${origin}/api/data` && c.method === 'POST'));
  assert.equal(home.observedCalls.length, 0);
  assert.ok(!hits.some(url => url.startsWith('/api/')));
  assert.ok(!(await readFile(path.join(out, 'inventory.html'), 'utf8')).includes('private-body'));
});

async function authFixture(t) {
  const hits = [];
  const origin = await serve(t, (req, res) => {
    hits.push({ url: req.url, method: req.method });
    const loggedIn = req.headers.cookie?.includes('session=valid');
    if (req.url === '/') return send(res, 'text/html', '<title>Home</title><a href="/public">Public</a><a href="/login">Sign in</a><script src="/common.js"></script>');
    if (req.url === '/dashboard' && !loggedIn) return send(res, 'text/plain', '', 302, { location: '/login' });
    if (req.url === '/login' && loggedIn) return send(res, 'text/plain', '', 302, { location: '/dashboard' });
    if (req.url === '/login') return send(res, 'text/html', `<title>Sign in</title><meta name="description" content="Access your dashboard &lt;/script&gt;&lt;script&gt;globalThis.inventoryInjected=1&lt;/script&gt;"><h1>Sign in</h1>
      <form method="post" action="/session"><input name="email" type="email" required>
      <input name="password" type="password" value="private-password"><input name="csrf" type="hidden" value="private-csrf">
      <button>Sign in</button></form><script src="/login.js"></script><a href="/dashboard">Dashboard</a>`);
    if (req.url === '/dashboard') return send(res, 'text/html', '<title>Your dashboard</title><script src="/private.js"></script>');
    if (req.url === '/public') return send(res, 'text/html', '<title>Public</title><script src="/common.js"></script>');
    return send(res, 'text/javascript', `fetch('/api/session',{method:'POST'});`);
  });
  return { origin, hits };
}

test('CLI pauses at a public login page, keeps its scripts and forms, requests a saved user session, and resumes with a valid one', async t => {
  const { origin, hits } = await authFixture(t), out = await output();
  await assert.rejects(run(process.execPath, [cli, origin, '--mode', 'static', '--out', out, '--delay', '1']), error => {
    assert.equal(error.code, 3); assert.match(error.stdout, /USER ACTION REQUIRED/); return true;
  });
  const manifest = await read(out, 'manifest.json');
  assert.equal(manifest.outcome, 'needs-auth');
  assert.equal(manifest.stopReason, 'authentication-required');
  const handoff = await read(out, 'auth-required.json');
  assert.equal(handoff.paused, true);
  assert.ok(handoff.requirements.some(r => r.loginUrl === `${origin}/login`));
  assert.ok(!hits.some(r => ['/public', '/dashboard', '/session', '/api/session'].includes(r.url)));
  const inventory = await read(out, 'inventory.json');
  const login = inventory.pages.find(p => p.url.endsWith('/login'));
  assert.equal(login.type, 'login');
  assert.equal(login.forms[0].action, `${origin}/session`);
  assert.equal(login.controls[0].text, 'Sign in');
  assert.deepEqual(login.forms[0].fields.map(f => f.name), ['email', 'password', 'csrf']);
  assert.ok(login.relatedScripts.includes(`${origin}/login.js`));
  assert.ok(inventory.pages.some(p => p.state === 'deferred-auth'));
  assert.ok(!JSON.stringify(inventory).includes('private-password'));
  assert.ok(!JSON.stringify(inventory).includes('private-csrf'));
  const state = path.join(path.dirname(out), 'storage-state.json');
  await writeFile(state, JSON.stringify({ cookies: [{ name: 'session', value: 'valid', domain: '127.0.0.1', path: '/', expires: -1, secure: false, httpOnly: true }], origins: [] }));
  const resumedOut = await output();
  const resumed = await new Collector({ url: `${origin}/dashboard`, out: resumedOut, mode: 'static', storageState: state,
    seeds: [path.join(out, 'resume-seeds.txt')], delay: 1 }).run();
  assert.equal(resumed.authentication.required, false);
  assert.ok((await read(resumedOut, 'inventory.json')).scripts.some(s => s.url.endsWith('/private.js') && s.state === 'saved'));
  const expired = await output();
  const expiredResult = await new Collector({ url: `${origin}/dashboard`, out: expired, mode: 'static', delay: 1 }).run();
  assert.equal(expiredResult.outcome, 'needs-auth');
  assert.ok((await read(expired, 'auth-required.json')).resumeUrls.includes(`${origin}/dashboard`));
});

test('excluded login redirects require a user handoff without requesting or adding the provider', async t => {
  const origin = await serve(t, (req, res) => send(res, 'text/plain', '', 302, { location: 'https://login.dpgmedia.be/authorize' }));
  const out = await output();
  const result = await new Collector({ url: origin, out, mode: 'static', excludes: ['login\\.dpgmedia\\.be'], delay: 1 }).run();
  assert.equal(result.requests, 1);
  assert.equal(result.outcome, 'needs-auth');
  const auth = await read(out, 'auth-required.json');
  assert.equal(auth.requirements[0].loginInScope, false);
  assert.ok(auth.resumeUrls.every(u => u.startsWith(origin)));
  const gate = new AuthGate(new Scope(origin));
  gate.challenge(origin, origin, 403, false);
  assert.equal(gate.required, false, 'A WAF denial alone must not be mislabeled as login');
});

test('browser login handoff stops protected traversal and produces a working offline inventory', async t => {
  if (!await browserAvailable(t)) return;
  const { origin, hits } = await authFixture(t), out = await output();
  const result = await new Collector({ url: origin, out, mode: 'hybrid', delay: 5, settle: 100 }).run();
  assert.equal(result.outcome, 'needs-auth');
  assert.ok(!hits.some(h => ['/dashboard', '/session', '/api/session'].includes(h.url)));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(out, 'inventory.html')).href);
    assert.ok(await page.locator('article').count() >= 2);
    assert.match(await page.locator('#auth').innerText(), /User session needed/);
    await page.locator('#filter').fill('Access your dashboard');
    assert.equal(await page.locator('article').count(), 1);
    assert.equal(errors.length, 0);
    assert.equal(await page.evaluate(() => globalThis.inventoryInjected), undefined);
    const sourceView = page.context().waitForEvent('page');
    await page.getByRole('link', { name: 'HTML source' }).click();
    const sourcePage = await sourceView;
    await sourcePage.waitForLoadState();
    assert.ok(sourcePage.url().endsWith('.html.txt'));
    assert.match(await sourcePage.locator('body').innerText(), /<html|<title/i);
    await sourcePage.close();
    assert.ok(page.url().endsWith('inventory.html'), 'HTML source should open as text rather than execute the captured application');
  } finally { await browser.close(); }
});

test('an excluded CDN entry produces a scope handoff instead of an empty-success or login request', async t => {
  let cdnHits = 0;
  const cdn = await serve(t, (req, res) => { cdnHits++; send(res, 'text/javascript', 'globalThis.cdn=true;'); });
  const origin = await serve(t, (req, res) => send(res, 'text/html', `<title>Application</title><script src="${cdn}/main.js"></script><link rel="modulepreload" href="${cdn}/dep.js">`));
  const out = await output();
  await assert.rejects(run(process.execPath, [cli, origin, '--mode', 'static', '--delay', '1', '--out', out]), error => {
    assert.equal(error.code, 4); assert.match(error.stdout, /SCOPE CLARIFICATION REQUIRED/); return true;
  });
  const manifest = await read(out, 'manifest.json');
  assert.equal(manifest.outcome, 'blocked');
  assert.equal(manifest.stopReason, 'out-of-scope-script-dependency');
  assert.equal(manifest.authentication.required, false);
  assert.equal(manifest.requests, 1);
  assert.equal(cdnHits, 0);
  assert.deepEqual(manifest.scopeDependencies.blockedOrigins, [cdn]);
  const inventory = await read(out, 'inventory.json');
  assert.equal(inventory.pages[0].blockedScriptReferences.length, 2);
  assert.equal((await read(out, 'scope-required.json')).required, true);
  const allowed = await output();
  const allowedResult = await new Collector({ url: origin, out: allowed, mode: 'static', delay: 1, assetOrigins: [cdn] }).run();
  assert.equal(allowedResult.scopeDependencies.required, false);
  assert.equal(allowedResult.savedScripts, 2);
});

test('asset-only CDN retrieval supports SPA login inventory while CDN APIs/pages and speculative requests remain blocked', async t => {
  if (!await browserAvailable(t)) return;
  const cdnHits = [], appHits = [];
  let app;
  const cdn = await serve(t, (req, res) => {
    cdnHits.push(req.url);
    if (req.url === '/main.js') return send(res, 'text/javascript', `
      history.replaceState(null,'','/login');
      document.getElementById('root').innerHTML='<h1>Sign in</h1><form action="/session" method="post"><input name="email"><input name="password" type="password"></form>';
      fetch(${JSON.stringify('PLACEHOLDER')}).catch(()=>{});`.replace(JSON.stringify('PLACEHOLDER'), JSON.stringify(`${cdn}/api/forbidden`)), 200, { 'access-control-allow-origin': '*' });
    return send(res, 'text/javascript', 'void 0;', 200, { 'access-control-allow-origin': '*' });
  });
  app = await serve(t, (req, res) => {
    appHits.push(req.url);
    send(res, 'text/html', `<title>Application</title><div id="root"></div><script defer src="${cdn}/main.js"></script>
      <link rel="prefetch" as="script" href="${cdn}/lazy.js"><iframe src="${cdn}/forbidden-page"></iframe>`);
  });
  const out = await output();
  const result = await new Collector({ url: app, out, mode: 'hybrid', assetOrigins: [cdn], delay: 5, settle: 400 }).run();
  assert.equal(result.outcome, 'needs-auth');
  assert.equal(result.scopeDependencies.required, false);
  assert.ok(cdnHits.includes('/main.js') && cdnHits.includes('/lazy.js'));
  assert.ok(!cdnHits.includes('/api/forbidden') && !cdnHits.includes('/forbidden-page'));
  assert.ok(!appHits.includes('/login'), 'The SPA route must be recorded without inventing a document GET');
  const inventory = await read(out, 'inventory.json');
  const login = inventory.pages.find(p => p.url === `${app}/login`);
  assert.equal(login.type, 'login');
  assert.equal(login.htmlEvidence, 'rendered-DOM');
  assert.equal(login.statusEvidence, 'inherited-document-response');
  assert.equal(login.forms[0].method, 'POST');
  assert.ok(login.directScripts.includes(`${cdn}/main.js`));
  const dom = await readFile(path.join(out, login.htmlPath), 'utf8');
  assert.match(dom, /Sign in/);
  const network = (await readFile(path.join(out, 'network.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  assert.ok(!network.some(n => n.url === `${cdn}/lazy.js` && n.transport === 'browser'));
});

test('strict asset retrieval fetches explicit imports while preserving debug filenames as unfetched references', async t => {
  const hits = [];
  const cdn = await serve(t, (req, res) => {
    hits.push(req.url);
    send(res, 'text/javascript', req.url === '/assets/main.js'
      ? "import './DeleteTokenModal.js'; const debug='../node_modules/internal.js'; const example='../sample.js';" : 'export const ready=true;');
  });
  const app = await serve(t, (req, res) => send(res, 'text/html', `<script src="${cdn}/assets/main.js"></script>`));
  const out = await output();
  const result = await new Collector({ url: app, out, mode: 'static', delay: 1, assetOrigins: [cdn], strictAssets: true,
    excludes: ['/(?:logout|signout|delete)(?:[/?#]|$)'] }).run();
  assert.equal(result.savedScripts, 2);
  assert.deepEqual(hits.sort(), ['/assets/DeleteTokenModal.js', '/assets/main.js']);
  const graph = (await readFile(path.join(out, 'discovery.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  assert.ok(graph.some(e => e.target.endsWith('/node_modules/internal.js')));
  assert.equal(new Scope(app, { excludes: ['/(?:logout|signout|delete)(?:[/?#]|$)'] }).allows(`${app}/delete/42`, 'page'), false);
});

test('strict asset retrieval also skips heuristic filenames on the seed origin', async t => {
  const hits = [];
  const app = await serve(t, (req, res) => {
    hits.push(req.url);
    if (req.url === '/') return send(res, 'text/html', '<script src="/main.js"></script>');
    if (req.url === '/main.js') return send(res, 'text/javascript', "import './chunk.js'; const sample='/cjs/react.production.js';");
    if (req.url === '/chunk.js') return send(res, 'text/javascript', 'export const ready=true;');
    return send(res, 'text/plain', 'missing', 404);
  });
  const out = await output();
  const result = await new Collector({ url: app, out, mode: 'static', delay: 1, strictAssets: true }).run();
  assert.equal(result.savedScripts, 2);
  assert.deepEqual(hits.sort(), ['/', '/chunk.js', '/main.js']);
  const graph = (await readFile(path.join(out, 'discovery.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  assert.ok(graph.some(e => e.target === `${app}/cjs/react.production.js`));
});
