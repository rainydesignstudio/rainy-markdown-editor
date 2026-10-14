import { parentPort, threadId } from 'node:worker_threads';
globalThis.addEventListener = (type, handler) => { if (type === 'message') parentPort.on('message', data => handler({ data })); };
globalThis.postMessage = value => parentPort.postMessage(value);
await import('../../src/lib/knowledge/index.worker.ts');
parentPort.postMessage({ ready: true, threadId });
