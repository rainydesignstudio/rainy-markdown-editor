import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import { ProductError } from '../i18n/productMessages';
import { validateKnowledgeManifest, type KnowledgeManifest } from './model';

export const KNOWLEDGE_GRAPH_LIMITS = Object.freeze({ nodes: 300, edges: 2000, ticks: 160 });
export type KnowledgeGraphOptions = { mode: 'global' | 'local'; root: string; depth: 1 | 2; filter: string };
export type KnowledgeGraphNode = { path: string; title: string; status: 'indexed' | 'unindexed'; degree: number; x: number; y: number };
export type KnowledgeGraph = { nodes: KnowledgeGraphNode[]; edges: { from: string; to: string }[]; total: number; edgeTotal: number; truncated: boolean; topologyTruncated: boolean };
type LayoutNode = KnowledgeGraphNode & SimulationNodeDatum;

// Data-only static layout. D3 mutates fresh copies; manifest/index/source remain immutable.
export function buildKnowledgeGraph(input: KnowledgeManifest, options: KnowledgeGraphOptions): KnowledgeGraph {
  const manifest = validateKnowledgeManifest(input);
  if (!['global', 'local'].includes(options.mode) || ![1, 2].includes(options.depth) || typeof options.filter !== 'string' || options.filter.length > 200 || typeof options.root !== 'string') throw new ProductError('knowledge.indexInvalid');
  const docs = new Map(manifest.documents.map(doc => [doc.path, doc]));
  const adjacent = new Map<string, Set<string>>(manifest.documents.map(doc => [doc.path, new Set<string>()]));
  for (const edge of manifest.edges) { adjacent.get(edge.from)?.add(edge.to); adjacent.get(edge.to)?.add(edge.from); }
  let candidates = new Set(docs.keys());
  if (options.mode === 'local') {
    candidates = new Set(docs.has(options.root) ? [options.root] : []);
    let frontier = [...candidates];
    for (let depth = 0; depth < options.depth; depth++) {
      const next: string[] = [];
      for (const path of frontier) for (const target of adjacent.get(path) ?? []) if (!candidates.has(target)) { candidates.add(target); next.push(target); }
      frontier = next;
    }
  }
  const terms = options.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = [...candidates].filter(path => path === options.root || terms.every(term => (path + '\n' + docs.get(path)!.title).toLowerCase().includes(term)));
  matching.sort((a, b) => Number(b === options.root) - Number(a === options.root) || (adjacent.get(b)?.size ?? 0) - (adjacent.get(a)?.size ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  const selected = new Set(matching.slice(0, KNOWLEDGE_GRAPH_LIMITS.nodes));
  const allEdges = manifest.edges.filter(edge => selected.has(edge.from) && selected.has(edge.to));
  const edges = allEdges.slice(0, KNOWLEDGE_GRAPH_LIMITS.edges).map(edge => ({ from: edge.from, to: edge.to }));
  const nodes: LayoutNode[] = [...selected].map(path => ({ path, title: docs.get(path)!.title, status: docs.get(path)!.status, degree: adjacent.get(path)?.size ?? 0, x: NaN, y: NaN }));
  if (nodes.length) {
    const links: SimulationLinkDatum<LayoutNode>[] = edges.map(edge => ({ source: edge.from, target: edge.to }));
    const simulation = forceSimulation(nodes).stop()
      .force('link', forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links).id(node => node.path).distance(70).strength(0.25))
      .force('charge', forceManyBody<LayoutNode>().strength(-110))
      .force('center', forceCenter<LayoutNode>(500, 300))
      .force('collide', forceCollide<LayoutNode>(18));
    try { simulation.tick(KNOWLEDGE_GRAPH_LIMITS.ticks); }
    finally { simulation.stop(); }
    const minX = Math.min(...nodes.map(node => node.x)), maxX = Math.max(...nodes.map(node => node.x));
    const minY = Math.min(...nodes.map(node => node.y)), maxY = Math.max(...nodes.map(node => node.y));
    const scale = Math.min(1, 880 / Math.max(1, maxX - minX), 480 / Math.max(1, maxY - minY));
    for (const node of nodes) { node.x = 500 + (node.x - (minX + maxX) / 2) * scale; node.y = 300 + (node.y - (minY + maxY) / 2) * scale; }
  }
  return { nodes: nodes.map(({ path, title, status, degree, x, y }) => ({ path, title, status, degree, x, y })), edges, total: matching.length, edgeTotal: allEdges.length,
    truncated: matching.length > nodes.length || allEdges.length > edges.length, topologyTruncated: manifest.topologyTruncated };
}
