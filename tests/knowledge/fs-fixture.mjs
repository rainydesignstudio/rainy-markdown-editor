export function tree(name, files = {}, parent = null) {
  const counters = { reads: 0, bodyReads: 0, writes: 0, creates: 0, permission: [], fileReads: [] };
  const root = { name, kind: 'directory', parent, children: new Map(), counters, permission: 'granted', requestResult: 'granted', failWrite: false,
    async queryPermission(descriptor) { counters.permission.push(['query', descriptor.mode]); return root.permission; },
    async requestPermission(descriptor) { counters.permission.push(['request', descriptor.mode]); root.permission = root.requestResult; return root.permission; },
    async isSameEntry(other) { return root === other; },
    async resolve(other) { const path = []; for (let cursor = other; cursor; cursor = cursor.parent) { if (cursor === root) return path.reverse(); path.push(cursor.name); } return null; },
    async *entries() { for (const entry of root.children.values()) yield [entry.name, entry]; },
    async getDirectoryHandle(key, options) {
      if (options?.create) { counters.creates++; counters.writes++; }
      if (!root.children.has(key) && options?.create) root.children.set(key, tree(key, {}, root));
      const result = root.children.get(key); if (!result) throw new DOMException('missing', 'NotFoundError');
      if (result.kind !== 'directory') throw new DOMException('wrong kind', 'TypeMismatchError'); return result;
    },
    async getFileHandle(key, options) {
      if (options?.create) { counters.creates++; counters.writes++; }
      if (!root.children.has(key) && options?.create) seed(key, '');
      const result = root.children.get(key); if (!result) throw new DOMException('missing', 'NotFoundError');
      if (result.kind !== 'file') throw new DOMException('wrong kind', 'TypeMismatchError'); return result;
    },
    async removeEntry(key) { counters.writes++; root.children.delete(key); },
  };
  function seed(path, value) {
    const parts = path.split('/'), key = parts.shift();
    if (parts.length) {
      if (!root.children.has(key)) root.children.set(key, tree(key, {}, root));
      root.children.get(key).seed(parts.join('/'), value); return;
    }
    const file = { name: key, kind: 'file', parent: root, value, modified: 1000,
      async getFile() { counters.reads++; counters.fileReads.push(key); return new (class extends File { async arrayBuffer() { counters.bodyReads++; return super.arrayBuffer(); } async text() { counters.bodyReads++; return super.text(); } })([file.value], key, { lastModified: file.modified }); },
      async createWritable() {
        let pending = file.value;
        return { async write(value) { if (root.failWrite) throw new Error('write failed'); pending = value; },
          async close() { counters.writes++; file.value = pending; file.modified++; }, async abort() {} };
      },
    }; root.children.set(key, file);
  }
  root.seed = seed;
  for (const [path, value] of Object.entries(files)) seed(path, value);
  return root;
}
export function snapshot(root) {
  const values = [];
  const visit = (node, path = '') => {
    for (const item of node.children.values()) {
      const key = path ? path + '/' + item.name : item.name;
      if (item.kind === 'directory') visit(item, key); else values.push([key, item.value, item.modified]);
    }
  }; visit(root); return JSON.stringify(values.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
export function allCounts(root) {
  const output = { reads: 0, bodyReads: 0, writes: 0, creates: 0, permission: [], fileReads: [] };
  const visit = node => { output.reads += node.counters.reads; output.bodyReads += node.counters.bodyReads; output.writes += node.counters.writes; output.creates += node.counters.creates; output.permission.push(...node.counters.permission); output.fileReads.push(...node.counters.fileReads); for (const item of node.children.values()) if (item.kind === 'directory') visit(item); };
  visit(root); return output;
}
export function bookmarks() {
  const records = new Map(), calls = [], store = { records, calls, failSave: false,
    async load(id) { calls.push(['load', id]); return records.get(id) ?? null; },
    async save(id, value) { calls.push(['save', id]); if (store.failSave) throw new Error('bookmark failed'); records.set(id, value); },
    async remove(id) { calls.push(['remove', id]); records.delete(id); },
  }; return store;
}
