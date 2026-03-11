'use client';

import { SketchCard } from './components';
import { useEffect, useLayoutEffect, useRef } from 'react';

type NewestSketch = Parameters<typeof SketchCard>[0]['sketch'];

export function AnimatedNewestSketchGrid({
  sketches,
  enteringSketchIds,
  isAdmin,
  playbackSpeed,
  showCursor,
  mobileColumns = 2,
  desktopColumns = 3,
  mobileVisibleCount,
}: {
  sketches: NewestSketch[];
  enteringSketchIds: string[];
  isAdmin: boolean;
  playbackSpeed: number;
  showCursor: boolean;
  mobileColumns?: 2 | 3;
  desktopColumns?: 3 | 4;
  mobileVisibleCount?: number;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const previousPositionsRef = useRef(new Map<string, DOMRect>());
  const rafRef = useRef<number | null>(null);
  const hasMeasuredRef = useRef(false);
  const sketchesRef = useRef(sketches);
  const orderSignature = sketches.map((sketch) => sketch.id).join(':');
  const mobileGridClass =
    mobileColumns === 3 ? 'grid-cols-3 sm:grid-cols-2' : 'grid-cols-2';
  const desktopGridClass =
    desktopColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';

  useEffect(() => {
    sketchesRef.current = sketches;
  }, [sketches]);

  useLayoutEffect(() => {
    const orderedSketches = sketchesRef.current;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const nextPositions = new Map<string, DOMRect>();
    for (const sketch of orderedSketches) {
      const node = itemRefs.current.get(sketch.id);
      if (!node) continue;
      nextPositions.set(sketch.id, node.getBoundingClientRect());
    }

    if (!hasMeasuredRef.current) {
      previousPositionsRef.current = nextPositions;
      hasMeasuredRef.current = true;
      return;
    }

    for (const sketch of orderedSketches) {
      const node = itemRefs.current.get(sketch.id);
      const previous = previousPositionsRef.current.get(sketch.id);
      const next = nextPositions.get(sketch.id);
      if (!node || !previous || !next) continue;

      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (dx === 0 && dy === 0) continue;

      node.style.transition = 'transform 0s';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.willChange = 'transform';
      node.getBoundingClientRect();
    }

    rafRef.current = requestAnimationFrame(() => {
      for (const sketch of orderedSketches) {
        const node = itemRefs.current.get(sketch.id);
        if (!node) continue;

        node.style.transition = 'transform 220ms ease';
        node.style.transform = 'translate(0, 0)';
      }
    });

    previousPositionsRef.current = nextPositions;

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [orderSignature]);

  useEffect(() => {
    const nodes = [...itemRefs.current.values()];
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform') return;
      const node = event.currentTarget as HTMLDivElement;
      node.style.transition = '';
      node.style.willChange = '';
    };

    for (const node of nodes) {
      node.addEventListener('transitionend', handleTransitionEnd);
    }

    return () => {
      for (const node of nodes) {
        node.removeEventListener('transitionend', handleTransitionEnd);
      }
    };
  }, [orderSignature]);

  return (
    <div
      className={`grid ${mobileGridClass} ${desktopGridClass} gap-3 sm:gap-5`}
    >
      {sketches.map((sketch, index) => {
        const isEntering = enteringSketchIds.includes(sketch.id);
        const mobileVisibilityClass =
          mobileVisibleCount != null && index >= mobileVisibleCount
            ? 'hidden sm:block'
            : '';

        return (
          <div
            key={sketch.id}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(sketch.id, node);
              } else {
                itemRefs.current.delete(sketch.id);
              }
            }}
            style={
              isEntering
                ? {
                    animation:
                      'newest-prepend-enter 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                    transformOrigin: 'top center',
                  }
                : undefined
            }
            className={mobileVisibilityClass}
          >
            <SketchCard
              sketch={sketch}
              isAdmin={isAdmin}
              playbackSpeed={playbackSpeed}
              showCursor={showCursor}
            />
          </div>
        );
      })}
      <style jsx>{`
        @keyframes newest-prepend-enter {
          0% {
            opacity: 0;
            transform: translateY(-18px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
