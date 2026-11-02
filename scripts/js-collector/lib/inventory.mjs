import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hash } from './store.mjs';
import { authKind } from './auth.mjs';
import { normalizeUrl } from './scope.mjs';

const scriptKinds = new Set(['script', 'inline-script', 'inline-handler']);
const md = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('\\', '\\\\').replace(/([\[\]()*_!#])/g, '\\$1').replace(/[\r\n|`]/g, ' ').slice(0, 1200);

export function buildInventory({ pages, assets, edges, calls, network, scope, auth, session = {} }) {
  const assetById = new Map(assets.map(r => [r.id, r]));
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.parent)) outgoing.set(edge.parent, []);
    outgoing.get(edge.parent).push(edge);
  }
  const pageList = pages.map(record => {
    const seen = new Set(), dependencies = new Set(), queue = [record.id];
    while (queue.length) {
      const id = queue.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of outgoing.get(id) || []) {
        const target = assetById.get(edge.target);
        if (target && scriptKinds.has(target.kind)) { dependencies.add(target.id); queue.push(target.id); }
        else if (['browser-redirect', 'http-redirect'].includes(edge.via)) queue.push(edge.target);
      }
    }
    const direct = (outgoing.get(record.id) || []).filter(e => scriptKinds.has(assetById.get(e.target)?.kind)).map(e => e.target);
    const type = authKind(record.finalUrl || record.url, record.signals) || (record.state === 'redirect' ? 'redirect' : 'page-unclassified');
    const observed = network.filter(n => record.path && ['fetch', 'xhr'].includes(n.resourceType) && n.pageUrl === (record.finalUrl || record.url))
      .map(n => ({ method: n.method, url: n.url, status: n.status, evidence: 'observed-browser-request' }));
    const inferred = calls.filter(c => dependencies.has(c.sourceId)).map(c => {
      const url = c.url || normalizeUrl(c.rawUrl, record.baseUrl || record.finalUrl || record.url);
      return { ...c, url, resolvedForPage: record.id, inScope: !!url && scope.allows(url, 'page') };
    });
    return { id: record.id, url: record.url, finalUrl: record.finalUrl || record.url, type, status: record.status,
      state: record.state, depth: record.depth, htmlPath: record.path || null, title: record.signals?.title || '',
      description: record.signals?.description || '', headings: record.signals?.headings || [],
      forms: record.signals?.forms || [], links: record.links || [],
      directScripts: [...new Set(direct)], relatedScripts: [...dependencies],
      observedCalls: observed, inferredCalls: inferred,
      note: 'Page role and static calls are evidence-based hints. They do not prove server behavior, authentication or a vulnerability.' };
  });
  const scripts = assets.filter(r => scriptKinds.has(r.kind)).map(record => ({
    id: record.id, url: record.url, kind: record.kind, state: record.state, path: record.path || null,
    sha256: record.sha256, bytes: record.bytes,
    dependsOn: [...new Set((outgoing.get(record.id) || []).filter(e => ['module-import', 'dynamic-import', 'worker-import', 'worker-or-url'].includes(e.via) && scriptKinds.has(assetById.get(e.target)?.kind)).map(e => e.target))],
    references: [...new Set((outgoing.get(record.id) || []).filter(e => scriptKinds.has(assetById.get(e.target)?.kind)).map(e => e.target))],
    usedByPages: pageList.filter(p => p.htmlPath && p.directScripts.includes(record.id)).map(p => p.id),
    referencedByPages: pageList.filter(p => p.htmlPath && p.relatedScripts.includes(record.id)).map(p => p.id),
    observedByPages: pageList.filter(p => p.htmlPath && (outgoing.get(p.id) || []).some(e => e.target === record.id && e.via === 'browser-response')).map(p => p.id),
    calls: calls.filter(c => c.sourceId === record.id), warnings: record.parseWarnings || []
  }));
  const graphEdges = [...edges, ...pageList.flatMap(p => p.inferredCalls.filter(c => c.url).map(c => ({
    parent: c.sourceId, target: c.url, via: `page-resolved-call:${c.method}`, page: p.id, evidence: c.evidence
  })))];
  const nodes = new Map([...pageList.map(p => ({ id: p.id, kind: 'page', state: p.state })),
    ...assets.map(s => ({ id: s.id, kind: s.kind, state: s.state }))].map(n => [n.id, n]));
  for (const edge of graphEdges) for (const id of [edge.parent, edge.target]) {
    if (id && !nodes.has(id)) nodes.set(id, { id, kind: 'reference', state: scope.allows(id) ? 'not-fetched' : 'outside-scope' });
  }
  const contentGroups = new Map();
  for (const script of scripts) if (script.sha256) {
    if (!contentGroups.has(script.sha256)) contentGroups.set(script.sha256, { sha256: script.sha256, path: script.path, scriptIds: [], pageIds: new Set() });
    const group = contentGroups.get(script.sha256); group.scriptIds.push(script.id);
    for (const page of script.usedByPages) group.pageIds.add(page);
  }
  return { version: 1, scope: scope.describe(), authentication: auth.describe(), session, pages: pageList, scripts,
    sharedContent: [...contentGroups.values()].filter(g => g.scriptIds.length > 1).map(g => ({ ...g, pageIds: [...g.pageIds] })),
    legend: { usedByPages: 'Declared directly by HTML/inline code or observed by the browser; does not prove execution.',
      referencedByPages: 'Transitive references, including manifest catalogs and conditional chunks; not necessarily loaded.',
      observedByPages: 'Script responses actually observed from this page in this run.',
      dependsOn: 'Literal module/worker dependencies; conditional imports may not execute.',
      staticCalls: 'Inferred possible calls. Relative browser URLs are resolved for each document base; worker/dynamic contexts may differ.' },
    sharedScripts: scripts.filter(s => s.usedByPages.length > 1).map(s => s.id),
    counts: { pages: pageList.length, scripts: scripts.length, staticCalls: calls.length,
      observedCalls: pageList.reduce((n, p) => n + p.observedCalls.length, 0) },
    graph: { nodes: [...nodes.values()], edges: graphEdges } };
}

