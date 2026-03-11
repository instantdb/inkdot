'use client';

import { db } from '@/lib/db';
import {
  DEFAULT_PAGE_SIZE,
  newestPageQuery,
  type GalleryCursor,
} from '@/lib/browse-queries';
import { useState } from 'react';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { AuthHeader, SketchCard } from '../components';

function SignedInNewestGallery() {
  const user = db.useUser();
  return (
    <NewestGalleryContent
      userId={user.id}
      isAdmin={!!user.email?.endsWith('@instantdb.com')}
    />
  );
}

function NewestGalleryContent({
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

  const [cursors, setCursors] = useState<{
    first?: number;
    after?: GalleryCursor;
    last?: number;
    before?: GalleryCursor;
  }>({ first: DEFAULT_PAGE_SIZE });

  const { data, pageInfo } = db.useSuspenseQuery(
    newestPageQuery(userId, cursors),
  );

  const sketches = (data.sketches ?? []).filter(
    (s) => !s.flagged || s.author?.id === userId,
  );

  const endCursor = pageInfo?.sketches?.endCursor as GalleryCursor | undefined;
  const startCursor = pageInfo?.sketches?.startCursor as
    | GalleryCursor
    | undefined;
  const hasNext = pageInfo?.sketches?.hasNextPage ?? false;
  const hasPrev = pageInfo?.sketches?.hasPreviousPage ?? false;

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader label="Live Feed" title="Newest" />

        {sketches.length === 0 && !hasPrev ? (
          <div className="text-text-tertiary py-12 text-center sm:py-20">
            <p className="mb-4 text-5xl sm:text-6xl">🎨</p>
            <p className="text-text-secondary text-base font-medium sm:text-lg">
              No sketches yet
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {sketches.map((sketch) => (
                <SketchCard
                  key={sketch.id}
                  sketch={sketch}
                  isAdmin={!!isAdmin}
                  playbackSpeed={playbackSpeed}
                  showCursor={showCursor}
                />
              ))}
            </div>
            <Pagination
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => {
                if (startCursor) {
                  setCursors({ before: startCursor, last: DEFAULT_PAGE_SIZE });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              onNext={() => {
                if (endCursor) {
                  setCursors({ after: endCursor, first: DEFAULT_PAGE_SIZE });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
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

export default function NewestPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInNewestGallery />
      </db.SignedIn>
      <db.SignedOut>
        <NewestGalleryContent />
      </db.SignedOut>
    </>
  );
}
