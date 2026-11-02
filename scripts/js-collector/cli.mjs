#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Collector, defaults } from './lib/collector.mjs';

const help = `js-collect — scoped client-side JavaScript collection

Usage: node scripts/js-collector/cli.mjs <url> [options]

  --out DIR                 New output directory (default: recon/js/<host>-<time>)
  --mode hybrid|static      Browser + recursive downloads, or HTTP only (default hybrid)
  --origin ORIGIN           Additional exact page origin; repeatable
  --asset-origin ORIGIN     Additional exact asset/CDN origin; repeatable
  --exclude REGEX           Exclude matching URLs; repeatable
  --seeds FILE              URL list or Katana JSONL discoveries; repeatable
  --headers-file FILE       JSON header object; attached only to the seed origin
  --storage-state FILE      Playwright storage-state JSON (cookies and browser storage)
  --save-storage-state FILE Save updated browser session to a new private JSON file
  --session-flow FILE       Explicit navigate/click/fill/wait steps before collection
  --allow-post-url REGEX    Allow POST only to scoped matching URLs; repeatable
  --researcher HANDLE       Public X-Intigriti-Username header on every approved origin
  --auth-policy stop|record Pause page traversal for user login (default stop)
  --auth-path PATH          Explicit known auth entry path; repeatable, never guessed
  --headed                  Show browser
  --manual-seconds N        Show browser for manual navigation, then HTTP collection
  --depth N                 Link depth (default 2)
  --max-pages N             Page discovery limit (default 25)
  --max-assets N            External asset limit; also inline-entry limit (default 1000)
  --max-requests N          Shared browser/HTTP request budget (default 2000)
  --delay MS                Minimum spacing between request starts (default 500)
  --duration SECONDS        Request scheduling window (default 300)
  --timeout MS              Per-request/navigation timeout (default 20000)
  --settle MS               Browser observation window per page (default 1500)
  --max-bytes N             Per-file size limit (default 20971520)
  --max-total-bytes N       Saved content budget (default 209715200)
  --max-sources N           Embedded source-map entry limit (default 5000)
  --no-source-maps          Skip source-map collection
  --help                    Show this help

Exact origins include scheme and port. No subdomains or CDNs are implicitly allowed.
Default browser mode requires: npm --prefix scripts/js-collector run browser:install
`;

async function main() {
  const strings = ['out', 'mode', 'headers-file', 'storage-state', 'save-storage-state', 'session-flow', 'researcher', 'auth-policy', 'manual-seconds', 'depth',
    'max-pages', 'max-assets', 'max-requests', 'delay', 'duration', 'timeout', 'settle',
    'max-bytes', 'max-total-bytes', 'max-sources'];
  const options = Object.fromEntries(strings.map(name => [name, { type: 'string' }]));
  for (const name of ['origin', 'asset-origin', 'exclude', 'seeds', 'allow-post-url', 'auth-path']) options[name] = { type: 'string', multiple: true };
  for (const name of ['help', 'headed', 'no-source-maps']) options[name] = { type: 'boolean' };
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (values.help) { console.log(help); return; }
  if (positionals.length !== 1) throw new Error('Provide one starting URL. Use --help for usage.');
  const config = { url: positionals[0], mode: values.mode || defaults.mode,
    origins: values.origin || [], assetOrigins: values['asset-origin'] || [],
    excludes: values.exclude || [], seeds: values.seeds || [],
    headed: !!values.headed, sourceMaps: !values['no-source-maps'], storageState: values['storage-state'],
    saveStorageState: values['save-storage-state'], sessionFlow: values['session-flow'],
    postUrls: values['allow-post-url'] || [], researcher: values.researcher,
    authPolicy: values['auth-policy'] || 'stop', authPaths: values['auth-path'] || [] };
  if (config.researcher && !/^[\w.-]+$/.test(config.researcher)) throw new Error('Invalid researcher handle');
  if (!['hybrid', 'static'].includes(config.mode)) throw new Error('--mode must be hybrid or static');
  const numeric = { 'manual-seconds': 'manualSeconds', depth: 'depth', 'max-pages': 'maxPages',
    'max-assets': 'maxAssets', 'max-requests': 'maxRequests', delay: 'delay', duration: 'duration',
    timeout: 'timeout', settle: 'settle', 'max-bytes': 'maxBytes', 'max-total-bytes': 'maxTotalBytes', 'max-sources': 'maxSources' };
  for (const [flag, key] of Object.entries(numeric)) {
    if (values[flag] === undefined) continue;
    const value = Number(values[flag]);
    const zeroAllowed = ['depth', 'settle', 'manualSeconds'].includes(key);
    if (!Number.isSafeInteger(value) || value < (zeroAllowed ? 0 : 1)) throw new Error(`--${flag} must be ${zeroAllowed ? 'a nonnegative' : 'a positive'} integer`);
    config[key] = value;
  }
  if (config.manualSeconds && config.mode !== 'hybrid') throw new Error('--manual-seconds requires hybrid mode');
  if ((config.sessionFlow || config.saveStorageState) && config.mode !== 'hybrid') throw new Error('Session flows and export require hybrid mode');
  if (values['headers-file']) {
    const headers = JSON.parse(await readFile(values['headers-file'], 'utf8'));
    if (!headers || Array.isArray(headers) || typeof headers !== 'object') throw new Error('Headers file must be a JSON object');
    config.headers = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string' || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n]/.test(value)) throw new Error(`Invalid header: ${key}`);
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) throw new Error(`Unsupported header override: ${key}`);
      config.headers[key.toLowerCase()] = value;
    }
  }
  const host = new URL(config.url).hostname.replace(/[^\w.-]/g, '_');
  config.out = path.resolve(values.out || `recon/js/${host}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const collector = new Collector(config);
  console.log(`Collecting ${collector.scope.seed} (${config.mode})\nOutput: ${config.out}`);
  const result = await collector.run();
  console.log(`Outcome: ${result.outcome}. Saved ${result.savedScripts} script records (${result.uniqueFiles} unique files); ${result.requests} requests; stop: ${result.stopReason}.`);
  console.log('Coverage and errors: manifest.json, assets.jsonl, pages.jsonl, skipped.jsonl');
  console.log('Relationships: inventory.html, inventory.json, INVENTORY.md, page-index/');
  if (result.authentication.paused) {
    console.log('USER ACTION REQUIRED: Complete normal login/consent with your own authorized account and provide a local saved browser session (--storage-state). Do not paste passwords or session tokens into chat. See AUTH-REQUIRED.md; protected traversal is paused.');
    process.exitCode = 3;
  } else if (!result.savedScripts) process.exitCode = 2;
}

main().catch(error => {
  console.error(`js-collect: ${error.message}`);
  process.exitCode = 1;
});
