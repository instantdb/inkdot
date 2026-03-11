'use client';

import { bestPageQuery } from '@/lib/browse-queries';
import { db } from '@/lib/db';
import Link from 'next/link';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { AuthHeader } from '../components';
import { SketchPageContent } from '../sketch/[id]/SketchPageContent';

type BestPreview = {
  id: string;
  thumbnailUrl?: string;
  authorHandle?: string;
};

export default function BestPage() {
  const { user } = db.useAuth();
  const { data } = db.useSuspenseQuery(bestPageQuery(user));

  const bestSketchId = data.sketches?.[0]?.id;
  const [activeSketchId, setActiveSketchId] = useState<string | null>(
    bestSketchId,
  );
  const [queuedBestSketchId, setQueuedBestSketchId] = useState<string | null>(
    null,
  );

  // Query queued sketch thumbnail + author for the "New #1" overlay
  const { data: queuedData } = db.useQuery(
    queuedBestSketchId
      ? {
          sketches: {
            thumbnail: {},
            author: {},
            $: { where: { id: queuedBestSketchId } },
          },
        }
      : null,
  );
  const queuedSketch = queuedData?.sketches?.[0];
  const queuedBestPreview: BestPreview | null = queuedSketch
    ? {
        id: queuedSketch.id,
        thumbnailUrl: queuedSketch.thumbnail?.url,
        authorHandle: queuedSketch.author?.handle ?? undefined,
      }
    : null;

  useEffect(() => {
    if (!bestSketchId) return;
    startTransition(() => {
      setActiveSketchId((current) => {
        if (current == null) return bestSketchId;
        // Never swap immediately — always queue so the overlay can show
        return current;
      });
      setQueuedBestSketchId((current) => {
        if (activeSketchId == null || activeSketchId === bestSketchId) {
          return null;
        }
        // Don't replace an already-queued sketch — wait until it starts playing
        if (current != null) return current;
        return bestSketchId;
      });
    });
  }, [activeSketchId, bestSketchId]);

  const handleAutoplayBestNavigate = useCallback((nextSketchId: string) => {
    setActiveSketchId(nextSketchId);
    setQueuedBestSketchId((cur) => (cur === nextSketchId ? null : cur));
  }, []);

  if (activeSketchId) {
    return (
      <SketchPageContent
        user={user ?? undefined}
        forcedSketchId={activeSketchId}
        forcedAutoplayParam="best"
        nextAutoplayBestSketchId={queuedBestSketchId}
        nextAutoplayBestData={queuedBestPreview}
        onAutoplayBestNavigate={handleAutoplayBestNavigate}
        onPlaybackActiveChange={() => {}}
        showBestExplanation
        showBestHeader
      />
    );
  }

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader
          label="Live View"
          title="Best"
          description="Live view of the top-scoring sketch. Vote for your favorite or sketch your masterpiece to unseat it."
        />
      </div>
      <div className="flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-3 py-6 text-center sm:px-6">
        <p className="text-text-secondary text-base sm:text-lg">
          Finding the current best sketch...
        </p>

        <p className="text-text-tertiary text-sm sm:text-base">
          No best sketch is available yet.
        </p>
        <Link
          href="/"
          className="bg-accent text-accent-text shadow-border hover:bg-accent-hover rounded-xl px-5 py-2 text-sm font-semibold shadow-md transition-all hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:text-base"
        >
          Back to gallery
        </Link>
      </div>
    </div>
  );
}
