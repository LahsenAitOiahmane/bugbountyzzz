#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function allowedPublicPath(file) {
  return ['README.md', '.gitignore', '.gitattributes', 'scripts/check-public-files.mjs', 'scripts/export-tool.mjs'].includes(file) ||
    /^scripts\/js-collector\/(?:README\.md|(?:cli|analyze)\.mjs|package(?:-lock)?\.json|examples\/session-flow\.json|lib\/[a-z-]+\.mjs|test\/[a-z-]+\.test\.mjs)$/.test(file);
}
export function contentProblems(text) {
  const problems = [];
  if (/[A-Z]:[\\/]Users[\\/][a-z\d._-]+|\/(?:Users|home)\/[a-z\d._-]+\//i.test(text)) problems.push('absolute local user path');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push('private key');
  if (/\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,})\b/.test(text)) problems.push('credential-shaped literal');
  return problems;
}
export function auditPublicIndex(root) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const files = git(['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
  const problems = [];
  for (const file of files) {
    if (!allowedPublicPath(file)) { problems.push(`${file}: outside public tool allowlist`); continue; }
    for (const problem of contentProblems(git(['show', `:${file}`]))) problems.push(`${file}: ${problem}`);
  }
  if (problems.length) throw new Error(`Publication check failed:\n${problems.join('\n')}`);
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const files = auditPublicIndex(root);
    console.log(`Publication index check passed: ${files.length} tool/documentation files. Earlier commits and arbitrary secrets are not certified by this check.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
