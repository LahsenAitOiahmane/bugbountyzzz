#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { analyzeRun } from './lib/analyze.mjs';

const help = `js-analyze — offline mapping and source review of a js-collect run

Usage: node scripts/js-collector/analyze.mjs <collection-directory> [options]

  --out DIR          New private output directory (default: <collection>/analysis-<time>)
  --no-beautify      Analyze original sources without derived formatted copies
  --max-bytes N      Per-file analysis limit (default: 20971520)
  --help             Show this help

No target requests, imported bundle execution or automatic vulnerability claims.
Outputs: map.html, map.json, modules/, endpoints.json, endpoint-summary.json, routes.json,
         review-cues.json, decoded-strings.json and ANALYSIS.md.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, 'max-bytes': { type: 'string' }, 'no-beautify': { type: 'boolean' }, help: { type: 'boolean' }
  } });
  if (values.help) console.log(help);
  else {
    if (positionals.length !== 1) throw new Error('Provide one collection directory. Use --help for usage.');
    const maxBytes = Number(values['max-bytes'] || 20971520);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('--max-bytes must be a positive integer');
    const out = path.resolve(values.out || path.join(positionals[0], `analysis-${new Date().toISOString().replace(/[:.]/g, '-')}`));
    const result = await analyzeRun(positionals[0], out, { beautify: !values['no-beautify'], maxBytes });
    console.log(`Offline analysis: ${result.out}\n${JSON.stringify(result.counts, null, 2)}`);
    if (result.counts.analyzed !== result.counts.modules || result.counts.warningModules) process.exitCode = 2;
  }
} catch (error) { console.error(`js-analyze: ${error.message}`); process.exitCode = 1; }
