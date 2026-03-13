import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type EdgeDef,
  type EdgeGeo,
  BASE_PARTICLE_SIZE,
  EDGE_GAP,
  GROW_SPEED,
  MAX_PARTICLE_SIZE,
  PARTICLE_PX_SPEED,
  PARTICLE_STAGGER_PROGRESS,
  SPAWN_INTERVAL,
  bezierPoint,
  edgeGeo,
  edgeKey,
  edgeLength,
} from './diagram-data';

type FlushPhase = 'idle' | 'growing' | 'streaming' | 'draining' | 'shrinking';

type SimEdge = {
  key: string;
  from: string;
  to: string;
  geo: EdgeGeo;
  undershoot: number;
  overshoot: number;
  progressPerSec: number;
  dim: boolean;
  sendOffsetNode?: string;
};

type ActiveStreamEdge = SimEdge & {
  instanceKey: string;
};

type ParticleInstance = {
  id: number;
  edgeKey: string;
  geo: EdgeGeo;
  startProgress: number;
  endProgress: number;
  progressPerSec: number;
  size: number;
  n: number;
  to: string;
  count: number;
  dim?: boolean;
};

export type AnimatedParticleRender = {
  id: number;
  points: Array<{ x: number; y: number }>;
  size: number;
  n: number;
  dim?: boolean;
  durMs: number;
};

export type AnimatedFlushEdgeRender = {
  key: string;
  geo: EdgeGeo;
  phase: Exclude<FlushPhase, 'idle'>;
  values?: string;
  keyTimes?: string;
  durMs?: number;
};

type FlushState = {
  phase: FlushPhase;
  simEdge: SimEdge;
  growDurationMs: number;
  threshold: number;
  renderKey: string;
};

const sizeVar = [0, 0.5, -0.4, 0.9, -0.2, 0.7, 0.1, -0.3, 1.0, 0.3];
const PARTICLE_MOTION_SAMPLES = 24;
const EDGE_ANIMATION_SAMPLES = 20;
const EDGE_KEY_TIMES = Array.from(
  { length: EDGE_ANIMATION_SAMPLES + 1 },
  (_, i) => (i / EDGE_ANIMATION_SAMPLES).toFixed(4),
).join(';');

function buildSimEdge(e: EdgeDef): SimEdge {
  const geo = edgeGeo(e);
  const len = edgeLength(geo);
  return {
    key: edgeKey(e),
    from: e.from,
    to: e.to,
    geo,
    undershoot: (EDGE_GAP + MAX_PARTICLE_SIZE) / len,
    overshoot: 1 + (EDGE_GAP + MAX_PARTICLE_SIZE) / len,
    progressPerSec: PARTICLE_PX_SPEED / len,
    dim: e.dim ?? false,
    sendOffsetNode: e.sendOffsetNode,
  };
}

function buildParticleMotion(p: ParticleInstance): AnimatedParticleRender {
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= PARTICLE_MOTION_SAMPLES; i++) {
    const t = i / PARTICLE_MOTION_SAMPLES;
    const progress = p.startProgress + (p.endProgress - p.startProgress) * t;
    const point = bezierPoint(p.geo, progress);
    points.push(point);
  }

  return {
    id: p.id,
    points,
    size: p.size,
    n: p.n,
    dim: p.dim,
    durMs: ((p.endProgress - p.startProgress) / p.progressPerSec) * 1000,
  };
}

function buildFlushDashValues(phase: 'growing' | 'shrinking') {
  const values: number[] = [];
  for (let i = 0; i <= EDGE_ANIMATION_SAMPLES; i++) {
    const t = i / EDGE_ANIMATION_SAMPLES;
    values.push(phase === 'growing' ? (1 - t) * (1 - t) : -t * t);
  }
  return {
    values: values.join(';'),
    keyTimes: EDGE_KEY_TIMES,
  };
}

function scheduleTimeout(
  timers: Set<number>,
  delayMs: number,
  isValid: () => boolean,
  fn: () => void,
) {
  const id = window.setTimeout(
    () => {
      timers.delete(id);
      if (!isValid()) return;
      fn();
    },
    Math.max(0, delayMs),
  );
  timers.add(id);
  return id;
}

function clearTimeouts(timers: Set<number>) {
  for (const id of timers) {
    window.clearTimeout(id);
  }
  timers.clear();
}

