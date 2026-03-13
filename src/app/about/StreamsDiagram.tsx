'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  C,
  EDGE_GAP,
  GROW_SPEED,
  MAX_PARTICLE_SIZE,
  NODES,
  PARTICLE_PX_SPEED,
  PARTICLE_STAGGER_PROGRESS,
  SVG_H,
  SVG_W,
  type EdgeGeo,
  edgeGeo,
  edgeKey,
  edgeLength,
  type EdgeDef,
} from './diagram-data';
import { STEPS } from './diagram-steps';
import { useParticles } from './useParticles';
import { CleanNode } from './CleanNode';

function AnimatedEdgePath({
  edge,
  active,
}: {
  edge: EdgeDef;
  active: boolean;
}) {
  const groupRef = useRef<SVGGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const geo = edgeGeo(edge);
  const dimEdge = active && edge.dim;
  const baseOpacity = active ? (dimEdge ? 0.25 : 1) : 0.15;

  const isGrow = active && edge.grow;
  const isShrink = active && edge.shrink;
  const hasPathAnim = isGrow || isShrink;
  const growDurationMs = (edgeLength(geo) / GROW_SPEED) * 1000;
  const shrinkDurationMs = (edgeLength(geo) / PARTICLE_PX_SPEED) * 1000;
  const particleTrailDelayMs =
    edge.stream === false ? 0 : PARTICLE_STAGGER_PROGRESS * shrinkDurationMs;
  const shrinkDelayMs =
    ((edge.shrinkDelay ?? 0) -
      (edge.enterDelay ?? 0) +
      (EDGE_GAP + MAX_PARTICLE_SIZE) / PARTICLE_PX_SPEED) *
      1000 +
    particleTrailDelayMs;

  useLayoutEffect(() => {
    const group = groupRef.current;
    const path = pathRef.current;
    if (!group || !path) return;

    const timers: number[] = [];
    const rafs: number[] = [];

    const setOpacity = (value: number) => {
      group.style.opacity = String(value);
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const setSegment = (fromT: number, toT: number) => {
      const x1 = lerp(geo.x1, geo.x2, fromT);
      const y1 = lerp(geo.y1, geo.y2, fromT);
      const x2 = lerp(geo.x1, geo.x2, toT);
      const y2 = lerp(geo.y1, geo.y2, toT);
      path.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
    };

    const resetPath = () => {
      path.setAttribute('d', geo.d);
    };

    const runAnimation = (
      delayMs: number,
      durationMs: number,
      update: (progress: number) => void,
    ) => {
      const timer = window.setTimeout(
        () => {
          let start = 0;
          const tick = (now: number) => {
            if (!start) start = now;
            const progress =
              durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
            update(progress);
            if (progress < 1) {
              const raf = requestAnimationFrame(tick);
              rafs.push(raf);
            }
          };
          const raf = requestAnimationFrame(tick);
          rafs.push(raf);
        },
        Math.max(0, delayMs),
      );
      timers.push(timer);
    };

    setOpacity(baseOpacity);
    if (hasPathAnim) {
      if (isGrow) {
        setSegment(0, 0);
      } else {
        resetPath();
      }
    } else {
      resetPath();
    }

    if (isGrow) {
      runAnimation(0, growDurationMs, (progress) => {
        setOpacity(baseOpacity);
        const eased = (1 - progress) * (1 - progress);
        setSegment(0, 1 - eased);
      });
    }

    if (isShrink) {
      runAnimation(shrinkDelayMs, shrinkDurationMs, (progress) => {
        if (edge.shrinkToward === 'from') {
          setSegment(0, 1 - progress);
        } else {
          setSegment(progress, 1);
        }
        if (progress >= 1) {
          setOpacity(0);
        }
      });
    }

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      rafs.forEach((raf) => cancelAnimationFrame(raf));
      resetPath();
    };
  }, [
    active,
    baseOpacity,
    edge.stream,
    edge.shrinkToward,
    geo.d,
    geo.x1,
    geo.x2,
    geo.y1,
    geo.y2,
    growDurationMs,
    hasPathAnim,
    isGrow,
    isShrink,
    shrinkDelayMs,
    shrinkDurationMs,
  ]);

  return (
    <g
      ref={groupRef}
      opacity={baseOpacity}
      style={{ transition: 'opacity 0.4s ease-out' }}
    >
      <path
        ref={pathRef}
        d={geo.d}
        fill="none"
        stroke={active && !dimEdge ? C.edge : C.edgeDim}
        strokeWidth={active ? 1.5 : 0.8}
        strokeLinecap="round"
        markerEnd={!active ? 'url(#arrow-dim)' : undefined}
      />
    </g>
  );
}

