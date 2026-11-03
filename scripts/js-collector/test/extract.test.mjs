import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtml, extractJs } from '../lib/extract.mjs';
import { Scope, Budget, normalizeUrl, normalizeSeed } from '../lib/scope.mjs';

test('hostname-only seed uses HTTPS without expanding exact-origin scope', () => {
  assert.equal(normalizeSeed('app.example.com/path?q=1'), 'https://app.example.com/path?q=1');
  const scope = new Scope('app.example.com');
  assert.equal(scope.seed, 'https://app.example.com/');
  assert.equal(scope.allows('https://app.example.com/a', 'page'), true);
  assert.equal(scope.allows('https://cdn.example.com/a.js', 'asset'), false);
});

test('HTML scripts, modulepreloads, base URL, handlers, frames and Next manifests', () => {
  const result = extractHtml(`<!doctype html><base href="/app/">
    <script src="main.js?x=1&amp;y=2"></script>
    <link rel="modulepreload" href="dep.mjs">
    <script type="module">import './entry.js'</script>
    <script id="__NEXT_DATA__" type="application/json">{"buildId":"build-123","assetPrefix":"https://cdn.test/prefix"}</script>
    <script type="importmap">{"imports":{"pkg":"/vendor/pkg.js"}}</script>
    <button onclick="run()">click</button><a href="javascript:other()">x</a>
    <a href="next">Next</a><iframe src="/frame"></iframe>`, 'https://app.test/');
  assert.equal(result.base, 'https://app.test/app/');
  assert.equal(result.scripts[0].value, 'main.js?x=1&y=2');
  assert.equal(result.scripts[1].value, 'dep.mjs');
  assert.equal(result.inline.filter(r => r.kind === 'inline-handler').length, 2);
  assert.deepEqual(result.links, ['https://app.test/app/next', 'https://app.test/frame']);
  assert.equal(result.manifests[0], 'https://cdn.test/prefix/_next/static/build-123/_buildManifest.js');
  assert.equal(result.importMap.pkg, '/vendor/pkg.js');
});

test('imports, workers, escaped Flight references and sourcemaps', () => {
  const source = `import './one.mjs'; export * from './two.js'; import('./three.js');
    import 'react'; import 'pkg'; importScripts('worker-helper.js');
    new Worker(new URL('./worker.js', import.meta.url));
    self.__next_f.push([1, '4:["static/chunks/app/page.js"]']);
    //# sourceMappingURL=entry.js.map`;
  const result = extractJs(source, 'https://app.test/_next/static/chunks/entry.js', {
    importMap: { pkg: 'https://app.test/vendor/pkg.js' }
  });
  const urls = new Set(result.references.map(r => r.url));
  for (const name of ['one.mjs', 'two.js', 'three.js', 'worker.js', 'worker-helper.js']) {
    assert.ok(urls.has(`https://app.test/_next/static/chunks/${name}`), name);
  }
  assert.ok(urls.has('https://app.test/_next/static/chunks/app/page.js'));
  assert.ok(urls.has('https://app.test/vendor/pkg.js'));
  assert.ok(!urls.has('https://app.test/_next/static/chunks/react'));
  assert.deepEqual(result.maps, ['entry.js.map']);
});

test('Webpack filename maps and special-case chunk IDs resolve without eval', () => {
  const source = `(()=>{var r={};r.p='/base/_next/';r.u=e=>
    e===7?'static/chunks/special.js':'static/chunks/'+e+'.'+{42:'abc',99:'def'}[e]+'.js';})();`;
  const result = extractJs(source, 'https://app.test/base/_next/static/chunks/webpack.js');
  const urls = result.references.filter(r => r.via === 'webpack-runtime').map(r => r.url);
  assert.deepEqual(new Set(urls), new Set([
    'https://app.test/base/_next/static/chunks/42.abc.js',
    'https://app.test/base/_next/static/chunks/99.def.js',
    'https://app.test/base/_next/static/chunks/special.js'
  ]));
  assert.ok(!result.references.some(r => r.url.endsWith('/.js')));
});

