import { parse as parseHtml } from 'parse5';
import { parse as parseJs } from 'acorn';
import * as walk from 'acorn-walk';
import { normalizeUrl } from './scope.mjs';

const JS_PATH = /\.(?:m?js|cjs)(?:[?#]|$)/i;
export const isJsUrl = value => JS_PATH.test(value);
export const isPageUrl = value => !/\.(?:m?js|cjs|css|json|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf|zip|mp4|webm|xml|txt)(?:[?#]|$)/i.test(value);
const executableType = type => !type || /(?:javascript|ecmascript|^module$)/i.test(type);

export function assetReference(value, base, publicPath) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  if (/^\.(?:m?js|cjs|map)$/.test(value)) return null;
  // Next manifests and Turbopack use paths relative to the Next public path.
  if (/^static\//.test(value) && (publicPath || base.includes('/_next/'))) {
    return normalizeUrl(value, publicPath || base.slice(0, base.indexOf('/_next/') + 7));
  }
  return normalizeUrl(value, base);
}

export function extractHtml(html, url) {
  const document = parseHtml(html);
  const nodes = [];
  function visit(node) {
    nodes.push(node);
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
  const attrs = node => Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
  const contentText = node => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(contentText).join(' ')).replace(/\s+/g, ' ').trim();
  const baseTag = nodes.find(n => n.tagName === 'base' && attrs(n).href);
  const base = normalizeUrl(baseTag && attrs(baseTag).href, url) || url;
  const nextScript = nodes.filter(n => n.tagName === 'script').map(n => normalizeUrl(attrs(n).src, base))
    .find(value => value?.includes('/_next/'));
  const nextPublicPath = nextScript ? nextScript.slice(0, nextScript.indexOf('/_next/') + 7) : null;
  const result = { base, scripts: [], links: [], linkDetails: [], inline: [], manifests: [], importMap: {},
    signals: { passwordFields: 0, forms: [], controls: [], headings: [], description: '', consentRoute: /consent|privacygate/i.test(new URL(url).pathname) } };
  for (const node of nodes) {
    const a = attrs(node);
    if (node.tagName === 'title') result.signals.title = (node.childNodes || []).map(n => n.value || '').join('');
    if (node.tagName === 'meta' && /^(?:description|og:description)$/i.test(a.name || a.property || '')) result.signals.description ||= (a.content || '').slice(0, 2000);
    if (/^h[1-3]$/.test(node.tagName || '') && result.signals.headings.length < 20) result.signals.headings.push(contentText(node).slice(0, 300));
    if (node.tagName === 'button' && result.signals.controls.length < 100) result.signals.controls.push({
      kind: 'button', type: a.type || 'submit', text: (a['aria-label'] || contentText(node)).slice(0, 300) });
    if (node.tagName === 'input' && a.type?.toLowerCase() === 'password') result.signals.passwordFields++;
    if (node.tagName === 'form' && result.signals.forms.length < 50) {
      const descendants = [];
      const collect = item => { descendants.push(item); for (const child of item.childNodes || []) collect(child); };
      collect(node);
      result.signals.forms.push({ action: normalizeUrl(a.action || url, base), method: (a.method || 'GET').toUpperCase(),
        fields: descendants.filter(n => ['input', 'select', 'textarea'].includes(n.tagName)).slice(0, 100).map(n => {
          const field = attrs(n);
          return { name: field.name || '', type: field.type || n.tagName, required: Object.hasOwn(field, 'required'), autocomplete: field.autocomplete || '' };
        }), buttons: descendants.filter(n => n.tagName === 'button').slice(0, 20).map(n => contentText(n).slice(0, 200)) });
    }
    if (node.tagName === 'script') {
      const content = (node.childNodes || []).map(n => n.value || '').join('');
      if (a.src) result.scripts.push({ value: a.src, via: 'script-src' });
      if (content.trim()) {
        result.inline.push({ content, type: a.type || 'text/javascript',
          kind: executableType(a.type) ? 'inline-script' : 'inline-data' });
        if (a.type === 'importmap') {
          try { Object.assign(result.importMap, JSON.parse(content).imports || {}); } catch { /* kept as raw data */ }
        }
        if (a.id === '__NEXT_DATA__') {
          try {
            const next = JSON.parse(content);
            if (typeof next.buildId === 'string' && /^[\w.-]+$/.test(next.buildId)) {
              const root = next.assetPrefix
                ? normalizeUrl(`${next.assetPrefix.replace(/\/$/, '')}/_next/`, url)
                : nextPublicPath || normalizeUrl('/_next/', url);
              for (const name of ['_buildManifest.js', '_ssgManifest.js']) {
                result.manifests.push(normalizeUrl(`static/${next.buildId}/${name}`, root));
              }
            }
          } catch { /* invalid Next data is still saved */ }
        }
      }
    }
    if (node.tagName === 'link' && a.href &&
        ((a.rel || '').split(/\s+/).includes('modulepreload') ||
         (/(?:^|\s)(?:preload|prefetch)(?:\s|$)/.test(a.rel || '') && (a.as === 'script' || isJsUrl(a.href))))) {
      result.scripts.push({ value: a.href, via: 'script-preload' });
    }
    if (['a', 'area'].includes(node.tagName) && a.href && !a.download) {
      const link = normalizeUrl(a.href, base);
      if (link && isPageUrl(link)) {
        result.links.push(link);
        result.linkDetails.push({ url: link, text: (a['aria-label'] || contentText(node) || a.title || '').slice(0, 300), kind: 'anchor' });
      }
    }
    if (['iframe', 'frame'].includes(node.tagName) && a.src) {
      const link = normalizeUrl(a.src, base);
      if (link) { result.links.push(link); result.linkDetails.push({ url: link, text: a.title || '', kind: 'frame' }); }
    }
    for (const [name, value] of Object.entries(a)) {
      if (/^on[a-z]+$/.test(name) && value.trim()) {
        result.inline.push({ kind: 'inline-handler', type: 'text/javascript', content: value });
      }
      if (/^(?:href|src|action)$/.test(name) && /^javascript:/i.test(value)) {
        result.inline.push({ kind: 'inline-handler', type: 'text/javascript', content: value.slice(11) });
      }
    }
  }
  return result;
}

// Interpret only a small expression subset used by Webpack filename functions.
// Never eval a downloaded bundle or run its functions in Node.
function expression(node, env, state) {
  if (!node || --state.steps < 0) throw new Error('unsupported runtime expression');
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier':
      if (Object.hasOwn(env, node.name)) return env[node.name];
      throw new Error('unknown runtime identifier');
    case 'ObjectExpression': {
      const value = Object.create(null);
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.method || p.kind !== 'init') throw new Error('unsupported object');
        const key = p.computed ? expression(p.key, env, state) : p.key.name ?? p.key.value;
        value[key] = expression(p.value, env, state);
      }
      return value;
    }
    case 'MemberExpression': {
      const object = expression(node.object, env, state);
      const key = node.computed ? expression(node.property, env, state) : node.property.name;
      if (!object || !Object.hasOwn(object, key)) return undefined;
      return object[key];
    }
    case 'ConditionalExpression': return expression(expression(node.test, env, state) ? node.consequent : node.alternate, env, state);
    case 'LogicalExpression': {
      const left = expression(node.left, env, state);
      if (node.operator === '||') return left || expression(node.right, env, state);
      if (node.operator === '&&') return left && expression(node.right, env, state);
      if (node.operator === '??') return left ?? expression(node.right, env, state);
      throw new Error('unsupported logical operator');
    }
    case 'BinaryExpression': {
      const a = expression(node.left, env, state), b = expression(node.right, env, state);
      switch (node.operator) {
        case '+': return a + b;
        case '-': return a - b;
        case '==': return a == b; // Webpack emits loose numeric comparisons.
        case '===': return a === b;
        case '!=': return a != b;
        case '!==': return a !== b;
        default: throw new Error('unsupported binary operator');
      }
    }
    case 'UnaryExpression': {
      const value = expression(node.argument, env, state);
      if (node.operator === '!') return !value;
      if (node.operator === '+') return +value;
      if (node.operator === '-') return -value;
      throw new Error('unsupported unary operator');
    }
    case 'TemplateLiteral': return node.quasis.reduce((s, q, i) => s + q.value.cooked +
      (i < node.expressions.length ? expression(node.expressions[i], env, state) : ''), '');
    default: throw new Error('unsupported runtime expression');
  }
}

