#!/usr/bin/env node
import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { allowedPublicPath, contentProblems } from './check-public-files.mjs';

const help = `Export the tool without research files or Git history.
Usage: node scripts/export-tool.mjs --out NEW_DIRECTORY
  --out DIR   Required new destination directory; never overwritten
  --help      Show this help
`;
try {
  const { values } = parseArgs({ options: { out: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log(help);
  else {
    if (!values.out) throw new Error('--out is required');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), files = [];
    async function collect(folder) {
      for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
        const file = path.posix.join(folder, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && ['scripts', 'scripts/js-collector', 'scripts/js-collector/lib', 'scripts/js-collector/test', 'scripts/js-collector/examples'].includes(file)) await collect(file);
        else if (entry.isFile() && allowedPublicPath(file)) files.push(file);
      }
    }
    await collect('');
    for (const file of files) {
      const problems = contentProblems(await readFile(path.join(root, file), 'utf8'));
      if (problems.length) throw new Error(`${file}: ${problems.join(', ')}`);
    }
    const out = path.resolve(values.out);
    await mkdir(path.dirname(out), { recursive: true });
    await mkdir(out);
    for (const file of files) {
      const destination = path.join(out, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(root, file), destination);
    }
    console.log(`Exported ${files.length} public tool files to ${out}. No Git history, captures, account state or program files included.`);
  }
} catch (error) { console.error(`export-tool: ${error.message}`); process.exitCode = 1; }
