// Types, constants, nodes, and geometry helpers for the streams diagram

export const SVG_W = 380;
export const SVG_H = 200;

export const C = {
  client: '#475569',
  navy: '#334155',
  storage: '#92400e',
  edge: '#64748b',
  edgeDim: '#cbd5e1',
};

export type NodeDef = {
  id: string;
  label: string;
  cx: number;
  cy: number;
  shape: 'circle' | 'rect' | 'cylinder';
  color: string;
  w?: number;
  h?: number;
};

export const NODES: NodeDef[] = [
  {
    id: 'writer',
    label: 'Writer',
    cx: 40,
    cy: 62,
    shape: 'circle',
    color: C.client,
  },
  {
    id: 'instant1',
    label: '',
    cx: 180,
    cy: 35,
    shape: 'rect',
    color: C.navy,
    w: 36,
    h: 28,
  },
  {
    id: 'instant2',
    label: '',
    cx: 147,
    cy: 93,
    shape: 'rect',
    color: C.navy,
    w: 36,
    h: 28,
  },
  {
    id: 'instant3',
    label: '',
    cx: 213,
    cy: 93,
    shape: 'rect',
    color: C.navy,
    w: 36,
    h: 28,
  },
  {
    id: 'storage',
    label: 'S3',
    cx: 180,
    cy: 158,
    shape: 'cylinder',
    color: C.storage,
    w: 46,
    h: 28,
  },
  {
    id: 'readerA',
    label: 'Reader A',
    cx: 330,
    cy: 30,
    shape: 'circle',
    color: C.client,
  },
  {
    id: 'readerB',
    label: 'Reader B',
    cx: 330,
    cy: 90,
    shape: 'circle',
    color: C.client,
  },
  {
    id: 'readerC',
    label: 'Reader C',
    cx: 330,
    cy: 150,
    shape: 'circle',
    color: C.client,
  },
];

export type Anchor =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

export type EdgeDef = {
  from: string;
  to: string;
  bend?: number;
  stream?: boolean;
  streamDelay?: number;
  bidi?: boolean;
  enterDelay?: number;
  autoExit?: number;
  grow?: boolean;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  dim?: boolean;
  flush?: number;
  shrink?: boolean;
  shrinkDelay?: number; // seconds from step start when shrink begins
  shrinkToward?: 'from' | 'to';
  sendOffsetNode?: string; // initialize edgeSent to nodeArrived[this node] on first appearance
};

export type Step = {
  title: string;
  description: string;
  activeNodes: string[];
  activeEdges: EdgeDef[];
  dimNodes?: string[];
  dimEdges?: EdgeDef[];
};

export type EdgeGeo = {
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  d: string;
};

export type Particle = {
  geo: EdgeGeo;
  progress: number;
  size: number;
  n: number;
  dim?: boolean;
};

export type FlushEdgeRender = {
  key: string;
  geo: EdgeGeo;
  dashOffset: number;
};

// --- Constants ---

export const EDGE_GAP = 5;
export const GROW_SPEED = 200; // pixels per second
export const PARTICLE_PX_SPEED = 80; // pixels per second
export const SPAWN_INTERVAL = 0.7;
export const BASE_PARTICLE_SIZE = 1.8;
export const MAX_PARTICLE_SIZE = 4;
export const COMBINE_THRESHOLD = 3;
export const PARTICLE_STAGGER_PROGRESS = 0.2;

// --- Geometry helpers ---

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

export function nodeCenter(id: string) {
  const n = NODES.find((n) => n.id === id)!;
  return { x: n.cx, y: n.cy };
}

function nodeHalfSize(n: NodeDef) {
  if (n.shape === 'circle') return { hw: 15, hh: 13 };
  if (n.shape === 'cylinder') return { hw: 14, hh: 14 };
  return { hw: (n.w ?? 36) / 2, hh: (n.h ?? 28) / 2 };
}

