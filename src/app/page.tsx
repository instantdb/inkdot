'use client';

import { db } from '@/lib/db';
import Link from 'next/link';
import { AuthHeader, LoginModal, SketchCard } from './components';
import { useState, useEffect, useRef, useCallback } from 'react';

const PAGE_SIZE = 50;
const NEW_MOBILE_PREVIEW_COUNT = 3;
const NEW_DESKTOP_PREVIEW_COUNT = 4;

const createSketchClass =
  'rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text shadow-md shadow-border transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:rounded-xl sm:px-5 sm:py-2 sm:text-base';

function CreateSketchButton() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <>
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} redirectTo="/new" />
      )}
      <button onClick={() => setShowLogin(true)} className={createSketchClass}>
        Create sketch
      </button>
    </>
  );
}

function SignedInGallery() {
  const user = db.useUser();
  return (
    <GalleryContent
      userId={user.id}
      isAdmin={!!user.email?.endsWith('@instantdb.com')}
    />
  );
}

// -- "New" gallery: live-updating, ordered by createdAt --

function NewGallerySection({
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  userId?: string;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const { data } = db.useSuspenseQuery({
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      votes: {},
      $: {
        order: { createdAt: 'desc' as const },
        first: NEW_DESKTOP_PREVIEW_COUNT,
      },
    },
  });

  const sketches = (data.sketches ?? []).filter(
    (s) => !s.flagged || s.author?.id === userId,
  );

  if (sketches.length === 0) {
    return <EmptyState />;
  }

  return (
    <SketchGrid
      sketches={sketches}
      isAdmin={isAdmin}
      playbackSpeed={playbackSpeed}
      showCursor={showCursor}
      mobileColumns={3}
      desktopColumns={4}
      mobileVisibleCount={NEW_MOBILE_PREVIEW_COUNT}
    />
  );
}

// -- "Top" gallery: fixed order, live item updates --

type TopCursor = [string, string, unknown, number];
type SketchSnapshot = {
  id: string;
  createdAt: number;
  score?: number | null;
  votes?: { id: string }[];
  stream?: { id: string; done?: boolean | null };
  thumbnail?: { url: string };
  author?: { id?: string; handle?: string | null };
  duration?: number | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  remixOf?: { author?: { handle?: string | null } } | null;
};
type TopPageData = {
  sketches: SketchSnapshot[];
  endCursor?: TopCursor;
  hasNext: boolean;
};

// Phase 1: renders the grid using useSuspenseQuery (no flash), then signals
// data to the parent via effect so the parent can swap to TopGalleryGrid
// (which drops the live subscription).
function TopGalleryLoader({
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
  onData,
}: {
  userId?: string;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
  onData: (data: TopPageData) => void;
}) {
  const { data, pageInfo } = db.useSuspenseQuery({
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      votes: {},
      $: {
        order: { score: 'desc' as const },
        first: PAGE_SIZE,
      },
    },
  });

  const sketches = (data.sketches ?? []).filter(
    (s) => !s.flagged || s.author?.id === userId,
  );
  const endCursor = pageInfo?.sketches?.endCursor as TopCursor | undefined;
  const hasNext = pageInfo?.sketches?.hasNextPage ?? false;

  // After first commit, hand data to parent so it can unmount this component
  // (dropping the useSuspenseQuery subscription) and swap in TopGalleryGrid.
  useEffect(() => {
    onData({ sketches, endCursor, hasNext });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sketches.length === 0) return <EmptyState />;

  // Render actual SketchCards (not LiveSketchCard) so there's no null flash.
  return (
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
  );
}

