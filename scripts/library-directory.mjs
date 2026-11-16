import fs from 'node:fs/promises';
import path from 'node:path';

// Build-time filesystem adapter. It never serves a filesystem over HTTP.
export function libraryDirectory(root) {
  const child = name => {
    if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw Error('Invalid library entry');
    return path.join(root, name);
  };
  const missing = error => {
    if (error.code === 'ENOENT') throw new DOMException('Missing entry', 'NotFoundError');
    throw error;
  };
  return {
    name: path.basename(root), kind: 'directory',
    async queryPermission() { return 'granted'; },
    async *entries() {
      for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw Error('Build library contains a symbolic link');
        yield [entry.name, entry.isDirectory() ? libraryDirectory(child(entry.name)) : await this.getFileHandle(entry.name)];
      }
    },
    async getDirectoryHandle(name, options) {
      const target = child(name);
      try {
        if (options?.create) await fs.mkdir(target, { recursive: true });
        if (!(await fs.stat(target)).isDirectory()) throw new DOMException('Not a directory', 'TypeMismatchError');
      } catch (error) { missing(error); }
      return libraryDirectory(target);
    },
    async getFileHandle(name, options) {
      const target = child(name);
      try {
        if (options?.create) { const file = await fs.open(target, 'a'); await file.close(); }
        if (!(await fs.stat(target)).isFile()) throw new DOMException('Not a file', 'TypeMismatchError');
      } catch (error) { missing(error); }
      return {
        name, kind: 'file',
        async getFile() {
          const bytes = await fs.readFile(target), info = await fs.stat(target);
          return new File([bytes], name, { lastModified: info.mtimeMs });
        },
        async createWritable() {
          let bytes;
          return {
            async write(value) { bytes = value instanceof Blob ? Buffer.from(await value.arrayBuffer()) : typeof value === 'string' ? Buffer.from(value) : Buffer.from(value); },
            async close() { if (bytes !== undefined) await fs.writeFile(target, bytes); },
            async abort() { bytes = undefined; },
          };
        },
      };
    },
    async removeEntry(name, options) { await fs.rm(child(name), { recursive: options?.recursive ?? false }); },
  };
}