export function renderInventory(inventory) {
  const data = JSON.stringify(inventory).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'">
<title>Collection inventory</title><style>
body{font:16px system-ui;margin:0;background:#f5f4ef;color:#202828}main{max-width:1150px;margin:auto;padding:32px}h1{margin:0}p{line-height:1.5}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #adb8b2;border-radius:6px;background:white}article{background:white;border:1px solid #d6dcd7;padding:22px;margin:18px 0;border-radius:7px}code{font-size:13px;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600;margin:12px 0}li{margin:7px 0;overflow-wrap:anywhere}.badge{font-size:12px;padding:4px 7px;background:#e7eee9;border-radius:4px}.hint{color:#53605b}aside{border-left:4px solid #b86d22;padding:15px;background:#fff5e5}a{color:#156352}h2{font-size:20px;margin-top:0}</style>
<main><h1>Page &amp; script inventory</h1><p class="hint">Offline report. Static code references and observed requests are labeled separately. Opening this report makes no target requests.</p><p class="hint">Direct scripts are declared or observed for a page. Referenced trees also include manifest catalogs and conditional chunks, which may never load. A successful page response does not prove it is public or authenticated.</p>
<div id="auth"></div><p id="counts"></p><input id="filter" aria-label="Filter pages" placeholder="Filter by page, description, script, or endpoint"><div id="pages"></div></main>
<script type="application/json" id="inventory-data">${data}</script><script>
const data=JSON.parse(document.getElementById('inventory-data').textContent), scripts=new Map(data.scripts.map(s=>[s.id,s]));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=p=>p&&!p.includes('..')&&['pages','scripts','inline-script','inline-handler'].includes(p.split('/')[0])?'<a href="'+esc(p)+'" target="_blank" rel="noreferrer">local file</a>':'';
document.getElementById('counts').textContent=data.counts.pages+' page records · '+data.counts.scripts+' script records · '+data.sharedScripts.length+' shared scripts · '+data.counts.staticCalls+' static call references';
if(data.authentication.required)document.getElementById('auth').innerHTML='<aside><b>User session needed</b>'+data.authentication.requirements.map(r=>'<p>'+esc(r.action)+'<br><code>'+esc(r.loginUrl||r.protectedUrl||r.pageUrl)+'</code></p>').join('')+'</aside>';
function scriptList(ids){return '<ul>'+ids.map(id=>{const s=scripts.get(id);return '<li><code>'+esc(id)+'</code> '+local(s?.path)+'<br><small>'+esc(s?.kind)+' · directly declared/observed on '+esc(s?.usedByPages.length)+' page(s) · browser-observed on '+esc(s?.observedByPages.length)+' page(s)</small>'+(s?.references.length?'<details><summary>References ('+s.references.length+'), including '+s.dependsOn.length+' literal module/worker dependencies</summary><ul>'+s.references.map(ref=>'<li><code>'+esc(ref)+'</code> '+local(scripts.get(ref)?.path)+'</li>').join('')+'</ul></details>':'')+'</li>'}).join('')+'</ul>'}
function render(){
 const q=document.getElementById('filter').value.toLowerCase();
 document.getElementById('pages').innerHTML=data.pages.filter(p=>JSON.stringify(p).toLowerCase().includes(q)).map(p=>{
  const indirect=p.relatedScripts.filter(id=>!p.directScripts.includes(id));
  return '<article><h2>'+esc(p.title||p.url)+'</h2><span class="badge">'+esc(p.type)+' · '+esc(p.state)+' · '+esc(p.status||'—')+'</span><p><code>'+esc(p.url)+'</code> '+local(p.htmlPath)+'</p><p>'+esc(p.description)+'</p>'+
   '<details><summary>Forms ('+p.forms.length+')</summary><ul>'+p.forms.map(f=>'<li><code>'+esc(f.method)+' '+esc(f.action)+'</code><br>Fields: '+f.fields.map(x=>esc(x.name||x.type)+' ['+esc(x.type)+']').join(', ')+'</li>').join('')+'</ul></details>'+
   '<details><summary>Direct scripts: declared or observed ('+p.directScripts.length+')</summary>'+scriptList(p.directScripts)+'</details>'+
   '<details><summary>Indirect references / catalog chunks ('+indirect.length+')</summary><p class="hint">These references may describe unvisited routes and conditional code; they were not necessarily loaded.</p>'+scriptList(indirect)+'</details>'+
   '<details><summary>Observed fetch/XHR ('+p.observedCalls.length+')</summary><ul>'+p.observedCalls.map(c=>'<li><code>'+esc(c.method)+' '+esc(c.url)+' → '+esc(c.status)+'</code></li>').join('')+'</ul></details>'+
   '<details><summary>Static call references ('+p.inferredCalls.length+')</summary><p class="hint">Possible calls from the referenced script tree, including catalogs. These endpoints were not fetched merely because the parser found them.</p><ul>'+p.inferredCalls.map(c=>'<li><code>'+esc(c.method)+' '+esc(c.url||c.rawUrl)+'</code><br><small>Source: '+esc(c.sourceId)+'</small> '+local(scripts.get(c.sourceId)?.path)+'</li>').join('')+'</ul></details></article>';
 }).join('');
}
document.getElementById('filter').addEventListener('input',render);render();</script></html>`;
}

export async function writeInventory(store, inventory) {
  await store.json('inventory.json', inventory);
  await writeFile(path.join(store.root, 'inventory.html'), renderInventory(inventory));
  await mkdir(path.join(store.root, 'page-index'), { recursive: true });
  const lines = ['# Page and script inventory', '', `${inventory.counts.pages} page records, ${inventory.counts.scripts} script records.`, '',
    'Open inventory.html for the searchable offline view. inventory.json contains the full relationships.', ''];
  for (const p of inventory.pages) {
    const file = `page-index/${hash(p.id).slice(0, 20)}.json`;
    await store.json(file, p);
    lines.push(`## ${md(p.title || p.url)}`, '', `URL: ${md(p.url)}`, '',
      `Role: ${p.type}. HTTP: ${p.status || 'unknown'}. State: ${p.state}.`, '',
      md(p.description), '', `HTML: ${p.htmlPath || 'not saved'}. Details: ${file}.`, '',
      `Direct script references: ${p.directScripts.length}; related scripts including dependencies: ${p.relatedScripts.length}.`, '',
      `Observed fetch/XHR calls: ${p.observedCalls.length}; static call references: ${p.inferredCalls.length}.`, '');
    for (const f of p.forms) lines.push(`- Form: ${md(f.method)} ${md(f.action)}; fields: ${(f.fields || []).map(x => md(`${x.name || '(unnamed)'} [${x.type}]`)).join(', ')}`);
  }
  await writeFile(path.join(store.root, 'INVENTORY.md'), lines.join('\n') + '\n');
}