export function nodeAnchorPoint(id: string, anchor: Anchor) {
  const n = NODES.find((n) => n.id === id)!;
  const { hw, hh } = nodeHalfSize(n);
  switch (anchor) {
    case 'top':
      return { x: r2(n.cx), y: r2(n.cy - hh - EDGE_GAP) };
    case 'bottom':
      return { x: r2(n.cx), y: r2(n.cy + hh + EDGE_GAP) };
    case 'left':
      return { x: r2(n.cx - hw - EDGE_GAP), y: r2(n.cy) };
    case 'right':
      return { x: r2(n.cx + hw + EDGE_GAP), y: r2(n.cy) };
    case 'bottom-left':
      return { x: r2(n.cx - hw - 2), y: r2(n.cy + hh + 2) };
    case 'bottom-right':
      return { x: r2(n.cx + hw + EDGE_GAP), y: r2(n.cy + hh) };
    case 'top-left':
      return { x: r2(n.cx - hw - EDGE_GAP), y: r2(n.cy - hh) };
    case 'top-right':
      return { x: r2(n.cx + hw + EDGE_GAP), y: r2(n.cy - hh) };
  }
}

export function nodeBorderPoint(id: string, toX: number, toY: number) {
  const n = NODES.find((n) => n.id === id)!;
  const dx = toX - n.cx;
  const dy = toY - n.cy;
  const { hw, hh } = nodeHalfSize(n);
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 0.01 && ady < 0.01) {
    return { x: r2(n.cx), y: r2(n.cy + hh + EDGE_GAP) };
  }
  const t = Math.min(
    adx > 0 ? hw / adx : Infinity,
    ady > 0 ? hh / ady : Infinity,
  );
  const len = Math.sqrt(dx * dx + dy * dy);
  const gx = (dx / len) * EDGE_GAP;
  const gy = (dy / len) * EDGE_GAP;
  return { x: r2(n.cx + dx * t + gx), y: r2(n.cy + dy * t + gy) };
}

export function edgeGeo(e: EdgeDef): EdgeGeo {
  const fc = nodeCenter(e.from);
  const tc = nodeCenter(e.to);

  const mx = (fc.x + tc.x) / 2;
  const my = (fc.y + tc.y) / 2;
  let cpx = mx,
    cpy = my;

  if (e.bend) {
    const dx = tc.x - fc.x;
    const dy = tc.y - fc.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    cpx = r2(mx + (-dy / len) * e.bend);
    cpy = r2(my + (dx / len) * e.bend);
  }

  const from = e.fromAnchor
    ? nodeAnchorPoint(e.from, e.fromAnchor)
    : e.bend
      ? nodeBorderPoint(e.from, cpx, cpy)
      : nodeBorderPoint(e.from, tc.x, tc.y);
  const to = e.toAnchor
    ? nodeAnchorPoint(e.to, e.toAnchor)
    : e.bend
      ? nodeBorderPoint(e.to, cpx, cpy)
      : nodeBorderPoint(e.to, fc.x, fc.y);

  const finalCpx = e.bend ? cpx : r2((from.x + to.x) / 2);
  const finalCpy = e.bend ? cpy : r2((from.y + to.y) / 2);

  const d = e.bend
    ? `M${from.x},${from.y} Q${cpx},${cpy} ${to.x},${to.y}`
    : `M${from.x},${from.y} L${to.x},${to.y}`;

  return {
    x1: from.x,
    y1: from.y,
    cx: finalCpx,
    cy: finalCpy,
    x2: to.x,
    y2: to.y,
    d,
  };
}

export function bezierPoint(geo: EdgeGeo, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * geo.x1 + 2 * mt * t * geo.cx + t * t * geo.x2,
    y: mt * mt * geo.y1 + 2 * mt * t * geo.cy + t * t * geo.y2,
  };
}

export function edgeLength(geo: EdgeGeo): number {
  const steps = 20;
  let len = 0;
  let prev = bezierPoint(geo, 0);
  for (let i = 1; i <= steps; i++) {
    const p = bezierPoint(geo, i / steps);
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    len += Math.sqrt(dx * dx + dy * dy);
    prev = p;
  }
  return len;
}

export function edgeKey(e: EdgeDef) {
  return `${e.from}->${e.to}`;
}

export function edgeGrowDurationS(e: EdgeDef): number {
  return edgeLength(edgeGeo(e)) / GROW_SPEED;
}