function filename(fn, id) {
  if (fn.params.length !== 1 || fn.params[0].type !== 'Identifier') return null;
  const env = Object.create(null);
  env[fn.params[0].name] = /^\d+$/.test(id) ? Number(id) : id;
  const state = { steps: 10000 };
  function statement(node) {
    if (--state.steps < 0) throw new Error('runtime limit');
    if (node.type === 'ReturnStatement') return { value: expression(node.argument, env, state) };
    if (node.type === 'IfStatement') {
      const branch = expression(node.test, env, state) ? node.consequent : node.alternate;
      return branch ? statement(branch) : null;
    }
    if (node.type === 'BlockStatement') {
      for (const child of node.body) { const result = statement(child); if (result) return result; }
      return null;
    }
    if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (d.id.type !== 'Identifier') throw new Error('unsupported binding');
        env[d.id.name] = expression(d.init, env, state);
      }
      return null;
    }
    throw new Error('unsupported runtime statement');
  }
  try {
    const value = fn.body.type === 'BlockStatement' ? statement(fn.body)?.value : expression(fn.body, env, state);
    return typeof value === 'string' && isJsUrl(value) && !value.includes('undefined') ? value : null;
  } catch { return null; }
}

export function extractJs(source, url, { importMap = {}, publicPath, parseAst = true } = {}) {
  const references = [], maps = [], warnings = [], calls = [];
  const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value :
    node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : null;
  const property = (node, key) => node?.type === 'ObjectExpression' ? node.properties.find(p => p.type === 'Property' && (p.key.name ?? p.key.value) === key)?.value : null;
  const call = (value, method, via, node) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 8192) return;
    const target = normalizeUrl(value);
    if (!target && /^[a-z][\w+.-]*:/i.test(value)) return;
    if (calls.length < 5000) calls.push({ url: target, rawUrl: value,
      resolution: target ? 'absolute' : 'document-relative', method, via, evidence: 'inferred-static-call',
      start: node.start, end: node.end });
  };
  const viteBase = source.includes('__vite__mapDeps') && url.includes('/assets/')
    ? url.slice(0, url.indexOf('/assets/') + 1) : null;
  const add = (value, via) => {
    if (typeof value !== 'string') return;
    if (via === 'module-import' || via === 'dynamic-import') {
      const mapped = Object.keys(importMap).sort((a, b) => b.length - a.length)
        .find(key => key === value || (key.endsWith('/') && value.startsWith(key)));
      if (mapped) {
        const replacement = importMap[mapped];
        if (typeof replacement !== 'string') return;
        value = replacement + value.slice(mapped.length);
      } else if (!/^(?:\.{0,2}\/|https?:\/\/)/.test(value)) return;
    }
    const resolved = viteBase && value.startsWith('assets/') ? normalizeUrl(value, viteBase) : assetReference(value, url, publicPath);
    if (resolved) {
      const bundler = (viteBase && value.startsWith('assets/')) || /\/_next\/static\//.test(new URL(resolved).pathname) || /^static\/chunks\//.test(value);
      references.push({ url: resolved, via: bundler && ['js-string', 'js-literal', 'json-string'].includes(via) ? 'bundler-chunk-reference' : via });
    }
  };
  const text = source.replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/');
  // Flight payloads contain nested escaped strings; AST literals alone miss these.
  for (const match of text.matchAll(/(?:https?:\/\/|\/\/|\.?\.?\/|(?:_next\/)?static\/)[a-zA-Z0-9_$@~+.%:/()[\]-]{1,4096}?\.(?:m?js|cjs)(?:\?[^\s"'`<>\\]{0,2048})?/g)) {
    add(match[0], 'js-string');
  }
  for (const match of source.matchAll(/(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=\s*([^\s*]+)/g)) maps.push(match[1]);
  if (!parseAst) {
    try {
      const pending = [JSON.parse(source)];
      let count = 0;
      while (pending.length && count++ < 100000) {
        const value = pending.pop();
        if (typeof value === 'string' && isJsUrl(value) && !/[\s<>]/.test(value)) add(value, 'json-string');
        else if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push(child);
      }
      if (pending.length) warnings.push('Inline data traversal limit reached');
    } catch { /* Non-JavaScript script data is preserved without JS parse errors. */ }
    return { references, maps, warnings, calls };
  }
  let ast;
  try { ast = parseJs(source, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (error) { warnings.push(`JavaScript parse fallback: ${error.message}`); return { references, maps, warnings, calls }; }
  const runtimes = [], publicPaths = new Map();
  walk.simple(ast, {
    Literal(node) {
      if (typeof node.value === 'string' && isJsUrl(node.value) &&
          node.value.includes('/') && !/[\s<>]/.test(node.value) && !node.value.startsWith('data:')) add(node.value, 'js-literal');
    },
    ImportDeclaration(node) { if (node.source) add(node.source.value, 'module-import'); },
    ExportNamedDeclaration(node) { if (node.source) add(node.source.value, 'module-import'); },
    ExportAllDeclaration(node) { add(node.source.value, 'module-import'); },
    ImportExpression(node) { if (node.source.type === 'Literal') add(node.source.value, 'dynamic-import'); },
    CallExpression(node) {
      const name = node.callee.type === 'Identifier' ? node.callee.name : '';
      const member = node.callee.type === 'MemberExpression' ? (node.callee.computed ? node.callee.property.value : node.callee.property.name) : null;
      const owner = node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' ? node.callee.object.name : '';
      if (name === 'fetch' || (member === 'fetch' && ['window', 'globalThis', 'self'].includes(owner))) {
        const options = node.arguments[1];
        const methodNode = property(options, 'method');
        const method = literal(methodNode) || (methodNode ? 'UNKNOWN' : !options || options.type === 'ObjectExpression' ? 'GET' : 'UNKNOWN');
        call(literal(node.arguments[0]), method.toUpperCase(), 'fetch-literal', node);
      }
      if (owner === 'axios' && /^(?:get|post|put|patch|delete|head|options)$/i.test(member || '')) call(literal(node.arguments[0]), member.toUpperCase(), 'axios-literal', node);
      if (name === 'axios' && node.arguments[0]?.type === 'ObjectExpression') {
        const methodNode = property(node.arguments[0], 'method');
        call(literal(property(node.arguments[0], 'url')), (literal(methodNode) || (methodNode ? 'UNKNOWN' : 'GET')).toUpperCase(), 'axios-config-literal', node);
      }
      if (member === 'open' && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(literal(node.arguments[0]) || '')) call(literal(node.arguments[1]), literal(node.arguments[0]).toUpperCase(), 'xhr-like-open-literal', node);
      if (member === 'sendBeacon' && owner === 'navigator') call(literal(node.arguments[0]), 'POST', 'beacon-literal', node);
      if (name === 'importScripts') for (const arg of node.arguments) if (arg.type === 'Literal') add(arg.value, 'worker-import');
      if (node.callee.type === 'MemberExpression' && node.callee.property.name === 'setAttribute' &&
          node.arguments[0]?.value === 'src' && node.arguments[1]?.type === 'Literal' && isJsUrl(node.arguments[1].value)) {
        add(node.arguments[1].value, 'script-src-assignment');
      }
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier' && ['Worker', 'SharedWorker', 'URL'].includes(node.callee.name) &&
          node.arguments[0]?.type === 'Literal' && isJsUrl(node.arguments[0].value)) add(node.arguments[0].value, 'worker-or-url');
    },
    AssignmentExpression(node) {
      const left = node.left;
      if (left.type === 'MemberExpression' && (left.computed ? left.property.value : left.property.name) === 'src' &&
          node.right.type === 'Literal' && isJsUrl(node.right.value)) add(node.right.value, 'script-src-assignment');
      if (left.type !== 'MemberExpression' || left.object.type !== 'Identifier') return;
      const property = left.computed ? left.property.value : left.property.name;
      if (property === 'p' && node.right.type === 'Literal' && typeof node.right.value === 'string') {
        publicPaths.set(left.object.name, node.right.value);
      }
      if (property === 'u' && ['FunctionExpression', 'ArrowFunctionExpression'].includes(node.right.type)) {
        runtimes.push({ owner: left.object.name, fn: node.right });
      }
    }
  });
  for (const { owner, fn } of runtimes) {
    const ids = new Set();
    walk.simple(fn.body, {
      Property(node) {
        const key = node.key.name ?? node.key.value;
        if (key !== undefined && !node.computed) ids.add(String(key));
      },
      BinaryExpression(node) {
        if (!['==', '===', '!=', '!=='].includes(node.operator)) return;
        for (const n of [node.left, node.right]) if (n.type === 'Literal' && ['number', 'string'].includes(typeof n.value)) ids.add(String(n.value));
      }
    });
    if (ids.size > 5000) warnings.push('Webpack runtime candidate limit reached (5000)');
    let resolved = 0;
    for (const id of [...ids].slice(0, 5000)) {
      const path = filename(fn, id);
      if (!path) continue;
      let publicPath = publicPaths.get(owner);
      if (publicPath !== undefined) publicPath = normalizeUrl(publicPath || './', url);
      else if (url.includes('/_next/')) publicPath = url.slice(0, url.indexOf('/_next/') + 7);
      else publicPath = normalizeUrl('./', url);
      const value = normalizeUrl(path, publicPath);
      if (value) { references.push({ url: value, via: 'webpack-runtime' }); resolved++; }
    }
    if (!resolved) warnings.push('Webpack filename function found but not resolved; browser/manual coverage may help');
  }
  return { references, maps, warnings, calls };
}
