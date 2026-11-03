import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectJavaScript, analyzeRun } from '../lib/analyze.mjs';

test('offline inspection maps imports, exports, endpoints and review cues without evaluation', () => {
  delete globalThis.analysisExecuted;
  const result = inspectJavaScript(`
    import { api as request } from './client.js';
    export function run() { request('/api/items'); }
    window.addEventListener('message', event => consume(event.data));
    target.innerHTML = location.search;
    globalThis.analysisExecuted = true;
  `, 'https://cdn.example.test/assets/main.js');
  assert.equal(globalThis.analysisExecuted, undefined);
  assert.equal(result.imports[0].target, 'https://cdn.example.test/assets/client.js');
  assert.ok(result.exports.some(item => item.exported === 'run' && item.definition));
  assert.ok(result.endpoints.some(item => item.path === '/api/items'));
  assert.ok(result.cues.some(item => item.kind === 'message-listener'));
  assert.ok(result.cues.some(item => item.kind === 'html-sink'));
});

test('run analysis verifies hashes, formats modules and refuses output overwrite', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'js-analysis-test-'));
  const run = path.join(temporary, 'run'), out = path.join(temporary, 'analysis');
  await mkdir(path.join(run, 'scripts'), { recursive: true });
  const source = `export const endpoint='/api/health';`;
  const digest = createHash('sha256').update(source).digest('hex');
  await writeFile(path.join(run, 'scripts', 'main.js'), source);
  await writeFile(path.join(run, 'manifest.json'), JSON.stringify({ seed: 'https://app.example.test/', outcome: 'collected',
    authentication: { required: false }, coverage: 'fixture' }));
  await writeFile(path.join(run, 'assets.jsonl'), JSON.stringify({ id: 'https://cdn.example.test/main.js',
    url: 'https://cdn.example.test/main.js', kind: 'script', state: 'saved', path: 'scripts/main.js', sha256: digest, bytes: source.length }) + '\n');
  for (const name of ['pages.jsonl', 'discovery.jsonl']) await writeFile(path.join(run, name), '');
  const result = await analyzeRun(run, out);
  assert.deepEqual(result.counts.modules, 1);
  const moduleName = createHash('sha256').update('https://cdn.example.test/main.js').digest('hex').slice(0, 20);
  assert.match(await readFile(path.join(out, 'modules', `${moduleName}.js`), 'utf8'), /endpoint = "\/api\/health"/);
  const endpointSummary = JSON.parse(await readFile(path.join(out, 'endpoint-summary.json'), 'utf8'));
  assert.equal(endpointSummary.find(item => item.path === '/api/health').references, 1);
  await assert.rejects(analyzeRun(run, out), /exist/i);
});
