'use client';

import { AnimatedTopSketchGrid } from '../AnimatedTopSketchGrid';
import { DEFAULT_PAGE_SIZE, topPageQuery } from '@/lib/browse-queries';
import { db } from '@/lib/db';
import {
  reconcileOptimisticVotes,
  useOptimisticVoteScores,
} from '@/lib/vote-store';
import { useEffect, useState } from 'react';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { AuthHeader } from '../components';

function SignedInTopGallery() {
  const user = db.useUser();
  return (
    <TopGalleryContent
      user={user}
      userId={user.id}
      isAdmin={!!user.email?.endsWith('@instantdb.com')}
    />
  );
}

function TopGalleryContent({
  user,
  userId,
  isAdmin,
}: {
  user?: { id?: string | null; type?: string | null };
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

  const { data } = db.useSuspenseQuery(topPageQuery(user));

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
  const startIndex = page * DEFAULT_PAGE_SIZE;
  const sketches = sortedSketches.slice(
    startIndex,
    startIndex + DEFAULT_PAGE_SIZE,
  );

  const hasPrev = page > 0;
  const hasNext = startIndex + DEFAULT_PAGE_SIZE < sortedSketches.length;

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
            <AnimatedTopSketchGrid
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
