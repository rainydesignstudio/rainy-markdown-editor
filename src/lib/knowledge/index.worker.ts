import { KnowledgeIndexEngine } from './engine';
import { productErrorMessage } from '../i18n/productMessages';

const engine = new KnowledgeIndexEngine();
const scope = globalThis as unknown as { addEventListener: (type: string, handler: (event: MessageEvent) => void) => void; postMessage: (data: unknown) => void };
// No dynamic dispatch, executable payload, raw directory or fetch capability is accepted.
let queue = Promise.resolve();
scope.addEventListener('message', event => { queue = queue.then(async () => {
  const request = event.data;
  if (!request || request.protocol !== 1 || typeof request.id !== 'string' || !Array.isArray(request.args)) return;
  try {
    let value: unknown;
    switch (request.operation) {
      case 'graph': value = engine.graph(...request.args as Parameters<typeof engine.graph>); break;
      case 'begin': engine.begin(...request.args as Parameters<typeof engine.begin>); value = null; break;
      case 'plan': value = engine.plan(...request.args as Parameters<typeof engine.plan>); break;
      case 'rank': value = engine.rank(...request.args as Parameters<typeof engine.rank>); break;
      case 'readText': value = await engine.readText(...request.args as Parameters<typeof engine.readText>); break;
      case 'append': value = await engine.append(...request.args as Parameters<typeof engine.append>); break;
      case 'flush': value = await engine.flush(); break;
      case 'manifest': value = await engine.manifest(...request.args as Parameters<typeof engine.manifest>); break;
      case 'finalize': value = await engine.finalize(...request.args as Parameters<typeof engine.finalize>); break;
      case 'search': value = await engine.search(...request.args as Parameters<typeof engine.search>); break;
      default: throw new Error('Unknown knowledge operation');
    }
    scope.postMessage({ protocol: 1, id: request.id, ok: true, value });
  } catch (error) { scope.postMessage({ protocol: 1, id: request.id, ok: false, error: productErrorMessage(error) }); }
}); });
