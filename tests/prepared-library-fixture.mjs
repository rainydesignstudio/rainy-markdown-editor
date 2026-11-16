import { readFile } from 'node:fs/promises';
const base = new URL('../public/prepared-library/', import.meta.url);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const value = String(input), match = /^\/prepared-library\/objects\/([a-f0-9]{64})$/.exec(value);
  if (!match) return nativeFetch(input, options);
  const bytes = await readFile(new URL('objects/' + match[1], base));
  return new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } });
};
