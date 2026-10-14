'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { drag, dragEnable } from 'd3-drag';
import { createKnowledgeWorker } from '../../lib/knowledge/workerClient';
import type { KnowledgeGraph as GraphSnapshot, KnowledgeGraphNode } from '../../lib/knowledge/graph';
import type { KnowledgeManifest } from '../../lib/knowledge/model';
import { formatProductMessage, productErrorMessage } from '../../lib/i18n/productMessages';
import { ButtonBar } from '../global/ButtonBar';
import { IconButton } from '../global/IconButton';
import { useUITranslation } from '../global/UILocaleProvider';

export function KnowledgeGraph({ manifest, selectedPath, onOpen }: { manifest: KnowledgeManifest; selectedPath?: string; onOpen: (path: string) => void }) {
  const { t } = useUITranslation('knowledge');
  const [mode, setMode] = useState<'global' | 'local'>('global'), [depth, setDepth] = useState<1 | 2>(1), [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(selectedPath ?? manifest.documents[0]?.path ?? ''), [center, setCenter] = useState(selectedPath ?? manifest.documents[0]?.path ?? '');
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null), [loading, setLoading] = useState(true), [issue, setIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 600 });
  const svgRef = useRef<SVGSVGElement | null>(null), groupRef = useRef<SVGGElement | null>(null), zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const positions = useRef(new Map<string, KnowledgeGraphNode>()), selectedRef = useRef(selected); selectedRef.current = selected;
  const drawnLayout = useRef<KnowledgeGraphNode[] | null>(null);
  const latestOpen = useRef(onOpen); latestOpen.current = onOpen;
  useEffect(() => {
    if (!manifest.documents.some(doc => doc.path === selected)) setSelected(manifest.documents[0]?.path ?? '');
    if (!manifest.documents.some(doc => doc.path === center)) setCenter(manifest.documents[0]?.path ?? '');
  }, [manifest, selected, center]);
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    let timer: ReturnType<typeof setTimeout> | undefined, first = true;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const update = () => setViewport(old => old.width === width && old.height === height ? old : { width, height });
      clearTimeout(timer); if (first) { first = false; update(); } else timer = setTimeout(update, 80);
    }); observer.observe(svg);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  useEffect(() => {
    let active = true; const abort = new AbortController(); setLoading(true); setIssue(null);
    const timer = window.setTimeout(() => {
      let worker: ReturnType<typeof createKnowledgeWorker>;
      try { worker = createKnowledgeWorker(); } catch (error) { if (active) { setIssue(productErrorMessage(error)); setLoading(false); } return; }
      const stop = () => worker.dispose(); abort.signal.addEventListener('abort', stop, { once: true });
      void worker.request('graph', [manifest, { mode, root: mode === 'local' ? center : '', depth, filter }], abort.signal)
        .then(result => { if (active) setSnapshot(result); }).catch(error => { if (active) setIssue(productErrorMessage(error)); })
        .finally(() => { abort.signal.removeEventListener('abort', stop); worker.dispose(); if (active) setLoading(false); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); abort.abort(); };
  }, [manifest, mode, center, depth, filter]);
  const initialNodes = useMemo(() => {
    const scale = Math.max(0.05, Math.min(viewport.width / 1000, viewport.height / 600) * 0.92);
    return snapshot?.nodes.map(node => ({ ...node, x: viewport.width / 2 + (node.x - 500) * scale, y: viewport.height / 2 + (node.y - 300) * scale })) ?? [];
  }, [snapshot, viewport]);
  if (drawnLayout.current !== initialNodes) { drawnLayout.current = initialNodes; positions.current = new Map(initialNodes.map(node => [node.path, { ...node }])); }
  useLayoutEffect(() => {
    const svg = svgRef.current, group = groupRef.current; if (!svg || !group) return;
    positions.current = new Map(initialNodes.map(node => [node.path, { ...node }]));
    let frame = 0, transform = zoomIdentity, gesture = false, cameraDirty = true;
    const dirty = new Set(initialNodes.map(node => node.path)), elements = new Map<string, SVGGElement>();
    group.querySelectorAll<SVGGElement>('[data-graph-node]').forEach(element => elements.set(element.dataset.graphNode!, element));
    const lines = new Map<string, SVGLineElement[]>();
    group.querySelectorAll<SVGLineElement>('[data-graph-edge]').forEach(line => {
      for (const path of [line.dataset.from!, line.dataset.to!]) { if (!lines.has(path)) lines.set(path, []); lines.get(path)!.push(line); }
    });
    const draw = () => {
      frame = 0;
      if (cameraDirty) { group.setAttribute('transform', transform.toString()); cameraDirty = false; }
      const changedLines = new Set<SVGLineElement>();
      for (const path of dirty) {
        const node = positions.current.get(path), element = elements.get(path); if (node && element) element.setAttribute('transform', `translate(${node.x},${node.y})`);
        for (const line of lines.get(path) ?? []) changedLines.add(line);
      }
      for (const line of changedLines) {
        const from = positions.current.get(line.dataset.from!), to = positions.current.get(line.dataset.to!);
        if (from && to) { line.setAttribute('x1', String(from.x)); line.setAttribute('y1', String(from.y)); line.setAttribute('x2', String(to.x)); line.setAttribute('y2', String(to.y)); }
      }
      dirty.clear();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const behavior = zoom<SVGSVGElement, unknown>().extent([[0, 0], [viewport.width, viewport.height]]).scaleExtent([0.25, 4])
      .filter(event => !event.ctrlKey && !event.metaKey && !event.button && (event.type === 'wheel' || !(event.target as Element)?.closest?.('[data-graph-node]')))
      .on('start', () => { gesture = true; }).on('end', () => { gesture = false; })
      .on('zoom', event => { transform = event.transform; cameraDirty = true; schedule(); });
    const surface = select(svg); surface.call(behavior).on('dblclick.zoom', null); surface.style('-webkit-tap-highlight-color', null).style('touch-action', null); zoomRef.current = behavior;
    const nodeSelection = select(group).selectAll<SVGGElement, KnowledgeGraphNode>('[data-graph-node]').datum(function () { return positions.current.get(this.dataset.graphNode!)!; });
    const dragging = drag<SVGGElement, KnowledgeGraphNode>().container(() => group).filter(event => !event.ctrlKey && !event.metaKey && !event.button)
      .on('start', (_event, node) => { gesture = true; setSelected(node.path); })
      .on('drag', (event, node) => { node.x = event.x; node.y = event.y; dirty.add(node.path); schedule(); })
      .on('end', () => { gesture = false; });
    nodeSelection.call(dragging).style('touch-action', null).style('-webkit-tap-highlight-color', null);
    draw(); surface.call(behavior.transform, zoomIdentity);
    return () => { if (frame) cancelAnimationFrame(frame); surface.on('.zoom', null); nodeSelection.on('.drag', null); if (gesture) { select(window).on('.zoom', null).on('.drag', null); dragEnable(window); } zoomRef.current = null; };
  }, [initialNodes, viewport]);
  const moveCamera = (kind: 'in' | 'out' | 'reset' | 'locate') => {
    const svg = svgRef.current, behavior = zoomRef.current; if (!svg || !behavior) return;
    const surface = select(svg);
    if (kind === 'in' || kind === 'out') surface.call(behavior.scaleBy, kind === 'in' ? 1.25 : 0.8);
    else if (kind === 'reset') surface.call(behavior.transform, zoomIdentity);
    else { const node = positions.current.get(selectedRef.current); if (node) surface.call(behavior.translateTo, node.x, node.y); }
  };
  const nodes = positions.current.size ? positions.current : new Map(initialNodes.map(node => [node.path, node]));
  const selectedDocument = manifest.documents.find(doc => doc.path === selected);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip lg:overflow-hidden">
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line p-4">
      <ButtonBar label={t('graph.scope')}>{(['global', 'local'] as const).map(value => <button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" key={value} aria-pressed={mode === value} onClick={() => { if (value === 'local' && selected) setCenter(selected); setMode(value); }}>{t('graph.' + value)}</button>)}</ButtonBar>
      {mode === 'local' ? <><select className="field w-28" aria-label={t('graph.depth')} value={depth} onChange={event => setDepth(Number(event.target.value) as 1 | 2)}><option value="1">{t('graph.depthOne')}</option><option value="2">{t('graph.depthTwo')}</option></select><button className="button button-quiet" type="button" disabled={!selected} onClick={() => setCenter(selected)}>{t('graph.centerSelected')}</button></> : null}
      <input className="field min-w-0 flex-1" type="search" maxLength={200} aria-label={t('graph.filter')} placeholder={t('graph.filter')} value={filter} onChange={event => setFilter(event.target.value)} />
      <select className="field max-w-56" aria-label={t('graph.select')} value={snapshot?.nodes.some(node => node.path === selected) ? selected : ''} onChange={event => setSelected(event.target.value)}><option value="">{t('graph.select')}</option>{snapshot?.nodes.map(node => <option key={node.path} value={node.path}>{node.title}</option>)}</select>
    </div>
    <div className="relative flex min-h-64 flex-1 overflow-hidden bg-canvas lg:min-h-0">
      <svg ref={svgRef} className="h-full min-h-0 w-full touch-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" viewBox={`0 0 ${viewport.width} ${viewport.height}`} tabIndex={0} role="group" aria-label={t('graph.canvas')} onKeyDown={event => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
        const behavior = zoomRef.current; if (!behavior) return;
        if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (event.key === '+' || event.key === '=') moveCamera('in'); else if (event.key === '-') moveCamera('out'); else if (event.key === '0') moveCamera('reset'); else select(event.currentTarget).call(behavior.translateBy, event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0, event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0); }
      }}><g ref={groupRef}>
        {snapshot?.edges.map((edge, index) => { const from = nodes.get(edge.from), to = nodes.get(edge.to); return from && to ? <line key={index} data-graph-edge="true" data-from={edge.from} data-to={edge.to} data-selected={selected === edge.from || selected === edge.to} x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth="1" className="stroke-line data-[selected=true]:stroke-accent-line" /> : null; })}
        {initialNodes.map(node => { const point = nodes.get(node.path) ?? node; return <g key={node.path} data-graph-node={node.path} transform={`translate(${point.x},${point.y})`} role="button" tabIndex={0} aria-label={t('graph.node', { title: node.title, path: node.path })} className="cursor-grab focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setSelected(node.path)} onDoubleClick={() => latestOpen.current(node.path)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); latestOpen.current(node.path); } else if (event.key === ' ') { event.preventDefault(); setSelected(node.path); } }}><title>{node.title + '\n' + node.path}</title><circle r={Math.min(10, 5 + Math.sqrt(node.degree))} data-selected={selected === node.path} data-unindexed={node.status === 'unindexed'} className="fill-panel stroke-line-strong data-[selected=true]:fill-accent data-[selected=true]:stroke-accent-strong data-[unindexed=true]:stroke-warning" strokeWidth="2" /><text x="14" y="4" className="pointer-events-none fill-primary font-sans text-xs select-none">{node.title.length > 28 ? node.title.slice(0, 28) + '…' : node.title}</text></g>; })}
      </g></svg>
      {loading ? <p role="status" className="pointer-events-none absolute left-4 top-4 rounded-md bg-panel px-3 py-2 text-xs text-muted">{t('graph.loading')}</p> : null}
      {issue ? <p role="alert" className="absolute inset-x-4 top-4 rounded-md border border-warning-line bg-warning-surface p-3 text-xs text-warning-strong">{formatProductMessage(issue, t)}</p> : null}
      {!loading && !issue && !snapshot?.nodes.length ? <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">{t('graph.empty')}</p> : null}
    </div>
    <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line p-3">
      <ButtonBar label={t('graph.actions')}><IconButton tooltip={t('graph.zoomOut')} onClick={() => moveCamera('out')} icon={<span aria-hidden="true">−</span>} /><IconButton tooltip={t('graph.zoomIn')} onClick={() => moveCamera('in')} icon={<span aria-hidden="true">+</span>} /><button className="button button-quiet" type="button" onClick={() => moveCamera('reset')}>{t('graph.reset')}</button><button className="button button-quiet" type="button" disabled={!snapshot?.nodes.some(node => node.path === selected)} onClick={() => moveCamera('locate')}>{t('graph.locate')}</button><button className="button button-primary" type="button" disabled={!selectedDocument} onClick={() => onOpen(selected)}>{t('graph.readSelected')}</button></ButtonBar>
      <p className="min-w-0 flex-1 truncate text-xs text-muted" title={selectedDocument?.path}>{selectedDocument?.title}</p>
      {snapshot ? <span className="text-2xs text-faint">{t('graph.count', { shown: snapshot.nodes.length, total: snapshot.total, edges: snapshot.edges.length })}</span> : null}
      {snapshot?.truncated || snapshot?.topologyTruncated ? <p className="w-full text-2xs text-warning">{t('graph.truncated')}</p> : null}
      <p className="w-full text-2xs text-faint">{t('graph.help')}</p>
    </footer>
  </div>;
}