function ParticleSprite({
  particle,
}: {
  particle: {
    points: Array<{ x: number; y: number }>;
    size: number;
    n: number;
    dim?: boolean;
    durMs: number;
  };
}) {
  const ref = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const samples = particle.points;
    const lastIdx = samples.length - 1;
    let raf = 0;
    let start = 0;

    const applyPoint = (x: number, y: number) => {
      node.setAttribute('cx', String(x));
      node.setAttribute('cy', String(y));
    };

    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = Math.min(now - start, particle.durMs);
      const progress =
        particle.durMs === 0 ? 1 : Math.min(1, elapsed / particle.durMs);
      const scaled = progress * lastIdx;
      const idx = Math.min(lastIdx - 1, Math.floor(scaled));
      const localT = scaled - idx;
      const from = samples[idx] ?? samples[lastIdx];
      const to = samples[idx + 1] ?? samples[lastIdx];
      const x = from.x + (to.x - from.x) * localT;
      const y = from.y + (to.y - from.y) * localT;

      applyPoint(x, y);

      if (elapsed < particle.durMs) {
        raf = requestAnimationFrame(tick);
      }
    };

    applyPoint(samples[0].x, samples[0].y);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [particle.durMs, particle.points]);

  return (
    <circle
      ref={ref}
      cx={particle.points[0]?.x ?? 0}
      cy={particle.points[0]?.y ?? 0}
      r={particle.size}
      fill={
        particle.dim
          ? C.edgeDim
          : ['#5b8a9a', '#7a9a82', '#a0896c', '#8b7ea6'][particle.n % 4]
      }
      opacity={particle.dim ? 0.3 : 0.9}
      filter={particle.dim ? undefined : 'url(#particle-glow)'}
    />
  );
}

