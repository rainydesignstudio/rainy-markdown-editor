// Trusted runner in an opaque, network-blocked frame. No directory handles enter it.
(() => {
  let started = false;
  const layoutReady = viewport => new Promise((resolve, reject) => {
    const tasks = new MessageChannel();
    const timeout = setTimeout(() => finish(new Error('ALGORITHM_LAYOUT_UNAVAILABLE')), 3000);
    function finish(error) { clearTimeout(timeout); tasks.port1.close(); tasks.port2.close(); error ? reject(error) : resolve(); }
    tasks.port1.onmessage = () => {
      if (innerWidth === viewport.width && innerHeight === viewport.height && document.documentElement.getBoundingClientRect().width > 0) finish();
      else tasks.port2.postMessage(null);
    };
    tasks.port2.postMessage(null);
  });
  const load = source => new Promise((resolve, reject) => {
    if (typeof source !== 'string' || source.length > 1048576) { reject(new Error('ALGORITHM_SCRIPT_LIMIT')); return; }
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const script = document.createElement('script'); script.src = url;
    script.onload = () => { URL.revokeObjectURL(url); resolve(); };
    script.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ALGORITHM_SCRIPT_FAILED')); };
    document.head.append(script);
  });
  window.addEventListener('message', async event => {
    if (started || event.source !== parent || event.data?.protocol !== 'article-algorithm/1' || event.ports.length !== 1) return;
    started = true;
    const input = event.data, port = event.ports[0];
    const resourceUrls = [];
    try {
      // Static trusted bootstrap has finished. Components may load only local
      // blobs from this point; even same-origin script requests are forbidden.
      const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "script-src blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'";
      document.head.append(policy);
      let html = input.html, css = input.css;
      const resources = input.resources.map(resource => {
        const base = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime })); resourceUrls.push(base);
        const url = base + resource.fragment; html = html.replaceAll(resource.token, url); css = css.replaceAll(resource.token, url);
        return { id: resource.id, url };
      });
      const style = document.createElement('style'); style.textContent = css; document.head.append(style);
      document.body.innerHTML = html;
      // Input comes from the sanitized processing document. Inert all active nodes
      // anyway; the only executable inputs are hash-verified component scripts.
      document.body.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(node => node.remove());
      for (const node of document.body.querySelectorAll('*')) for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      const root = document.querySelector('[data-algorithm-root="' + input.request + '"]');
      if (!root) throw new Error('ALGORITHM_ROOT_MISSING');
      const nodes = [root, ...root.querySelectorAll('*')];
      const properties = [...input.paints];
      await layoutReady(input.viewport);
      await document.fonts.ready;
      await Promise.all([...root.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
      const rect = root.getBoundingClientRect();
      if (['x', 'y', 'width', 'height'].some(key => Math.abs(rect[key] - input.rectangle[key]) > 1)) throw new Error('ALGORITHM_LAYOUT_MISMATCH');
      for (const source of input.scripts) await load(source);
      const algorithm = window.ArticleAlgorithm;
      if (!algorithm || typeof algorithm.transform !== 'function' || input.rules.length && typeof algorithm.inspect !== 'function') throw new Error('ALGORITHM_CAPABILITY_MISSING');
      await algorithm.transform(root, input.context);
      const findings = input.rules.length ? await algorithm.inspect(root, input.rules) : [];
      if (!Array.isArray(findings)) throw new Error('ALGORITHM_INVALID_FINDINGS');
      const after = [root, ...root.querySelectorAll('*')];
      if (!root.isConnected || after.length !== nodes.length || after.some((node, index) => node !== nodes[index])) throw new Error('ALGORITHM_STRUCTURE_CHANGED');
      const result = {
        resources,
        paints: nodes.map((node, index) => { const style = getComputedStyle(node); return { node: index, properties: Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)])) }; }),
        findings: findings.map(finding => ({ ruleId: finding.ruleId, node: nodes.indexOf(finding.element), outcome: finding.outcome || 'violation', ...(finding.detail === undefined ? {} : { detail: finding.detail }) })),
      };
      port.postMessage({ request: input.request, result });
    } catch (cause) { port.postMessage({ request: input.request, error: cause instanceof Error ? cause.message : String(cause) }); }
    finally { resourceUrls.forEach(url => URL.revokeObjectURL(url)); port.close(); }
  }, { once: false });
})();
