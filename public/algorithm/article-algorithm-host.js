// Trusted bridge. Library source is data here and executes only in an opaque child.
(() => {
  const paints = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color', 'text-emphasis-color', '-webkit-text-fill-color', '-webkit-text-stroke-color', 'box-shadow', 'text-shadow'];
  let configured, used = false;
  const exampleImagePath = typeof document !== 'undefined' && document.currentScript?.src ? new URL('../images/article-sample.png', document.currentScript.src).pathname : '/images/article-sample.png';
  const urls = value => [...value.matchAll(/url\((?:[^()"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\)/gi)].map(item => item[0]);
  const blobPattern = /blob:(?:https?:\/\/|null\/)[^\s"'<>)]*/g;
  async function prepareInput(root, request) {
    const copied = root.cloneNode(true), attributes = ['src', 'srcset', 'href', 'xlink:href', 'poster', 'style'];
    copied.setAttribute('data-algorithm-root', request);
    const images = [...root.querySelectorAll('img')];
    [...copied.querySelectorAll('img')].forEach((image, index) => {
      const size = getComputedStyle(images[index]);
      image.style.setProperty('width', size.width, 'important'); image.style.setProperty('height', size.height, 'important');
    });
    let tree = copied, parent = root.parentElement;
    while (parent && parent !== document.body) { const wrapper = parent.cloneNode(false); wrapper.append(tree); tree = wrapper; parent = parent.parentElement; }
    let css = [...document.head.querySelectorAll('style')].map(style => style.textContent || '').join('\n');
    const references = new Set();
    for (const node of [tree, ...tree.querySelectorAll('*')]) for (const name of attributes) for (const match of (node.getAttribute(name) || '').matchAll(blobPattern)) references.add(match[0]);
    for (const url of urls(css)) for (const match of url.matchAll(blobPattern)) references.add(match[0]);
    // The application's fixed typography image is also a local asset. Carry
    // its bytes through the existing opaque-child bridge, just like Blob URLs.
    // Other HTTP images remain outside this bridge's fetch authority.
    for (const image of copied.querySelectorAll('img')) {
      const source = image.getAttribute('src');
      if (source === exampleImagePath || source === new URL(exampleImagePath, document.baseURI).href) references.add(source);
    }
    if (references.size > 2048) throw new Error('ALGORITHM_RESOURCE_LIMIT');
    const resources = [], replacements = new Map(), fetched = new Map(); let total = 0;
    for (const reference of references) {
      const index = reference.indexOf('#'), base = index < 0 ? reference : reference.slice(0, index), fragment = index < 0 ? '' : reference.slice(index);
      let resource = fetched.get(base);
      if (!resource) {
        const response = await fetch(base); if (!response.ok) throw new Error('ALGORITHM_RESOURCE_UNAVAILABLE');
        const blob = await response.blob(); total += blob.size;
        if (total > 256 * 1024 * 1024 || !/^(?:image|font)\//.test(blob.type)) throw new Error('ALGORITHM_RESOURCE_LIMIT');
        resource = { mime: blob.type, bytes: await blob.arrayBuffer() }; fetched.set(base, resource);
      }
      const id = resources.length, token = 'article-algorithm-asset:' + request + '/' + id;
      resources.push({ id, token, fragment, ...resource }); replacements.set(reference, token);
    }
    const replace = value => replacements.get(value) || value.replace(blobPattern, reference => replacements.get(reference) || reference);
    // Storage tokens are inert transport data, never live image URLs.
    document.createElement('template').content.append(tree);
    for (const node of [tree, ...tree.querySelectorAll('*')]) for (const name of attributes) { const value = node.getAttribute(name); if (value) node.setAttribute(name, replace(value)); }
    css = css.replace(/url\((?:[^()"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\)/gi, replace);
    return { html: tree.outerHTML, css, resources, originals: [...references] };
  }
  function validateResult(result, nodes, rules, originals) {
    if (!result || !Array.isArray(result.paints) || result.paints.length !== nodes.length || !Array.isArray(result.findings) || result.findings.length > 100000) throw new Error('ALGORITHM_INVALID_RESULT');
    const seen = new Set(), ruleIds = new Set(rules.map(rule => rule.id));
    let bytes = 0;
    for (const entry of result.paints) {
      if (!entry || !Number.isInteger(entry.node) || entry.node < 0 || entry.node >= nodes.length || seen.has(entry.node) || !entry.properties || typeof entry.properties !== 'object' || Array.isArray(entry.properties)) throw new Error('ALGORITHM_INVALID_NODE');
      seen.add(entry.node);
      if (Object.keys(entry.properties).length !== paints.length) throw new Error('ALGORITHM_INVALID_PAINT');
      for (const [property, value] of Object.entries(entry.properties)) {
        if (!paints.includes(property) || typeof value !== 'string' || value.length > 65536 || /expression\s*\(|javascript:|[\u0000-\u001f<>]/i.test(value)) throw new Error('ALGORITHM_INVALID_PAINT');
        bytes += value.length * 2;
        if (bytes > 8 * 1024 * 1024) throw new Error('ALGORITHM_RESULT_LIMIT');
        const prior = originals[entry.node][property];
        if (urls(value).some(url => !urls(prior).includes(url)) || /(?:image-set|paint|element|var|attr)\s*\(/i.test(value) && value !== prior) throw new Error('ALGORITHM_RESOURCE_CHANGED');
        if (value && !CSS.supports(property, value)) throw new Error('ALGORITHM_INVALID_PAINT');
      }
    }
    for (const finding of result.findings) {
      if (!finding || !ruleIds.has(finding.ruleId) || !Number.isInteger(finding.node) || finding.node < 0 || finding.node >= nodes.length || !['violation', 'review', 'incomplete'].includes(finding.outcome) || finding.detail !== undefined && (typeof finding.detail !== 'string' || finding.detail.length > 4096)) throw new Error('ALGORITHM_INVALID_FINDING');
      bytes += (finding.detail?.length || 0) * 2;
      if (bytes > 8 * 1024 * 1024) throw new Error('ALGORITHM_RESULT_LIMIT');
    }
    return result;
  }
  async function run(root, bundle, rules = []) {
    if (window.parent === window || used) throw new Error('ALGORITHM_REQUIRES_FRESH_PROCESSING_FRAME');
    used = true;
    const component = configured?.manifest.components.find(item => item.id === bundle.formatter.preview.dark.transform);
    if (!component?.capabilities.transform || rules.some(rule => !component.capabilities.validators.includes(rule.operator))) throw new Error('ALGORITHM_CAPABILITY_MISSING');
    root.getBoundingClientRect(); // Start any font loads before awaiting FontFaceSet.ready.
    await document.fonts.ready;
    await Promise.all([...root.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
    const nodes = [root, ...root.querySelectorAll('*')];
    if (nodes.length > 20000) throw new Error('ALGORITHM_NODE_LIMIT');
    const borders = [];
    const originals = nodes.map(node => {
      const style = getComputedStyle(node);
      // Overriding a colour longhand clears pending var() border shorthands in
      // CSSOM. Capture their resolved geometry before any paint is applied.
      const pendingBorder = /(?:^|;)\s*border(?:-(?:top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?))?\s*:[^;]*\bvar\s*\(/i.test(node.style.cssText);
      borders.push(pendingBorder ? ['top', 'right', 'bottom', 'left'].flatMap(side => ['width', 'style'].map(part => {
        const property = 'border-' + side + '-' + part;
        return [property, style.getPropertyValue(property)];
      })) : []);
      return Object.fromEntries(paints.map(property => [property, style.getPropertyValue(property)]));
    });
    const request = crypto.randomUUID();
    const input = await prepareInput(root, request);
    const rectangle = root.getBoundingClientRect();
    const channel = new MessageChannel(), frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-100000px;top:0;border:0;pointer-events:none;width:' + window.innerWidth + 'px;height:' + window.innerHeight + 'px';
    frame.src = new URL('/algorithm/article-algorithm-sandbox.html', document.baseURI).href;
    return new Promise((resolve, reject) => {
      let done = false, connected = false;
      const finish = (error, result) => {
        if (done) return; done = true;
        clearTimeout(timer); channel.port1.close(); channel.port2.close(); frame.remove();
        if (error) { reject(error); return; }
        try {
          const resources = result?.resources || [];
          if (!Array.isArray(resources) || resources.length !== input.resources.length || new Set(resources.map(item => item.id)).size !== resources.length) throw new Error('ALGORITHM_INVALID_RESOURCES');
          for (const resource of resources) {
            if (!Number.isInteger(resource.id) || resource.id < 0 || resource.id >= input.resources.length || typeof resource.url !== 'string' || resource.url.length > 4096 || !/^blob:null\/[a-f0-9-]+(?:#.*)?$/i.test(resource.url)) throw new Error('ALGORITHM_INVALID_RESOURCES');
            for (const entry of result.paints || []) for (const [property, value] of Object.entries(entry.properties || {})) if (typeof value === 'string') entry.properties[property] = value.replaceAll(resource.url, input.originals[resource.id]);
          }
          validateResult(result, nodes, rules, originals);
          // Validate the complete packet before mutating any trusted document node.
          for (const entry of result.paints) {
            for (const [property, value] of borders[entry.node]) nodes[entry.node].style.setProperty(property, value, 'important');
            for (const [property, value] of Object.entries(entry.properties)) nodes[entry.node].style.setProperty(property, value, 'important');
          }
          resolve(result.findings);
        } catch (cause) { reject(cause); }
      };
      const timer = window.setTimeout(() => finish(new Error('ALGORITHM_TIMEOUT')), 15000);
      channel.port1.onmessage = event => {
        const data = event.data;
        if (data?.request !== request) return;
        if (typeof data.error === 'string') finish(new Error(data.error.slice(0, 4096)));
        else finish(undefined, data.result);
      };
      frame.onerror = () => finish(new Error('ALGORITHM_SANDBOX_UNAVAILABLE'));
      frame.onload = () => {
        if (connected) { finish(new Error('ALGORITHM_NAVIGATION_REJECTED')); return; }
        connected = true;
        // Once loaded, block every further child navigation, including self-URLs.
        // The processing document is single-use; its parent/workbench is unaffected.
        const policy = document.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy'; policy.content = "frame-src 'none'"; document.head.append(policy);
        frame.contentWindow.postMessage({ protocol: 'article-algorithm/1', request,
          html: input.html, css: input.css, resources: input.resources,
          scripts: component.scripts.map(file => configured.files[file.path]), paints,
          context: { background: bundle.formatter.preview.dark.background, options: bundle.formatter.preview.dark.options, inlineProperties: bundle.formatter.output.inlineProperties },
          rules,
          viewport: { width: Math.round(frame.getBoundingClientRect().width), height: Math.round(frame.getBoundingClientRect().height) },
          rectangle: { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height },
        }, '*', [channel.port2, ...new Set(input.resources.map(resource => resource.bytes))]);
      };
      document.body.append(frame);
      frame.getBoundingClientRect(); // Flush the parent layout before an opaque renderer starts.
    });
  }
  window.ArticleAlgorithmHost = { configure(value) { configured = value; }, run, validateResult, paintProperties: Object.freeze(paints) };
})();
