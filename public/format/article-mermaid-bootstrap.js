// Generated from src/lib/article-format/mermaidFrame.ts.
(() => {
/** Built into a standalone opaque-origin iframe. No application/library handles enter it. */
async function runMermaidFrameBootstrap() {
    const config = JSON.parse(document.querySelector('[data-mermaid-host]')?.textContent ?? '{}');
    const mermaid = window.mermaid;
    if (!config.hostToken || !config.origin || !mermaid)
        return;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
    let busy = false;
    window.addEventListener('message', async (event) => {
        const data = event.data;
        if (event.source !== parent || event.origin !== config.origin || data?.kind !== 'mermaid-render' || data?.hostToken !== config.hostToken || busy)
            return;
        const reply = (value) => parent.postMessage({ hostToken: config.hostToken, token: data.token, ...value }, '*');
        busy = true;
        let objectUrl = null;
        try {
            if (typeof data.source !== 'string' || data.source.length > 32768 || !['default', 'neutral', 'dark'].includes(data.theme))
                throw Error('Invalid diagram input');
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: data.theme, layout: 'dagre', fontFamily: 'system-ui, sans-serif', maxTextSize: 32768, maxEdges: 100, suppressErrorRendering: true, deterministicIds: true, deterministicIDSeed: 'article', secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels', 'theme', 'fontFamily', 'themeCSS'] });
            const target = document.querySelector('#diagram');
            target.replaceChildren();
            const rendered = await mermaid.render('article-diagram', data.source, target);
            const doc = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml'), svg = doc.documentElement;
            if (svg.localName !== 'svg' || doc.querySelector('parsererror'))
                throw Error('Invalid diagram SVG');
            svg.querySelectorAll('script,foreignObject,a,iframe,object,embed').forEach(node => node.remove());
            for (const node of [svg, ...svg.querySelectorAll('*')])
                for (const attr of [...node.attributes])
                    if (/^on/i.test(attr.name) || ['src', 'srcdoc'].includes(attr.name) || /(?:^|:)href$/.test(attr.name) && !attr.value.startsWith('#'))
                        node.removeAttribute(attr.name);
            const box = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
            const width = Math.ceil(box[2] || parseFloat(svg.getAttribute('width') ?? '')), height = Math.ceil(box[3] || parseFloat(svg.getAttribute('height') ?? ''));
            if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 4096))
                throw Error('Diagram dimensions exceed limits');
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            objectUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
            const image = new Image();
            image.src = objectUrl;
            await image.decode();
            const scale = Math.min(2, 4096 / Math.max(width, height)), canvas = document.createElement('canvas');
            canvas.width = Math.ceil(width * scale);
            canvas.height = Math.ceil(height * scale);
            const context = canvas.getContext('2d');
            if (!context)
                throw Error('Canvas unavailable');
            context.fillStyle = data.theme === 'dark' ? '#1f2020' : '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl.length > 8 * 1024 * 1024)
                throw Error('Diagram image exceeds limits');
            target.replaceChildren();
            reply({ image: { dataUrl, width, height } });
        }
        catch (error) {
            reply({ error: error instanceof Error ? error.message : String(error) });
        }
        finally {
            if (objectUrl)
                URL.revokeObjectURL(objectUrl);
            document.querySelector('#diagram')?.replaceChildren();
            busy = false;
        }
    });
    parent.postMessage({ kind: 'mermaid-ready', hostToken: config.hostToken }, '*');
}

void runMermaidFrameBootstrap();
})();
