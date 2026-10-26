// Versioned transport only. The verified library module owns all business operations.
(() => {
  let started = false;
  window.addEventListener('message', async event => {
    if (started || event.source !== parent || !['rainy-format/1', 'rainy-format/2'].includes(event.data?.protocol) || event.ports.length !== 1) return;
    started = true;
    const { pkg } = event.data, port = event.ports[0];
    if (pkg?.declaration?.protocol !== event.data.protocol) return;
    const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "script-src blob:; connect-src 'none'; worker-src 'none'; frame-src blob: 'self'; form-action 'none'"; document.head.append(policy);
    let url;
    try {
      url = URL.createObjectURL(new Blob([pkg.files[pkg.declaration.entry]], { type: 'text/javascript' }));
      const module = await import(url);
      if (typeof module.default !== 'function') throw new Error('FORMAT_ENTRY_INVALID');
      let pending = Promise.resolve();
      const serviceCalls = new Map();
      const loaded = new Map();
      const modules = new Map();
      const importModule = path => {
        if (!Object.hasOwn(pkg.files, path)) return Promise.reject(new Error('FORMAT_FILE_UNDECLARED'));
        if (!modules.has(path)) {
          const url = URL.createObjectURL(new Blob([pkg.files[path]], { type: 'text/javascript' }));
          modules.set(path, import(url).finally(() => URL.revokeObjectURL(url)));
        }
        return modules.get(path);
      };
      const load = path => {
        if (!Object.hasOwn(pkg.files, path)) return Promise.reject(new Error('FORMAT_FILE_UNDECLARED'));
        if (!loaded.has(path)) loaded.set(path, new Promise((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([pkg.files[path]], { type: 'text/javascript' }));
          const script = document.createElement('script'); script.src = url;
          script.onload = () => { URL.revokeObjectURL(url); resolve(); };
          script.onerror = () => { URL.revokeObjectURL(url); reject(new Error('FORMAT_FILE_FAILED')); };
          document.head.append(script);
        }));
        return loaded.get(path);
      };
      port.onmessage = event => {
        if (event.data?.call) {
          const call = serviceCalls.get(event.data.call);
          if (call && call.request === event.data.request) {
            serviceCalls.delete(event.data.call);
            event.data.serviceError ? call.reject(new Error(event.data.serviceError)) : call.resolve(event.data.value);
          }
          return;
        }
        const { request, action, input, services = [] } = event.data ?? {};
        // The pinned module may mutate its document; never interleave operations.
        pending = pending.catch(() => {}).then(async () => {
          let active = true;
          try {
            if (!pkg.declaration.actions.some(item => item.id === action)) throw new Error('FORMAT_ACTION_UNKNOWN');
            const service = (name, input) => new Promise((resolve, reject) => {
              if (!active || !services.includes(name)) { reject(new Error('FORMAT_SERVICE_UNAVAILABLE')); return; }
              const call = crypto.randomUUID(); serviceCalls.set(call, { request, resolve, reject });
              port.postMessage({ request, call, service: name, input });
            });
            const result = await module.default(action, input, Object.freeze({ declaration: Object.freeze(pkg.declaration), files: Object.freeze(pkg.files), load, importModule, service, protocol: pkg.declaration.protocol }));
            port.postMessage({ request, result });
          } catch (cause) { port.postMessage({ request, error: cause instanceof Error ? cause.message : String(cause) }); }
          finally { active = false; for (const [id, call] of serviceCalls) if (call.request === request) { call.reject(new Error('FORMAT_REQUEST_CLOSED')); serviceCalls.delete(id); } }
        });
      };
      port.postMessage({ ready: true });
    } catch (cause) { port.postMessage({ startupError: cause instanceof Error ? cause.message : String(cause) }); }
    finally { if (url) URL.revokeObjectURL(url); }
  });
})();
