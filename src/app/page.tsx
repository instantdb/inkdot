'use client';

import { AnimatedNewestSketchGrid } from './AnimatedNewestSketchGrid';
import { AnimatedTopSketchGrid } from './AnimatedTopSketchGrid';
import {
  DEFAULT_PAGE_SIZE,
  bestPageQuery,
  newestPageQuery,
  topPageQuery,
} from '@/lib/browse-queries';
import { db } from '@/lib/db';
import { sketchQuery, viewerVotesQuery } from '@/lib/sketch-query';
import { uuidCompare } from '@/lib/uuid-compare';
import {
  reconcileOptimisticVotes,
  useOptimisticVoteScores,
} from '@/lib/vote-store';
import Link from 'next/link';
import { AuthHeader, LoginModal } from './components';
import { useGuestBootstrap } from './InstantProvider';
import { usePrependAnimatedSketches } from './usePrependAnimatedSketches';
import { useState, useEffect, useRef, useCallback } from 'react';

const NEW_MOBILE_PREVIEW_COUNT = 3;
const NEW_DESKTOP_PREVIEW_COUNT = 4;
const TOP_PREVIEW_COUNT = DEFAULT_PAGE_SIZE;

const createSketchClass =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-text shadow-md shadow-border transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:rounded-xl sm:px-5 sm:py-2 sm:text-base';
const browseLinkClass =
  'text-text-tertiary hover:text-text-secondary text-sm font-medium transition-colors py-1';

function CreateSketchButton() {
  const [showLogin, setShowLogin] = useState(false);
  const { isBootstrappingGuest } = useGuestBootstrap();

  if (isBootstrappingGuest) {
    return (
      <div className={`${createSketchClass} pointer-events-none opacity-0`}>
        Create Sketch
      </div>
    );
  }

  return (
    <>
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} redirectTo="/new" />
      )}
      <button onClick={() => setShowLogin(true)} className={createSketchClass}>
        Create Sketch
      </button>
    </>
  );
}

function warmBestRoute(user?: { id?: string | null; type?: string | null }) {
  const bestRouteQuery = bestPageQuery(user);

  const unsub = db.core.subscribeQuery(bestRouteQuery, async (resp) => {
    const bestSketchId = resp.data?.sketches?.[0]?.id;
    if (bestSketchId) {
      const warmSketchUnsub = db.core.subscribeQuery(
        sketchQuery(bestSketchId, user),
        async () => {
          await db.core._reactor.querySubs.flush();
          warmSketchUnsub();
          unsub();
        },
      );
      return;
    }

    await db.core._reactor.querySubs.flush();
    unsub();
  });
}

function warmNewestRoute(user?: { id?: string | null; type?: string | null }) {
  const newestRouteQuery = newestPageQuery(user, {
    first: DEFAULT_PAGE_SIZE,
  });
  const unsub = db.core.subscribeQuery(newestRouteQuery, async () => {
    await db.core._reactor.querySubs.flush();
    unsub();
  });
}

function warmTopRoute(user?: { id?: string | null; type?: string | null }) {
  const topRouteQuery = topPageQuery(user);
  const unsub = db.core.subscribeQuery(topRouteQuery, async () => {
    await db.core._reactor.querySubs.flush();
    unsub();
  });
}

function HomeBrowseLinks({
  warmRoute,
}: {
  warmRoute: (href: '/best' | '/newest' | '/top') => void;
}) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <Link
        href="/best"
        className={browseLinkClass}
        onMouseEnter={() => warmRoute('/best')}
        onTouchStart={() => warmRoute('/best')}
        onFocus={() => warmRoute('/best')}
      >
        Best
      </Link>
      <Link
        href="/newest"
        className={browseLinkClass}
        onMouseEnter={() => warmRoute('/newest')}
        onTouchStart={() => warmRoute('/newest')}
        onFocus={() => warmRoute('/newest')}
      >
        Newest
      </Link>
      <Link
        href="/top"
        className={browseLinkClass}
        onMouseEnter={() => warmRoute('/top')}
        onTouchStart={() => warmRoute('/top')}
        onFocus={() => warmRoute('/top')}
      >
        Top
      </Link>
      <Link href="/about" className={browseLinkClass}>
        About
      </Link>
    </div>
  );
}