export function useParticles(edges: EdgeDef[], stepIdx: number) {
  const [particles, setParticles] = useState<AnimatedParticleRender[]>([]);
  const [flushEdges, setFlushEdges] = useState<AnimatedFlushEdgeRender[]>([]);

  const simTokenRef = useRef(0);
  const stepTokenRef = useRef(0);
  const stepIdxRef = useRef(stepIdx);
  const edgesRef = useRef(edges);

  const persistentTimersRef = useRef(new Set<number>());
  const stepTimersRef = useRef(new Set<number>());
  const writerTimerRef = useRef<number | null>(null);
  const writerLoopActiveRef = useRef(false);

  const nodeArrivedRef = useRef(new Map<string, number>());
  const edgeSentRef = useRef(new Map<string, number>());
  const writerCountRef = useRef(0);

  const activeStreamsRef = useRef(new Map<string, ActiveStreamEdge>());
  const flushRef = useRef<FlushState | null>(null);
  const liveCountsRef = useRef(new Map<string, number>());
  const replayStorageAvailableRef = useRef<number | null>(null);

  const nextParticleIdRef = useRef(0);
  const nextFlushRenderIdRef = useRef(0);

  const schedulePersistent = useCallback((delayMs: number, fn: () => void) => {
    const simToken = simTokenRef.current;
    return scheduleTimeout(
      persistentTimersRef.current,
      delayMs,
      () => simTokenRef.current === simToken,
      fn,
    );
  }, []);

  const scheduleStep = useCallback((delayMs: number, fn: () => void) => {
    const simToken = simTokenRef.current;
    const stepToken = stepTokenRef.current;
    return scheduleTimeout(
      stepTimersRef.current,
      delayMs,
      () =>
        simTokenRef.current === simToken && stepTokenRef.current === stepToken,
      fn,
    );
  }, []);

  useEffect(() => {
    stepIdxRef.current = stepIdx;
    edgesRef.current = edges;
  }, [edges, stepIdx]);

  useEffect(() => {
    const persistentTimers = persistentTimersRef.current;
    const stepTimers = stepTimersRef.current;
    return () => {
      if (writerTimerRef.current != null) {
        window.clearTimeout(writerTimerRef.current);
        writerTimerRef.current = null;
      }
      writerLoopActiveRef.current = false;
      clearTimeouts(persistentTimers);
      clearTimeouts(stepTimers);
    };
  }, []);

  useEffect(() => {
    function getAvailable(nodeId: string) {
      if (nodeId === 'writer') {
        return writerCountRef.current;
      }
      if (nodeId === 'storage' && stepIdxRef.current === 6) {
        return replayStorageAvailableRef.current ?? 0;
      }
      return nodeArrivedRef.current.get(nodeId) ?? 0;
    }

    function renderFlush(flush: FlushState | null) {
      if (!flush || flush.phase === 'idle') {
        setFlushEdges((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      if (flush.phase === 'streaming' || flush.phase === 'draining') {
        setFlushEdges([
          {
            key: flush.renderKey,
            geo: flush.simEdge.geo,
            phase: flush.phase,
          },
        ]);
        return;
      }

      const { values, keyTimes } = buildFlushDashValues(
        flush.phase === 'growing' ? 'growing' : 'shrinking',
      );
      setFlushEdges([
        {
          key: flush.renderKey,
          geo: flush.simEdge.geo,
          phase: flush.phase,
          values,
          keyTimes,
          durMs: flush.growDurationMs,
        },
      ]);
    }

    function maybeStartFlushFromIdle() {
      const flush = flushRef.current;
      if (!flush || flush.phase !== 'idle') return;

      const available = getAvailable(flush.simEdge.from);
      const sent = edgeSentRef.current.get(flush.simEdge.key) ?? 0;
      if (available - sent < flush.threshold) return;

      flush.phase = 'growing';
      flush.renderKey = `${flush.simEdge.key}:flush:${nextFlushRenderIdRef.current++}`;
      renderFlush(flush);

      scheduleStep(flush.growDurationMs, () => {
        const current = flushRef.current;
        if (!current || current.phase !== 'growing') return;
        current.phase = 'streaming';
        renderFlush(current);
        processActiveEdges();
      });
    }

    function startFlushShrinking() {
      const flush = flushRef.current;
      if (!flush || flush.phase !== 'draining') return;

      flush.phase = 'shrinking';
      flush.renderKey = `${flush.simEdge.key}:flush:${nextFlushRenderIdRef.current++}`;
      renderFlush(flush);

      scheduleStep(flush.growDurationMs, () => {
        const current = flushRef.current;
        if (!current || current.phase !== 'shrinking') return;
        current.phase = 'idle';
        renderFlush(current);
        maybeStartFlushFromIdle();
      });
    }

    function startFlushDraining() {
      const flush = flushRef.current;
      if (!flush || flush.phase !== 'streaming') return;

      flush.phase = 'draining';
      renderFlush(flush);

      if ((liveCountsRef.current.get(flush.simEdge.key) ?? 0) === 0) {
        startFlushShrinking();
      }
    }

    function processActiveEdges() {
      maybeStartFlushFromIdle();

      const streamEdges = [...activeStreamsRef.current.values()];
      const flush = flushRef.current;
      const spawnEdges =
        flush && flush.phase === 'streaming'
          ? [...streamEdges, { ...flush.simEdge, instanceKey: flush.renderKey }]
          : streamEdges;

      const spawned: AnimatedParticleRender[] = [];
      let changed = true;
      let iterations = 0;

      while (changed && iterations < 5) {
        changed = false;
        iterations++;

        for (const se of spawnEdges) {
          const available = getAvailable(se.from);
          let sent = edgeSentRef.current.get(se.key);
          if (sent == null) {
            sent = se.sendOffsetNode
              ? (nodeArrivedRef.current.get(se.sendOffsetNode) ?? 0)
              : 0;
            edgeSentRef.current.set(se.key, sent);
          }
          if (available <= sent) continue;

          const batch = available - sent;
          const particlesToSpawn: ParticleInstance[] = [];

          if (batch > 8) {
            const weight = Math.min(batch, 10);
            particlesToSpawn.push({
              id: nextParticleIdRef.current++,
              edgeKey: se.key,
              geo: se.geo,
              startProgress: -se.undershoot,
              endProgress: se.overshoot,
              progressPerSec: se.progressPerSec,
              size: BASE_PARTICLE_SIZE * 1.8,
              n: sent,
              to: se.to,
              count: weight,
              dim: se.dim,
            });
            edgeSentRef.current.set(se.key, sent + weight);
          } else {
            const toSpawn = Math.min(batch, 2);
            for (let i = 0; i < toSpawn; i++) {
              const n = sent + i;
              particlesToSpawn.push({
                id: nextParticleIdRef.current++,
                edgeKey: se.key,
                geo: se.geo,
                startProgress: -se.undershoot - i * PARTICLE_STAGGER_PROGRESS,
                endProgress: se.overshoot,
                progressPerSec: se.progressPerSec,
                size: BASE_PARTICLE_SIZE + sizeVar[n % sizeVar.length],
                n,
                to: se.to,
                count: 1,
                dim: se.dim,
              });
            }
            edgeSentRef.current.set(se.key, sent + toSpawn);
          }

          for (const particle of particlesToSpawn) {
            const renderParticle = buildParticleMotion(particle);
            liveCountsRef.current.set(
              particle.edgeKey,
              (liveCountsRef.current.get(particle.edgeKey) ?? 0) + 1,
            );
            spawned.push(renderParticle);

            schedulePersistent(renderParticle.durMs, () => {
              setParticles((prev) => prev.filter((p) => p.id !== particle.id));

              const nextLive =
                (liveCountsRef.current.get(particle.edgeKey) ?? 1) - 1;
              if (nextLive <= 0) {
                liveCountsRef.current.delete(particle.edgeKey);
              } else {
                liveCountsRef.current.set(particle.edgeKey, nextLive);
              }

              nodeArrivedRef.current.set(
                particle.to,
                (nodeArrivedRef.current.get(particle.to) ?? 0) + particle.count,
              );

              const currentFlush = flushRef.current;
              if (
                currentFlush &&
                currentFlush.phase === 'draining' &&
                currentFlush.simEdge.key === particle.edgeKey &&
                !liveCountsRef.current.has(particle.edgeKey)
              ) {
                startFlushShrinking();
              }

              processActiveEdges();
            });
          }

          changed = true;
        }
      }

      if (spawned.length > 0) {
        setParticles((prev) => [...prev, ...spawned]);
      }

      const currentFlush = flushRef.current;
      if (currentFlush && currentFlush.phase === 'streaming') {
        const available = getAvailable(currentFlush.simEdge.from);
        const sent = edgeSentRef.current.get(currentFlush.simEdge.key) ?? 0;
        if (sent >= available) {
          startFlushDraining();
        }
      }
    }

    function stopWriterLoop() {
      writerLoopActiveRef.current = false;
      if (writerTimerRef.current != null) {
        window.clearTimeout(writerTimerRef.current);
        writerTimerRef.current = null;
      }
    }

    function startWriterLoop() {
      if (writerLoopActiveRef.current) return;
      writerLoopActiveRef.current = true;

      const tick = () => {
        writerTimerRef.current = null;
        if (!writerLoopActiveRef.current || stepIdxRef.current >= 5) {
          writerLoopActiveRef.current = false;
          return;
        }

        writerCountRef.current += 1;
        processActiveEdges();

        writerTimerRef.current = window.setTimeout(tick, SPAWN_INTERVAL * 1000);
      };

      writerTimerRef.current = window.setTimeout(tick, SPAWN_INTERVAL * 1000);
    }

    if (stepIdx === 0) {
      simTokenRef.current++;
      clearTimeouts(persistentTimersRef.current);
      stopWriterLoop();
      writerCountRef.current = 0;
      nodeArrivedRef.current.clear();
      edgeSentRef.current.clear();
      liveCountsRef.current.clear();
      schedulePersistent(0, () => {
        setParticles((prev) => (prev.length === 0 ? prev : []));
      });
      startWriterLoop();
    }

    if (stepIdx < 5) {
      startWriterLoop();
    } else {
      stopWriterLoop();
    }

    stepTokenRef.current++;
    clearTimeouts(stepTimersRef.current);
    activeStreamsRef.current.clear();
    flushRef.current = null;
    replayStorageAvailableRef.current =
      stepIdx === 6
        ? Math.max(nodeArrivedRef.current.get('storage') ?? 0, 10)
        : null;
    scheduleStep(0, () => {
      setFlushEdges((prev) => (prev.length === 0 ? prev : []));
    });

    const currentEdges = edgesRef.current;
    const streamEdges = currentEdges.filter(
      (edge) => edge.stream !== false && edge.flush == null,
    );

    streamEdges.forEach((edge, index) => {
      const instanceKey = `${edgeKey(edge)}:${index}`;
      const simEdge: ActiveStreamEdge = {
        ...buildSimEdge(edge),
        instanceKey,
      };

      const activate = () => {
        activeStreamsRef.current.set(instanceKey, simEdge);
        processActiveEdges();
      };

      const deactivate = () => {
        activeStreamsRef.current.delete(instanceKey);
      };

      const streamEnterDelayMs =
        Math.max(
          edge.enterDelay ?? 0,
          edge.streamDelay ?? edge.enterDelay ?? 0,
        ) * 1000;
      if (streamEnterDelayMs > 0) {
        scheduleStep(streamEnterDelayMs, activate);
      } else {
        activate();
      }

      const exitAt =
        edge.autoExit == null
          ? edge.shrinkDelay
          : edge.shrinkDelay == null
            ? edge.autoExit
            : Math.min(edge.autoExit, edge.shrinkDelay);

      if (exitAt != null) {
        scheduleStep(exitAt * 1000, deactivate);
      }
    });

    const flushEdge = currentEdges.find((edge) => edge.flush != null);
    if (flushEdge) {
      const initFlush = () => {
        const simEdge = buildSimEdge(flushEdge);
        flushRef.current = {
          phase: 'growing',
          simEdge,
          growDurationMs: (edgeLength(edgeGeo(flushEdge)) / GROW_SPEED) * 1000,
          threshold: flushEdge.flush!,
          renderKey: `${simEdge.key}:flush:${nextFlushRenderIdRef.current++}`,
        };
        renderFlush(flushRef.current);

        scheduleStep(flushRef.current.growDurationMs, () => {
          const current = flushRef.current;
          if (!current || current.phase !== 'growing') return;
          current.phase = 'streaming';
          renderFlush(current);
          processActiveEdges();
        });
      };

      const enterDelayMs = (flushEdge.enterDelay ?? 0) * 1000;
      if (enterDelayMs > 0) {
        scheduleStep(enterDelayMs, initFlush);
      } else {
        initFlush();
      }
    }

    if (stepIdx !== 0 && persistentTimersRef.current.size === 0) {
      startWriterLoop();
    }
  }, [schedulePersistent, scheduleStep, stepIdx]);

  return { particles, flushEdges };
}