function FlushEdgePath({
  flushEdge,
}: {
  flushEdge: {
    geo: EdgeGeo;
    phase: 'growing' | 'streaming' | 'draining' | 'shrinking';
    durMs?: number;
  };
}) {
  const ref = useRef<SVGPathElement | null>(null);

  useLayoutEffect(() => {
    const path = ref.current;
    if (!path) return;

    let raf = 0;
    let start = 0;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const setSegment = (fromT: number, toT: number) => {
      const x1 = lerp(flushEdge.geo.x1, flushEdge.geo.x2, fromT);
      const y1 = lerp(flushEdge.geo.y1, flushEdge.geo.y2, fromT);
      const x2 = lerp(flushEdge.geo.x1, flushEdge.geo.x2, toT);
      const y2 = lerp(flushEdge.geo.y1, flushEdge.geo.y2, toT);
      path.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
    };

    if (flushEdge.phase === 'streaming' || flushEdge.phase === 'draining') {
      path.setAttribute('d', flushEdge.geo.d);
      return;
    }

    const durationMs = flushEdge.durMs ?? 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const progress =
        durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
      if (flushEdge.phase === 'growing') {
        setSegment(0, progress);
      } else {
        setSegment(progress, 1);
      }
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    if (flushEdge.phase === 'growing') {
      setSegment(0, 0);
    } else {
      path.setAttribute('d', flushEdge.geo.d);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      path.setAttribute('d', flushEdge.geo.d);
    };
  }, [
    flushEdge.durMs,
    flushEdge.geo.d,
    flushEdge.geo.x1,
    flushEdge.geo.x2,
    flushEdge.geo.y1,
    flushEdge.geo.y2,
    flushEdge.phase,
  ]);

  return (
    <path
      ref={ref}
      d={flushEdge.geo.d}
      fill="none"
      stroke={C.edge}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
}

export function StreamsDiagram() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const step = STEPS[stepIdx];

  useEffect(() => {
    const thresholds = [
      ...new Set(
        step.activeEdges.flatMap((edge) =>
          [edge.enterDelay, edge.autoExit].filter(
            (value): value is number => value != null && value > 0,
          ),
        ),
      ),
    ].sort((a, b) => a - b);

    if (thresholds.length === 0) return;

    const timers = thresholds.map((threshold) =>
      window.setTimeout(() => {
        setElapsed((prev) => Math.max(prev, threshold));
      }, threshold * 1000),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [step.activeEdges, stepIdx]);

  const visibleActiveEdges = useMemo(
    () =>
      step.activeEdges.filter((edge) => {
        const enter = edge.enterDelay ?? 0;
        const exit = edge.autoExit ?? Infinity;
        return elapsed >= enter && elapsed < exit;
      }),
    [elapsed, step.activeEdges],
  );

  const { particles, flushEdges } = useParticles(step.activeEdges, stepIdx);

  const activeNodeSet = new Set(step.activeNodes);
  const dimNodeSet = new Set(step.dimNodes ?? []);
  const allEdges = useMemo(
    () => [
      ...visibleActiveEdges
        .filter((e) => e.flush == null)
        .map((edge, index) => ({
          id: `active:${index}:${edgeKey(edge)}`,
          edge,
          active: true,
        })),
      ...(step.dimEdges ?? []).map((edge, index) => ({
        id: `dim:${index}:${edgeKey(edge)}`,
        edge,
        active: false,
      })),
    ],
    [step.dimEdges, visibleActiveEdges],
  );

  const goToStep = useCallback((idx: number) => {
    setStepIdx(idx);
    setElapsed(0);
  }, []);
  const prev = useCallback(
    () => goToStep(Math.max(0, stepIdx - 1)),
    [goToStep, stepIdx],
  );
  const next = useCallback(
    () => goToStep(stepIdx === STEPS.length - 1 ? 0 : stepIdx + 1),
    [goToStep, stepIdx],
  );

  return (
    <div className="bg-surface mx-auto max-w-lg overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/[0.06]">
      {/* SVG area */}
      <div className="relative overflow-x-auto px-2 pt-3 pb-1">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full">
          <defs>
            <filter
              id="particle-glow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="2"
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="arrow"
              viewBox="0 0 6 6"
              refX="5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L5.5,3 L0,5.5Z" fill={C.edge} />
            </marker>
            <marker
              id="arrow-dim"
              viewBox="0 0 6 6"
              refX="5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L5.5,3 L0,5.5Z" fill={C.edgeDim} />
            </marker>
            <marker
              id="arrow-start"
              viewBox="0 0 6 6"
              refX="5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L5.5,3 L0,5.5Z" fill={C.edge} />
            </marker>
          </defs>

          {/* Server group label */}
          <text
            x={180}
            y={10}
            textAnchor="middle"
            className="pointer-events-none text-[9px] font-semibold select-none"
            fill={C.navy}
            opacity={1}
          >
            Instant Servers
          </text>

          {/* Edges */}
          {allEdges.map(({ id, edge, active }) => {
            return <AnimatedEdgePath key={id} edge={edge} active={active} />;
          })}

          {/* Flush edges (grow/shrink animation) */}
          {flushEdges.map((f) => (
            <FlushEdgePath key={f.key} flushEdge={f} />
          ))}

          {/* Particles (behind nodes so they disappear into icons) */}
          {particles.map((p) => {
            return <ParticleSprite key={p.id} particle={p} />;
          })}

          {/* Nodes */}
          {NODES.map((node) => {
            const active = activeNodeSet.has(node.id);
            const dim = dimNodeSet.has(node.id);
            return (
              <g key={node.id}>
                <CleanNode node={node} filled={active} dim={dim} />
                {node.label && (
                  <text
                    x={node.cx}
                    y={
                      node.shape === 'circle' || node.shape === 'cylinder'
                        ? node.cy + 21
                        : node.cy + 1
                    }
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none text-[9px] font-semibold select-none"
                    fill={dim ? C.edgeDim : active ? C.navy : 'currentColor'}
                    opacity={dim ? 0.6 : active ? 1 : 0.6}
                  >
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Controls + description */}
      <div className="border-t border-black/[0.06] px-4 py-3 sm:px-5">
        {/* Step indicator bar */}
        <div className="mb-3 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              aria-label={`Step ${i + 1}: ${s.title}`}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i === stepIdx
                  ? 'bg-accent'
                  : i < stepIdx
                    ? 'bg-accent/30'
                    : 'bg-border-strong/50'
              }`}
            />
          ))}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="min-h-[9rem] sm:min-h-[7rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <h3 className="text-text-primary text-sm leading-tight font-semibold">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary mt-1.5 text-xs leading-relaxed sm:text-sm">
                    {step.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pt-3">
            <button
              onClick={prev}
              disabled={stepIdx === 0}
              aria-label="Previous step"
              className="text-text-secondary hover:bg-hover flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90 disabled:opacity-20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={next}
              disabled={false}
              aria-label="Next step"
              className="text-text-secondary hover:bg-hover flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90 disabled:opacity-20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
