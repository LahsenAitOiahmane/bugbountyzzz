import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { format } from 'prettier';

const sha = value => createHash('sha256').update(value).digest('hex');
const member = n => n?.type === 'MemberExpression' ? (n.computed ? literal(n.property) : n.property.name) : null;
const name = n => n?.type === 'Identifier' ? n.name : n?.type === 'MemberExpression' ? `${name(n.object)}.${member(n) || '[computed]'}` : '';
const key = n => n?.computed ? literal(n.key) : n?.key?.name ?? n?.key?.value;
const fn = n => /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n?.type || '');
export function literal(n, steps = 0) {
  if (!n || steps > 20) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const left = literal(n.left, steps + 1), right = literal(n.right, steps + 1);
    return left !== null && right !== null && left.length + right.length <= 8192 ? left + right : null;
  }
  if (n.type === 'TemplateLiteral') return n.quasis.reduce((s, q, i) => s + q.value.cooked +
    (i < n.expressions.length ? literal(n.expressions[i], steps + 1) ?? '{dynamic}' : ''), '').slice(0, 8192);
  return null;
}
const location = n => ({ start: n.start, end: n.end, line: n.loc.start.line, column: n.loc.start.column + 1 });
const resolve = (ref, base) => { try { return /^(?:\.{0,2}\/|https?:\/\/)/.test(ref) ? new URL(ref, base).href : null; } catch { return null; } };
const isPath = s => typeof s === 'string' && s.length < 2048 && /^\/(?!\/)[\w/:%{}?.=&@+*,-]*$/.test(s) &&
  !/\.(?:js|css|svg|png|gif|jpg|woff2?|map)(?:[?#]|$)/i.test(s);

// Syntax review only. No downloaded code, imports, config, eval or VM is executed.
export function inspectJavaScript(source, url) {
  const output = { imports: [], exports: [], endpoints: [], routes: [], calls: [], cues: [], decodedStrings: [], warnings: [] };
  let ast;
  try { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (error) { output.warnings.push(`Parse failed: ${error.message}`); return output; }
  const snippet = n => source.slice(n.start, Math.min(n.end, n.start + 700));
  const cue = (kind, n, details = {}) => output.cues.push({ kind, ...location(n), snippet: snippet(n), ...details, status: 'review-cue-not-a-finding' });
  const context = ancestors => {
    for (let i = ancestors.length - 2; i >= 0; i--) {
      const n = ancestors[i], parent = ancestors[i - 1];
      if (fn(n)) return { function: n.id?.name || (parent?.type === 'VariableDeclarator' ? parent.id?.name : key(parent)) || '(anonymous)', functionStart: n.start };
    }
    return { function: '(module)', functionStart: 0 };
  };
  const binding = n => n.specifiers.map(s => ({ local: s.local?.name, imported: s.type === 'ImportDefaultSpecifier' ? 'default' :
    s.type === 'ImportNamespaceSpecifier' ? '*' : s.imported.name ?? s.imported.value }));
  walk.ancestor(ast, {
    ImportDeclaration(n) { output.imports.push({ kind: 'static', specifier: n.source.value, target: resolve(n.source.value, url), bindings: binding(n), ...location(n) }); },
    ImportExpression(n) { const value = literal(n.source); if (value) output.imports.push({ kind: 'dynamic', specifier: value,
      target: value.includes('{dynamic}') ? null : resolve(value, url), bindings: [], ...location(n) }); },
    ExportAllDeclaration(n) { output.imports.push({ kind: 'reexport-all', specifier: n.source.value, target: resolve(n.source.value, url), bindings: [], ...location(n) }); },
    ExportNamedDeclaration(n) {
      if (n.source) output.imports.push({ kind: 'reexport', specifier: n.source.value, target: resolve(n.source.value, url), bindings: [], ...location(n) });
      for (const s of n.specifiers) output.exports.push({ exported: s.exported.name ?? s.exported.value, local: s.local.name ?? s.local.value,
        from: n.source?.value || null, ...location(s) });
      if (n.declaration?.id) output.exports.push({ exported: n.declaration.id.name, local: n.declaration.id.name, ...location(n) });
      for (const d of n.declaration?.declarations || []) if (d.id.type === 'Identifier') output.exports.push({ exported: d.id.name, local: d.id.name, ...location(d) });
    },
    ExportDefaultDeclaration(n) { output.exports.push({ exported: 'default', local: n.declaration.name || n.declaration.id?.name || null, ...location(n) }); },
    Literal(n, ancestors) { if (typeof n.value === 'string') recordString(n.value, n, ancestors); },
    TemplateLiteral(n, ancestors) { const value = literal(n); if (value) recordString(value, n, ancestors); },
    BinaryExpression(n, ancestors) { if (n.operator === '+') { const value = literal(n); if (value) recordString(value, n, ancestors); } },
    AssignmentExpression(n) {
      const property = member(n.left), target = name(n.left);
      if (['innerHTML', 'outerHTML', 'srcdoc'].includes(property)) cue('html-sink', n, { target });
      if (/^(?:(?:window|document|self|globalThis)\.)?location(?:\.href)?$/.test(target)) cue('navigation-sink', n, { target });
      if (property === 'onmessage') cue('message-listener', n, { handler: snippet(n.right) });
      if (property === 'cookie') cue('cookie-write', n);
    },
    Property(n, ancestors) {
      if (key(n) === '__html') cue('react-html-sink', n);
      if (['path', 'to', 'href', 'redirectUri', 'redirect_uri'].includes(key(n))) {
        const value = literal(n.value);
        if (value && isPath(value)) output.routes.push({ path: value, via: `property:${key(n)}`, ...context(ancestors), ...location(n) });
      }
    },
    CallExpression(n, ancestors) {
      const callee = name(n.callee), property = member(n.callee), args = n.arguments;
      const ctx = context(ancestors);
      if (n.callee.type === 'Identifier' || n.callee.type === 'MemberExpression') output.calls.push({ callee, ...ctx, ...location(n) });
      if (callee === 'eval' || ['Function', 'setTimeout', 'setInterval'].includes(callee) && literal(args[0]) !== null) cue('dynamic-code', n, { callee });
      if (['write', 'writeln', 'insertAdjacentHTML', 'createContextualFragment'].includes(property)) cue('html-sink', n, { callee });
      if (['assign', 'replace', 'open'].includes(property) && /(?:location|window)\./.test(callee)) cue('navigation-sink', n, { callee });
      if (property === 'postMessage') cue('post-message-send', n, { targetOrigin: literal(args[1]) ?? '(dynamic/options)' });
      if (property === 'addEventListener' && literal(args[0]) === 'message') cue('message-listener', n, { handler: snippet(args[1]) });
      if (['getItem', 'setItem', 'removeItem'].includes(property) && /(?:localStorage|sessionStorage)/.test(callee)) cue('browser-storage', n,
        { operation: property, key: literal(args[0]) });
      if (['atob', 'decodeURIComponent'].includes(callee)) {
        const value = literal(args[0]);
        if (value !== null && value.length <= 16384) {
          try {
            const decoded = callee === 'atob' ? Buffer.from(value, 'base64').toString('utf8') : decodeURIComponent(value);
            if (decoded && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) output.decodedStrings.push({ decoder: callee, decoded, ...location(n) });
          } catch { /* Keep original evidence if the literal cannot be decoded. */ }
        }
      }
      if (['fetch', 'axios'].includes(callee) || /\.(?:get|post|put|patch|delete|head|options|open)$/i.test(callee)) {
        const p = literal(args[0]), config = args.find(a => a.type === 'ObjectExpression');
        const methodProp = config?.properties.find(p => key(p) === 'method');
        const method = property && /^(?:get|post|put|patch|delete|head|options)$/i.test(property) ? property.toUpperCase() :
          literal(methodProp?.value)?.toUpperCase() || (callee === 'fetch' && !args[1] ? 'GET' : 'UNKNOWN');
        if (p && (isPath(p) || /^https?:\/\//.test(p))) output.endpoints.push({ path: p, method, via: 'call-shape', callee, ...ctx, ...location(n) });
      }
    },
    NewExpression(n) { if (name(n.callee) === 'Function') cue('dynamic-code', n, { callee: 'new Function' }); },
    MemberExpression(n) {
      const value = name(n);
      if (/\b(?:location\.(?:search|hash|href)|document\.(?:URL|referrer))$/.test(value)) cue('url-source', n, { expression: value });
    }
  });
  function recordString(value, n, ancestors) {
    if (/^\/(?:api|graphql)(?:\/|\?|$)/.test(value) || /^https?:\/\/[^\s<>]{1,2048}$/.test(value)) {
      const call = [...ancestors].reverse().find(a => a.type === 'CallExpression');
      output.endpoints.push({ path: value, method: 'UNKNOWN', via: 'string-reference', callee: call ? name(call.callee) : '', ...context(ancestors), ...location(n) });
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,})\b/.test(value)) {
      cue('credential-pattern', n, { caveat: 'May be an example, fixture or public identifier; no credential is validated.' });
    }
  }
  const top = new Map();
  for (const original of ast.body) {
    const n = original.declaration || original;
    if (n.type === 'FunctionDeclaration' && n.id) top.set(n.id.name, n);
    for (const d of n.declarations || []) if (d.id.type === 'Identifier') top.set(d.id.name, d);
  }
  for (const exported of output.exports) {
    const definition = top.get(exported.local);
    if (definition) exported.definition = { ...location(definition), snippet: snippet(definition) };
  }
  const unique = items => [...new Map(items.map(item => [JSON.stringify(item), item])).values()];
  output.endpoints = unique(output.endpoints);
  return output;
}

async function readRows(root, file, optional = false) {
  try { return (await readFile(path.join(root, file), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (optional && error.code === 'ENOENT') return []; throw error; }
}
async function containedFile(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid evidence path');
  const resolved = await realpath(path.resolve(root, relative));
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Evidence path escapes collection directory');
  return resolved;
}

export async function analyzeRun(input, out, { beautify = true, maxBytes = 20971520 } = {}) {
  const root = await realpath(input), output = path.resolve(out);
  if (output === root) throw new Error('Use a new analysis output directory');
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Refuse to overwrite earlier analysis.
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const records = [...await readRows(root, 'assets.jsonl'), ...await readRows(root, 'inline.jsonl', true)]
    .filter(a => a.state === 'saved' && ['script', 'inline-script', 'inline-handler', 'source'].includes(a.kind));
  const pages = await readRows(root, 'pages.jsonl', true);
  const discovery = await readRows(root, 'discovery.jsonl', true);
  const modules = [], parsed = new Map();
  await mkdir(path.join(output, 'modules'));
  for (const record of records) {
    const id = record.id || record.url;
    const module = { id, url: record.url, sourcePath: record.path, originalSha256: record.sha256,
      bytes: record.bytes, warnings: [], formattedPath: null };
    try {
      const file = await containedFile(root, record.path);
      const body = await readFile(file);
      if (body.length > maxBytes) throw new Error('Analysis per-file size limit exceeded');
      if (record.sha256 && sha(body) !== record.sha256) throw new Error('Original evidence hash mismatch');
      let source = body.toString('utf8');
      if (beautify) {
        try {
          source = await format(source, { parser: 'babel', printWidth: 110 });
          module.formattedPath = `modules/${sha(id).slice(0, 20)}.js`;
          await writeFile(path.join(output, module.formattedPath), source);
        } catch (error) { module.warnings.push(`Formatting failed; using original: ${error.message.slice(0, 180)}`); }
      }
      const detail = inspectJavaScript(source, record.url);
      Object.assign(module, { imports: detail.imports, exports: detail.exports, warnings: [...module.warnings, ...detail.warnings],
        counts: Object.fromEntries(['imports', 'exports', 'endpoints', 'routes', 'calls', 'cues', 'decodedStrings'].map(k => [k, detail[k].length])) });
      const reportPath = `modules/${sha(id).slice(0, 20)}.json`;
      module.reportPath = reportPath;
      await writeFile(path.join(output, reportPath), JSON.stringify({ ...module, ...detail, warnings: module.warnings }, null, 2) + '\n');
      parsed.set(id, detail);
    } catch (error) { module.warnings.push(error.message); }
    modules.push(module);
  }
  const byUrl = new Map(modules.map(m => [m.url, m]));
  const dependencies = modules.flatMap(m => (m.imports || []).map(i => ({ source: m.id, target: i.target, specifier: i.specifier,
    kind: i.kind, collected: byUrl.has(i.target), bindings: i.bindings, line: i.line })));
  const crossModuleCalls = [];
  const endpoints = [], routes = [], cues = [], decodedStrings = [];
  for (const m of modules) {
    const detail = parsed.get(m.id);
    if (!detail) continue;
    const imported = new Map(m.imports.flatMap(i => i.bindings.map(b => [b.local, { ...b, target: i.target }])));
    for (const call of detail.calls) {
      const binding = imported.get(call.callee);
      if (!binding) continue;
      const targetModule = byUrl.get(binding.target);
      const exported = targetModule?.exports.find(e => e.exported === binding.imported);
      crossModuleCalls.push({ source: m.id, ...call, target: targetModule?.id || binding.target, imported: binding.imported,
        targetLocal: exported?.local || null, targetDefinition: exported?.definition || null,
        evidence: 'syntactic-import-binding; lexical-shadowing-and-reexports-not-resolved' });
    }
    for (const [key, target] of [['endpoints', endpoints], ['routes', routes], ['cues', cues], ['decodedStrings', decodedStrings]]) {
      for (const row of detail[key]) target.push({ source: m.id, formattedPath: m.formattedPath, ...row });
    }
  }
  const counts = { modules: modules.length, analyzed: parsed.size, formatted: modules.filter(m => m.formattedPath).length,
    imports: dependencies.length, resolvedImports: dependencies.filter(d => d.collected).length, crossModuleCalls: crossModuleCalls.length,
    endpointReferences: endpoints.length, uniqueApiPaths: new Set(endpoints.filter(e => /^\/api\//.test(e.path)).map(e => e.path)).size,
    routes: routes.length, reviewCues: cues.length, decodedStrings: decodedStrings.length,
    warningModules: modules.filter(m => m.warnings.length).length };
  const endpointSummary = [...endpoints.reduce((index, row) => {
    const id = row.path;
    const item = index.get(id) || { path: id, methods: new Set(), sources: new Set(), references: 0 };
    item.methods.add(row.method);
    item.sources.add(row.source);
    item.references++;
    index.set(id, item);
    return index;
  }, new Map()).values()].map(item => ({ ...item, methods: [...item.methods].sort(), sources: [...item.sources].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const map = { version: 1, analysis: 'offline-syntax-review', sourceSeed: manifest.seed, counts,
    coverage: { outcome: manifest.outcome, authentication: manifest.authentication, collectionCoverage: manifest.coverage,
      caveat: 'Maps saved evidence only. References/cues are not executed, reachable data flow, confirmed vulnerabilities or complete application coverage.' },
    pages: pages.map(p => ({ url: p.url, path: p.path, scripts: p.scriptReferences || [] })), modules, dependencies,
    discoveryEdges: discovery, crossModuleCalls };
  for (const [file, data] of Object.entries({ 'map.json': map, 'endpoints.json': endpoints, 'endpoint-summary.json': endpointSummary, 'routes.json': routes,
    'review-cues.json': cues, 'decoded-strings.json': decodedStrings })) await writeFile(path.join(output, file), JSON.stringify(data, null, 2) + '\n');
  await writeFile(path.join(output, 'ANALYSIS.md'), ['# Offline JavaScript map', '',
    ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
    'All numbers describe the saved corpus. No target request or downloaded-code execution was performed.',
    'References and review cues require manual source-to-sink and runtime validation before reporting a vulnerability.',
    'Formatted files are derived views. Original bytes and hashes remain in the collection.',
    'Line/column/start/end coordinates refer to formatted files when formattedPath exists, otherwise original evidence.',
    'Syntactic cross-module calls can include shadowed identifiers and do not resolve reexport chains or computed calls.',
    'Endpoint strings are not proof of a reachable server endpoint, HTTP method or missing authorization. endpoint-summary.json groups references for review.',
    'Formatting and literal decoding do not recover original names or execute an obfuscator.',
    'Keep this analysis private under recon/; use map.html or map.json for dependency and page relationships.', ''
  ].join('\n'));
  await writeFile(path.join(output, 'map.html'), renderMap({ counts, modules, dependencies }));
  return { out: output, counts };
}

function renderMap(data) {
  const encoded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Offline JavaScript map</title>
<style>body{font:16px system-ui;max-width:1150px;margin:30px auto;padding:0 20px;background:#f5f7fa;color:#18232f}input{font:inherit;padding:10px;width:90%}article{background:white;padding:18px;margin:12px 0;border:1px solid #ccd5df;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#175baa}summary{cursor:pointer}</style>
<h1>Offline JavaScript map</h1><p>Saved modules and imports. All security cues require manual validation; this map makes no target requests.</p><p id="counts"></p><input id="filter" aria-label="Filter modules" placeholder="Filter by filename, URL or imported module"><main id="modules"></main><script>
const data=${encoded};const add=(p,t,s)=>{const e=document.createElement(t);e.textContent=s;p.appendChild(e);return e;};
document.querySelector('#counts').textContent=JSON.stringify(data.counts);function render(){const root=document.querySelector('#modules');root.replaceChildren();const q=document.querySelector('#filter').value.toLowerCase();for(const m of data.modules){const deps=data.dependencies.filter(d=>d.source===m.id);if(!JSON.stringify([m.url,deps]).toLowerCase().includes(q))continue;const a=add(root,'article','');add(a,'h2',m.url);add(a,'p',JSON.stringify(m.counts||{})+' '+m.warnings.join('; '));if(m.formattedPath){const link=add(a,'a','Formatted source');link.href=m.formattedPath;link.target='_blank';link.rel='noopener';}const report=add(a,'p','');const r=add(report,'a','Module JSON: endpoints, exports, cues and locations');r.href=m.reportPath||'#';r.target='_blank';r.rel='noopener';const d=add(a,'details','');add(d,'summary','Imports ('+deps.length+')');for(const dep of deps)add(d,'pre',(dep.collected?'[saved] ':'[unresolved] ')+dep.kind+' '+dep.specifier+' '+JSON.stringify(dep.bindings));}}document.querySelector('#filter').addEventListener('input',render);render();</script></html>`;
}