function SignedInGallery() {
  const user = db.useUser();
  return (
    <GalleryContent
      user={user}
      userId={user.id}
      isAdmin={!!user.email?.endsWith('@instantdb.com')}
    />
  );
}

// -- "New" gallery: live-updating, ordered by createdAt --

function NewGallerySection({
  user,
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  user?: { id?: string | null; type?: string | null };
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
      ...viewerVotesQuery(user),
      $: {
        order: { createdAt: 'desc' as const },
        first: NEW_DESKTOP_PREVIEW_COUNT,
      },
    },
  });

  const sketches = (data.sketches ?? []).filter(
    (s) => !s.flagged || s.author?.id === userId,
  );
  const { displayedSketches, enteringSketchIds } = usePrependAnimatedSketches({
    sketches,
    enabled: true,
  });

  if (displayedSketches.length === 0) {
    return <EmptyState />;
  }

  return (
    <AnimatedNewestSketchGrid
      sketches={displayedSketches}
      enteringSketchIds={enteringSketchIds}
      isAdmin={!!isAdmin}
      playbackSpeed={playbackSpeed}
      showCursor={showCursor}
      mobileColumns={3}
      desktopColumns={4}
      mobileVisibleCount={NEW_MOBILE_PREVIEW_COUNT}
    />
  );
}

function TopGallerySection({
  user,
  userId,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  user?: { id?: string | null; type?: string | null };
  userId?: string;
  isAdmin?: boolean;
  playbackSpeed: number;
  showCursor: boolean;
}) {
  const optimisticScores = useOptimisticVoteScores();

  const { data } = db.useSuspenseQuery(topPageQuery(user));

  useEffect(() => {
    reconcileOptimisticVotes(data.sketches ?? []);
  }, [data.sketches]);

  const sketches = [...(data.sketches ?? [])]
    .filter((s) => !s.flagged || s.author?.id === userId)
    .sort((a, b) => {
      const scoreDelta =
        (optimisticScores[b.id]?.score ?? b.score ?? 0) -
        (optimisticScores[a.id]?.score ?? a.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return uuidCompare(b.id, a.id);
    })
    .slice(0, TOP_PREVIEW_COUNT);

  if (sketches.length === 0) {
    return <EmptyState />;
  }

  return (
    <AnimatedTopSketchGrid
      sketches={sketches}
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
      <p className="text-text-secondary text-base font-medium sm:text-lg">
        No sketches yet
      </p>
      <p className="mt-2 text-sm">
        Click &quot;Create Sketch&quot; to create your first one!
      </p>
    </div>
  );
}

// -- Main gallery --

function SectionHeader({
  children,
  href,
  onWarmHref,
}: {
  children: React.ReactNode;
  href?: string;
  onWarmHref?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-text-secondary text-sm font-semibold tracking-wide uppercase">
        {children}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1 py-1 text-sm font-medium transition-colors"
          onMouseEnter={onWarmHref}
          onTouchStart={onWarmHref}
          onFocus={onWarmHref}
        >
          See all
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function GalleryContent({
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
  const warmedRoutes = useRef<Set<string>>(new Set());

  const warmRoute = useCallback(
    (href: '/best' | '/newest' | '/top') => {
      if (warmedRoutes.current.has(href)) return;
      warmedRoutes.current.add(href);

      if (href === '/best') {
        warmBestRoute(user);
        return;
      }

      if (href === '/newest') {
        warmNewestRoute(user);
        return;
      }

      warmTopRoute(user);
    },
    [user],
  );

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-6 px-3 py-3 sm:space-y-10 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <HomeBrowseLinks warmRoute={warmRoute} />
          <db.SignedIn>
            <Link href="/new" className={createSketchClass}>
              Create Sketch
            </Link>
          </db.SignedIn>
          <db.SignedOut>
            <CreateSketchButton />
          </db.SignedOut>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <SectionHeader href="/newest" onWarmHref={() => warmRoute('/newest')}>
            Fresh off the canvas
          </SectionHeader>
          <NewGallerySection
            user={user}
            userId={userId}
            isAdmin={isAdmin}
            playbackSpeed={playbackSpeed}
            showCursor={showCursor}
          />
        </div>

        <div className="space-y-3 sm:space-y-4">
          <SectionHeader href="/top" onWarmHref={() => warmRoute('/top')}>
            Most loved
          </SectionHeader>
          <TopGallerySection
            user={user}
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