test('unsupported filename functions are reported without executing code', () => {
  globalThis.collectorWasExecuted = false;
  const result = extractJs(`r.u=e=>{globalThis.collectorWasExecuted=true;return {1:'x'}[e]+'.js'}`, 'https://app.test/runtime.js');
  assert.equal(globalThis.collectorWasExecuted, false);
  assert.ok(result.warnings.some(w => w.includes('not resolved')));
  delete globalThis.collectorWasExecuted;
});

test('Next base paths and common Vite/Turbopack dependency paths are retained', () => {
  const html = extractHtml(`<script src="/base/_next/static/chunks/main.js"></script>
    <script id="__NEXT_DATA__" type="application/json">{"buildId":"abc"}</script>`, 'https://app.test/base/route');
  assert.equal(html.manifests[0], 'https://app.test/base/_next/static/abc/_buildManifest.js');
  const vite = extractJs('const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/lazy-hash.js"])))=>i.map(i=>d[i]);', 'https://app.test/base/assets/main.js');
  assert.ok(vite.references.some(r => r.url === 'https://app.test/base/assets/lazy-hash.js'));
  assert.ok(!vite.references.some(r => r.url.includes('/assets/assets/')));
  const turbo = extractJs('globalThis.TURBOPACK.push(["static/chunks/lazy.js",123]);', 'https://app.test/base/_next/static/chunks/main.js');
  assert.ok(turbo.references.some(r => r.url === 'https://app.test/base/_next/static/chunks/lazy.js'));
});

test('inline JSON is parsed as data and login signals omit field values', () => {
  const data = extractJs('{"file":"./lazy.js","value":42}', 'https://app.test/', { parseAst: false });
  assert.equal(data.warnings.length, 0);
  assert.ok(data.references.some(r => r.url === 'https://app.test/lazy.js'));
  const html = extractHtml('<title>Login</title><form method="post" action="/session"><input type="password" value="private"></form>', 'https://app.test/login');
  assert.equal(html.signals.passwordFields, 1);
  assert.equal(html.signals.forms[0].method, 'POST');
  assert.ok(!JSON.stringify(html.signals).includes('private'));
});

test('discovery rejects minified-code fragments and configuration filenames while retaining script assignments', () => {
  const source = `var message='next.config.js'; var name='_clientMiddlewareManifest.js';
    var snippet='//i,i=720,l=l&&l*e)}return{width:i,height:l}})(s,t);return(0,l.js';
    script.src='real.js'; script.setAttribute('src','other.mjs');`;
  const urls = new Set(extractJs(source, 'https://app.test/main.js').references.map(r => r.url));
  assert.deepEqual(urls, new Set(['https://app.test/real.js', 'https://app.test/other.mjs']));
});

test('exact origins, scheme, ports, credentials and excludes are enforced', () => {
  const scope = new Scope('https://app.test/start', {
    origins: ['https://login.test'], assetOrigins: ['https://cdn.test:8443'], excludes: ['/logout', '\\?delete=']
  });
  assert.equal(scope.allows('https://app.test/main.js'), true);
  assert.equal(scope.allows('https://sub.app.test/main.js'), false);
  assert.equal(scope.allows('http://app.test/main.js'), false);
  assert.equal(scope.allows('https://app.test:8443/main.js'), false);
  assert.equal(scope.allows('https://app.test.evil.test/main.js'), false);
  assert.equal(scope.allows('https://cdn.test:8443/main.js'), true);
  assert.equal(scope.allows('https://cdn.test:8443/page', 'page'), false);
  assert.equal(scope.allows('https://app.test/logout'), false);
  assert.equal(scope.allows('https://name:pass@app.test/main.js'), false);
  assert.equal(normalizeUrl('data:text/javascript,x'), null);
  assert.equal(normalizeUrl(null, 'https://app.test/'), null);
  assert.equal(normalizeUrl('/a.js#fragment', 'https://app.test/'), 'https://app.test/a.js');
});

test('concurrent producers share the request budget and spacing', async () => {
  const budget = new Budget({ delay: 15, maxRequests: 3, duration: 10 });
  const times = [];
  const results = await Promise.allSettled(Array.from({ length: 5 }, async () => {
    await budget.take(); times.push(Date.now());
  }));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.ok(times[1] - times[0] >= 12);
  assert.ok(times[2] - times[1] >= 12);
  assert.equal(budget.reason, 'request limit reached');
});
