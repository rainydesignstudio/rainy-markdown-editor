// Component protocol v1. The upstream SDK stays unchanged in mp-darkmode.js.
(() => {
  const keys = { 'darkmode-low-contrast': 'official.dark-contrast', 'darkmode-no-gradient': 'official.dark-gradient' };
  window.ArticleAlgorithm = {
    transform(root, context) {
      if (!window.Darkmode) throw new Error('Official SDK unavailable');
      const options = context.options;
      const allowed = ['mode', 'defaultDarkTextColor', 'defaultDarkBgColor', 'needJudgeFirstPage', 'noEmit', 'whitelist'];
      if (!options || Object.keys(options).some(key => !allowed.includes(key)) || options.mode !== undefined && options.mode !== 'dark' || ['needJudgeFirstPage', 'noEmit'].some(key => options[key] !== undefined && typeof options[key] !== 'boolean')) throw new Error('SDK_INVALID_OPTIONS');
      for (const key of ['defaultDarkTextColor', 'defaultDarkBgColor']) if (options[key] !== undefined && (typeof options[key] !== 'string' || !CSS.supports('color', options[key]))) throw new Error('SDK_INVALID_OPTIONS');
      if (options.whitelist) {
        if (typeof options.whitelist !== 'object' || Array.isArray(options.whitelist) || Object.keys(options.whitelist).some(key => !['attribute', 'tagName'].includes(key))) throw new Error('SDK_INVALID_OPTIONS');
        for (const key of ['attribute', 'tagName']) if (options.whitelist[key] !== undefined && (!Array.isArray(options.whitelist[key]) || options.whitelist[key].some(value => typeof value !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(value)))) throw new Error('SDK_INVALID_OPTIONS');
      }
      const normalize = window.ArticleColorNormalizer(document);
      const names = context.inlineProperties.filter(name => /color|background|shadow|border|outline|text-(?:decoration|emphasis|stroke|fill)/.test(name));
      const nodes = [root, ...root.querySelectorAll('*')], paints = [];
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const computed = getComputedStyle(node);
        for (const name of names) {
          const value = computed.getPropertyValue(name);
          if (value) paints.push([node, name, normalize.normalizePaint(value), node.style.getPropertyPriority(name)]);
        }
      }
      for (const [node, name, value, priority] of paints) node.style.setProperty(name, value, priority);
      window.Darkmode.run(nodes, { defaultDarkBgColor: context.background, ...context.options, container: root, error(error) { throw error; } });
    },
    inspect(root, rules) {
      const exemptions = [root, ...root.querySelectorAll('[data-ignore-dm]')].filter(node => node.hasAttribute('data-ignore-dm')).map(node => [node, node.getAttribute('data-ignore-dm')]);
      const raw = new Map(), findings = [];
      try {
        exemptions.forEach(([node]) => node.removeAttribute('data-ignore-dm'));
        for (const rule of rules) {
          const minimum = rule.operator === 'official.dark-contrast' ? rule.parameters.minimum : 1;
          if (!raw.has(minimum)) raw.set(minimum, window.Darkmode.validate(root, { minContrast: minimum }));
        }
      } finally { exemptions.forEach(([node, value]) => node.setAttribute('data-ignore-dm', value)); }
      for (const rule of rules) {
        const minimum = rule.operator === 'official.dark-contrast' ? rule.parameters.minimum : 1;
        for (const item of raw.get(minimum)) {
          if (keys[item.key] !== rule.operator) continue;
          const p = rule.parameters;
          if (item.dom.getAttribute(p.ignoreAttribute)?.split(/\s+/).includes(p.ignoreValue)) continue;
          findings.push({ ruleId: rule.id, element: item.dom, outcome: 'violation' });
        }
      }
      return findings;
    },
  };
})();