function TopGallerySection({
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  userId?: string;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const [initialData, setInitialData] = useState<TopPageData | null>(null);

  // Phase 1: loader does useSuspenseQuery + renders grid + signals data via effect.
  // Phase 2: loader unmounts (drops subscription), TopGalleryGrid takes over.
  if (!initialData) {
    return (
      <TopGalleryLoader
        userId={userId}
        isAdmin={isAdmin}
        playbackSpeed={playbackSpeed}
        showCursor={showCursor}
        onData={setInitialData}
      />
    );
  }

  return (
    <TopGalleryGrid
      initialData={initialData}
      userId={userId}
      isAdmin={isAdmin}
      playbackSpeed={playbackSpeed}
      showCursor={showCursor}
    />
  );
}

function TopGalleryGrid({
  initialData,
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  initialData: TopPageData;
  userId?: string;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const [firstPageSketches] = useState(initialData.sketches);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(initialData.hasNext);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<TopCursor | undefined>(initialData.endCursor);

  const firstPageIds = firstPageSketches.map((s) => s.id);
  const sketchMap = new Map(firstPageSketches.map((s) => [s.id, s]));
  const allIds = [...firstPageIds, ...extraIds];

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    let captured = false;
    const unsub = db.core.subscribeQuery(
      {
        sketches: {
          author: {},
          $: {
            order: { score: 'desc' as const },
            first: PAGE_SIZE,
            after: cursorRef.current,
          },
        },
      },
      (resp) => {
        if (captured) return;
        captured = true;
        const ids = (resp.data?.sketches ?? [])
          .filter(
            (s: { flagged?: boolean; author?: { id?: string } }) =>
              !s.flagged || s.author?.id === userId,
          )
          .map((s: { id: string }) => s.id);
        const pi = resp.pageInfo?.sketches as
          | { hasNextPage?: boolean; endCursor?: TopCursor }
          | undefined;
        setExtraIds((prev) => {
          const seen = new Set([...firstPageIds, ...prev]);
          return [...prev, ...ids.filter((id: string) => !seen.has(id))];
        });
        cursorRef.current = pi?.endCursor;
        setHasMore(pi?.hasNextPage ?? false);
        setLoadingMore(false);
        unsub();
      },
    );
  }, [userId, loadingMore, hasMore, firstPageIds]);

  if (allIds.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
        {allIds.map((sketchId) => (
          <LiveSketchCard
            key={sketchId}
            sketchId={sketchId}
            initialData={sketchMap.get(sketchId)}
            isAdmin={isAdmin}
            playbackSpeed={playbackSpeed}
            showCursor={showCursor}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pb-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="border-border-strong text-text-secondary hover:bg-hover cursor-pointer rounded-lg border px-5 py-1.5 text-sm font-medium transition-all active:scale-95 disabled:cursor-default disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}

// Subscribes to a single sketch by ID via db.core.subscribeQuery
function LiveSketchCard({
  sketchId,
  initialData,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  sketchId: string;
  initialData?: SketchSnapshot;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const [sketch, setSketch] = useState<SketchSnapshot | null>(
    initialData ?? null,
  );

  useEffect(() => {
    const unsub = db.core.subscribeQuery(
      {
        sketches: {
          stream: {},
          thumbnail: {},
          author: {},
          remixOf: { author: {} },
          votes: {},
          $: { where: { id: sketchId } },
        },
      },
      (resp) => {
        const s = resp.data?.sketches?.[0];
        if (s) setSketch(s);
      },
    );
    return unsub;
  }, [sketchId]);

  if (!sketch) return null;

  return (
    <SketchCard
      sketch={sketch}
      isAdmin={!!isAdmin}
      playbackSpeed={playbackSpeed}
      showCursor={showCursor}
    />
  );
}

// -- Shared pieces --

function EmptyState() {
  return (
    <div className="text-text-tertiary py-12 text-center sm:py-20">
      <p className="mb-4 text-5xl sm:text-6xl">🎨</p>
      <p className="text-text-secondary text-base font-medium sm:text-lg">
        No sketches yet
      </p>
      <p className="mt-2 text-sm">
        Click &quot;Create sketch&quot; to create your first one!
      </p>
    </div>
  );
}

function SketchGrid({
  sketches,
  isAdmin,
  playbackSpeed,
  showCursor,
  mobileColumns = 2,
  desktopColumns = 3,
  mobileVisibleCount,
}: {
  sketches: {
    id: string;
    createdAt: number;
    score?: number | null;
    votes?: { id: string }[];
    stream?: { id: string; done?: boolean | null };
    thumbnail?: { url: string };
    author?: { handle?: string | null; id?: string };
    duration?: number | null;
    trimStart?: number | null;
    trimEnd?: number | null;
    remixOf?: { author?: { handle?: string | null } } | null;
  }[];
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
  mobileColumns?: 2 | 3;
  desktopColumns?: 3 | 4;
  mobileVisibleCount?: number;
}) {
  const mobileGridClass =
    mobileColumns === 3 ? 'grid-cols-3 sm:grid-cols-2' : 'grid-cols-2';
  const desktopGridClass =
    desktopColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';

  return (
    <div
      className={`grid ${mobileGridClass} ${desktopGridClass} gap-3 sm:gap-5`}
    >
      {sketches.map((sketch, index) => {
        const mobileVisibilityClass =
          mobileVisibleCount != null && index >= mobileVisibleCount
            ? 'hidden sm:block'
            : '';

        return (
          <div key={sketch.id} className={mobileVisibilityClass}>
            <SketchCard
              sketch={sketch}
              isAdmin={!!isAdmin}
              playbackSpeed={playbackSpeed}
              showCursor={showCursor}
            />
          </div>
        );
      })}
    </div>
  );
}

// -- Main gallery --

function SectionHeader({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-text-secondary text-sm font-semibold tracking-wide uppercase">
        {children}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-text-tertiary hover:text-text-secondary text-xs font-medium transition-colors sm:text-sm"
        >
          See all &rarr;
        </Link>
      )}
    </div>
  );
}

function GalleryContent({
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

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-6 px-3 py-3 sm:space-y-10 sm:p-6">
        <div className="flex items-center justify-end">
          <db.SignedIn>
            <Link href="/new" className={createSketchClass}>
              Create sketch
            </Link>
          </db.SignedIn>
          <db.SignedOut>
            <CreateSketchButton />
          </db.SignedOut>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <SectionHeader href="/newest">Fresh off the canvas</SectionHeader>
          <NewGallerySection
            userId={userId}
            isAdmin={isAdmin}
            playbackSpeed={playbackSpeed}
            showCursor={showCursor}
          />
        </div>

        <div className="space-y-3 sm:space-y-4">
          <SectionHeader>Most loved</SectionHeader>
          <TopGallerySection
            userId={userId}
            isAdmin={isAdmin}
            playbackSpeed={playbackSpeed}
            showCursor={showCursor}
          />
        </div>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInGallery />
      </db.SignedIn>
      <db.SignedOut>
        <GalleryContent />
      </db.SignedOut>
    </>
  );
}
