'use client';

import {
  DEFAULT_PAGE_SIZE,
  type GalleryCursor,
  upvotedPageQuery,
} from '@/lib/browse-queries';
import { db } from '@/lib/db';
import { useState } from 'react';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { AuthHeader, LoginModal, SketchCard } from '../components';
import { useGuestBootstrap } from '../InstantProvider';

type UpvotedSketch = Parameters<typeof SketchCard>[0]['sketch'];
type UpvotedUser = {
  id: string;
  email?: string | null;
  type: 'user';
};

function isUpvotedUser(user: {
  id?: string | null;
  email?: string | null;
  type?: string | null;
}): user is UpvotedUser {
  return !!user.id && user.type === 'user';
}

function SignedInUpvotedPage() {
  const user = db.useUser();
  if (!isUpvotedUser(user)) {
    return <UpvotedGuestState />;
  }

  return <UpvotedPageContent user={user} />;
}

function SignedOutUpvotedPage() {
  const [showLogin, setShowLogin] = useState(false);
  const { isBootstrappingGuest } = useGuestBootstrap();

  if (isBootstrappingGuest) {
    return (
      <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
        <AuthHeader />
      </div>
    );
  }

  return (
    <>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
        <AuthHeader />
        <div className="flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-3 py-6 text-center sm:px-6">
          <p className="text-text-secondary text-base sm:text-lg">
            Creating a guest account failed.
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="bg-accent text-accent-text shadow-border hover:bg-accent-hover rounded-xl px-5 py-2 text-sm font-semibold shadow-md transition-all hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:text-base"
          >
            Sign in manually
          </button>
        </div>
      </div>
    </>
  );
}

function UpvotedPageContent({ user }: { user: UpvotedUser }) {
  const userId = user.id;
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
    upvotedPageQuery(user, cursors),
  );

  const sketches = (data.votes ?? []).reduce<UpvotedSketch[]>((acc, vote) => {
    const sketch = vote.sketch;
    if (!sketch) return acc;
    if (sketch.flagged && sketch.author?.id !== userId) return acc;

    acc.push({
      id: sketch.id,
      createdAt: sketch.createdAt,
      score: sketch.score ?? null,
      votes: sketch.votes ?? [],
      stream: sketch.stream
        ? {
            id: sketch.stream.id,
            done: sketch.stream.done ?? null,
          }
        : undefined,
      thumbnail: sketch.thumbnail
        ? {
            url: sketch.thumbnail.url,
          }
        : undefined,
      author: sketch.author
        ? {
            id: sketch.author.id,
            handle: sketch.author.handle ?? null,
          }
        : undefined,
      duration: sketch.duration ?? null,
      trimStart: sketch.trimStart ?? null,
      trimEnd: sketch.trimEnd ?? null,
      remixOf: sketch.remixOf
        ? {
            author: sketch.remixOf.author
              ? {
                  handle: sketch.remixOf.author.handle ?? null,
                }
              : undefined,
          }
        : null,
    });

    return acc;
  }, []);

  const endCursor = pageInfo?.votes?.endCursor as GalleryCursor | undefined;
  const startCursor = pageInfo?.votes?.startCursor as GalleryCursor | undefined;
  const hasNext = pageInfo?.votes?.hasNextPage ?? false;
  const hasPrev = pageInfo?.votes?.hasPreviousPage ?? false;

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader label="Your Votes" title="Upvoted" />

        {sketches.length === 0 && !hasPrev ? (
          <div className="text-text-tertiary py-12 text-center sm:py-20">
            <p className="text-text-secondary text-base font-medium sm:text-lg">
              No upvoted sketches yet
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {sketches.map((sketch) => (
                <SketchCard
                  key={sketch.id}
                  sketch={sketch}
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

function UpvotedGuestState() {
  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader label="Your Votes" title="Upvoted" />
        <div className="text-text-tertiary py-12 text-center sm:py-20">
          <p className="text-text-secondary text-base font-medium sm:text-lg">
            Link an email to keep a vote history.
          </p>
        </div>
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

export default function UpvotedPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInUpvotedPage />
      </db.SignedIn>
      <db.SignedOut>
        <SignedOutUpvotedPage />
      </db.SignedOut>
    </>
  );
}
