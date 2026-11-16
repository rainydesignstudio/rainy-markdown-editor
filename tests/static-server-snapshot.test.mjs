import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = await fsp.readFile(new URL('../scripts/start-static.mjs', import.meta.url), 'utf8');
function handler(root) {
  let requestHandler;
  const server = { on() { return this; }, listen() { return this; } };
  vm.runInNewContext(source.replace(/^import .*;\n/gm, '').replaceAll('import.meta.url', 'SERVER_URL'), {
    fs, crypto, path, fileURLToPath, URL, Buffer,
    SERVER_URL: pathToFileURL(path.join(root, 'scripts/start-static.mjs')).href,
    createCliTranslation: () => value => value,
    parseStaticServerOptions: () => ({ port: 3502 }), STATIC_SERVER_HELP: '',
    process: { argv: [], env: {}, exit(code) { throw Error('Unexpected server exit ' + code); } },
    console: { log() {}, error() {} },
    http: { createServer(callback) { requestHandler = callback; return server; } },
  });
  return async url => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Static handler did not finish')), 1000);
    const result = {};
    requestHandler({ url, method: 'GET', headers: {} }, {
      writeHead(status, headers) { result.status = status; result.headers = headers; },
      end(bytes) { clearTimeout(timer); result.body = String(bytes); resolve(result); },
    });
  });
}

test('HTML, RSC, script bytes and CSP stay on one build until an explicit restart', async t => {
  const parent = new URL('../data/test/', import.meta.url); await fsp.mkdir(parent, { recursive: true });
  const root = await fsp.mkdtemp(path.join(parent.pathname, 'static-snapshot-')); t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const out = path.join(root, 'out'); await fsp.mkdir(path.join(out, 'editor'), { recursive: true });
  const html = '<html><head><script>window.build="old"</script></head></html>';
  await fsp.writeFile(path.join(out, 'index.html'), html); await fsp.writeFile(path.join(out, 'editor/index.html'), html);
  await fsp.writeFile(path.join(out, 'editor/index.txt'), '0:{"b":"old"}'); await fsp.writeFile(path.join(out, 'old.js'), 'old script');
  await fsp.writeFile(path.join(root, 'private.txt'), 'not public'); await fsp.symlink(path.join(root, 'private.txt'), path.join(out, 'linked.txt'));
  const current = handler(root);
  const initial = await current('/editor/'); assert.equal(initial.status, 200); assert.equal(initial.body, html);
  const oldHash = crypto.createHash('sha256').update('window.build="old"').digest('base64'); assert.ok(initial.headers['content-security-policy'].includes('sha256-' + oldHash));
  await fsp.writeFile(path.join(out, 'editor/index.html'), '<html><script>window.build="new"</script></html>');
  await fsp.writeFile(path.join(out, 'editor/index.txt'), '0:{"b":"new"}'); await fsp.rm(path.join(out, 'old.js')); await fsp.writeFile(path.join(out, 'new.js'), 'new script');
  assert.equal((await current('/editor/')).body, html);
  assert.equal((await current('/editor/index.txt')).body, '0:{"b":"old"}');
  assert.equal((await current('/editor/index.txt')).headers['content-type'], 'text/x-component; charset=utf-8');
  assert.equal((await current('/old.js')).body, 'old script'); assert.equal((await current('/new.js')).status, 404);
  assert.equal((await current('/editor.txt')).status, 404); assert.equal((await current('/linked.txt')).status, 404); assert.equal((await current('/../private.txt')).status, 404);
  const restarted = handler(root); assert.match((await restarted('/editor/')).body, /new/); assert.equal((await restarted('/editor/index.txt')).body, '0:{"b":"new"}');
  assert.equal((await restarted('/old.js')).status, 404); assert.equal((await restarted('/new.js')).body, 'new script');
});
