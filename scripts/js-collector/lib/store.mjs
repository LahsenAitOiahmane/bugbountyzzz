import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
const safe = value => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 55) || 'unnamed';

export class Store {
  constructor(root, { maxTotalBytes = 200 * 1024 * 1024 } = {}) {
    this.root = path.resolve(root);
    this.maxTotalBytes = maxTotalBytes;
    this.bytes = 0;
    this.blobs = new Map();
    this.tail = Promise.resolve();
  }

  async init() {
    await mkdir(path.dirname(this.root), { recursive: true });
    // Refuse accidental overwrite; a run is an immutable snapshot.
    await mkdir(this.root);
  }

  async save(record, body, group, extension) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await this.saveBody(record, body, group, extension); }
    finally { release(); }
  }

  async saveBody(record, body, group, extension) {
    const digest = hash(body);
    record.sha256 = digest;
    record.bytes = body.length;
    const previous = this.blobs.get(`${digest}:${extension}`);
    if (previous) {
      record.path = previous.path;
      record.duplicateOf = previous.id;
      return;
    }
    if (this.bytes + body.length > this.maxTotalBytes) throw new Error('Saved-byte limit reached');
    const url = new URL(record.url);
    const host = `${safe(url.host).slice(0, 35)}-${hash(url.origin).slice(0, 8)}`;
    const name = safe(path.posix.basename(url.pathname)).replace(/\.(?:m?js|cjs|json|map|html)$/i, '').slice(0, 40);
    const relative = `${group}/${host}/${name || 'index'}--${hash(record.id).slice(0, 16)}.${extension}`;
    await mkdir(path.dirname(path.join(this.root, relative)), { recursive: true });
    await writeFile(path.join(this.root, relative), body);
    this.bytes += body.length;
    record.path = relative;
    this.blobs.set(`${digest}:${extension}`, record);
  }

  async json(name, value) {
    await writeFile(path.join(this.root, name), JSON.stringify(value, null, 2) + '\n');
  }

  async jsonl(name, rows) {
    await writeFile(path.join(this.root, name), rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  }
}
