'use client';

import { topPageQuery } from '@/lib/browse-queries';
import { db } from '@/lib/db';
import {
  reconcileOptimisticVotes,
  useOptimisticVoteScores,
} from '@/lib/vote-store';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { AuthHeader, SketchCard } from '../components';

const PAGE_SIZE = 50;

function SignedInTopGallery() {
  const user = db.useUser();
  return (
    <TopGalleryContent
      userId={user.id}
      isAdmin={!!user.email?.endsWith('@instantdb.com')}
    />
  );
}

function TopGalleryContent({
  userId,
  isAdmin,
}: {
  userId?: string;
  isAdmin?: boolean;
}) {
  const { data: settingsData } = db.useQuery(
    userId ? { userSettings: { $: { where: { 'owner.id': userId } } } } : null,
  );
  const userSettings = settingsData?.userSettings?.[0];
  const playbackSpeed = userSettings?.playbackSpeed ?? 2;
  const showCursor = userSettings?.showCursor ?? true;

  const [page, setPage] = useState(0);
  const optimisticScores = useOptimisticVoteScores();

  const { data } = db.useSuspenseQuery(topPageQuery(userId));

  useEffect(() => {
    reconcileOptimisticVotes(data.sketches ?? []);
  }, [data.sketches]);

  const sortedSketches = [...(data.sketches ?? [])]
    .filter((s) => !s.flagged || s.author?.id === userId)
    .sort((a, b) => {
      const scoreDelta =
        (optimisticScores[b.id]?.score ?? b.score ?? 0) -
        (optimisticScores[a.id]?.score ?? a.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return b.createdAt - a.createdAt;
    });
  const startIndex = page * PAGE_SIZE;
  const sketches = sortedSketches.slice(startIndex, startIndex + PAGE_SIZE);

  const hasPrev = page > 0;
  const hasNext = startIndex + PAGE_SIZE < sortedSketches.length;

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader label="Live Feed" title="Top" />

        {sketches.length === 0 && !hasPrev ? (
          <div className="text-text-tertiary py-12 text-center sm:py-20">
            <p className="mb-4 text-5xl sm:text-6xl">🏆</p>
            <p className="text-text-secondary text-base font-medium sm:text-lg">
              No top sketches yet
            </p>
          </div>
        ) : (
          <>
            <AnimatedTopGrid
              sketches={sketches}
              isAdmin={!!isAdmin}
              playbackSpeed={playbackSpeed}
              showCursor={showCursor}
            />
            <Pagination
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => {
                setPage((current) => Math.max(0, current - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNext={() => {
                setPage((current) => current + 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AnimatedTopGrid({
  sketches,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  sketches: Parameters<typeof SketchCard>[0]['sketch'][];
  isAdmin: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const previousPositionsRef = useRef(new Map<string, DOMRect>());
  const rafRef = useRef<number | null>(null);
  const hasMeasuredRef = useRef(false);

  useLayoutEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const nextPositions = new Map<string, DOMRect>();
    for (const sketch of sketches) {
      const node = itemRefs.current.get(sketch.id);
      if (!node) continue;
      nextPositions.set(sketch.id, node.getBoundingClientRect());
    }

    if (!hasMeasuredRef.current) {
      previousPositionsRef.current = nextPositions;
      hasMeasuredRef.current = true;
      return;
    }

    for (const sketch of sketches) {
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
      for (const sketch of sketches) {
        const node = itemRefs.current.get(sketch.id);
        if (!node) continue;

        node.style.transition = 'transform 200ms ease';
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
  }, [sketches]);

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
  }, [sketches]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
      {sketches.map((sketch) => (
        <div
          key={sketch.id}
          ref={(node) => {
            if (node) {
              itemRefs.current.set(sketch.id, node);
            } else {
              itemRefs.current.delete(sketch.id);
            }
          }}
        >
          <SketchCard
            sketch={sketch}
            isAdmin={isAdmin}
            playbackSpeed={playbackSpeed}
            showCursor={showCursor}
          />
        </div>
      ))}
    </div>
  );
}

function Pagination({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!hasPrev && !hasNext) return null;
  return (
    <div className="flex items-center justify-center gap-3 pb-4">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="border-border-strong text-text-secondary hover:bg-hover cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        Previous
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="border-border-strong text-text-secondary hover:bg-hover cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        Next
      </button>
    </div>
  );
}

export default function TopPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInTopGallery />
      </db.SignedIn>
      <db.SignedOut>
        <TopGalleryContent />
      </db.SignedOut>
    </>
  );
}
