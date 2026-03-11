'use client';

import { db } from '@/lib/db';
import {
  canDeleteOwnSketch,
  SKETCH_DELETE_WINDOW_MS,
} from '@/lib/sketch-delete';
import { recordSketchView } from '@/lib/view-recording';
import { getErrorMessage } from '@/lib/error-message';
import { showToast } from '@/lib/toast';
import { id } from '@instantdb/react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type StrokeEvent,
  type IncrementalState,
  AuthHeader,
  CursorOverlay,
  ErrorMsg,
  DEFAULT_BG,
  CANVAS_W,
  CANVAS_H,
  drawShapeOnCanvas,
  formatTime,
  renderEventsToCanvas,
  processEventIncremental,
  computePlaybackProgress,
  UpvoteButton,
} from '../../components';
import { BrowsePageHeader } from '../../BrowsePageHeader';

type UserInfo = { id: string; email?: string | null; type?: string | null };

import { sketchQuery } from './query';

function SignedInSketchPage() {
  const user = db.useUser();
  return <SketchPageContent user={user} />;
}

export default function SketchPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInSketchPage />
      </db.SignedIn>
      <db.SignedOut>
        <SketchPageContent />
      </db.SignedOut>
    </>
  );
}

type BestPreview = {
  id: string;
  thumbnailUrl?: string;
  authorHandle?: string;
};

export function SketchPageContent({
  user,
  forcedSketchId,
  forcedAutoplayParam,
  nextAutoplayBestSketchId,
  nextAutoplayBestData,
  onAutoplayBestNavigate,
  onPlaybackActiveChange,
  showBestExplanation,
  showBestHeader,
}: {
  user?: UserInfo;
  forcedSketchId?: string;
  forcedAutoplayParam?: string | null;
  nextAutoplayBestSketchId?: string | null;
  nextAutoplayBestData?: BestPreview | null;
  onAutoplayBestNavigate?: (sketchId: string) => void;
  onPlaybackActiveChange?: (isActive: boolean) => void;
  showBestExplanation?: boolean;
  showBestHeader?: boolean;
}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sketchId = forcedSketchId ?? (params.id as string);
  const autoplayParam = forcedAutoplayParam ?? searchParams.get('autoplay');
  const autoplayBest = autoplayParam === 'best';
  const { data } = db.useSuspenseQuery(sketchQuery(sketchId, user));

  const sketch = data.sketches[0];
  const isAuthor = !!user && sketch?.author?.id === user.id;
  const isAdmin = !!user?.email?.endsWith('@instantdb.com');

  // User settings for playback speed
  const { data: settingsData } = db.useQuery(
    user
      ? {
          userSettings: {
            $: { where: { 'owner.id': user.id } },
          },
        }
      : null,
  );
  const userSettings = settingsData?.userSettings?.[0];
  const savedSpeed = userSettings?.playbackSpeed ?? null;
  const savedShowCursor = userSettings?.showCursor ?? null;

  const saveSpeed = useCallback(
    (s: number) => {
      if (!user) return;
      const settingsId = userSettings?.id || id();
      if (userSettings) {
        db.transact(
          db.tx.userSettings[settingsId].update({ playbackSpeed: s }),
        );
      } else {
        db.transact(
          db.tx.userSettings[settingsId]
            .create({ playbackSpeed: s })
            .link({ owner: user.id }),
        );
      }
    },
    [user, userSettings],
  );

  const saveShowCursor = useCallback(
    (show: boolean) => {
      if (!user) return;
      const settingsId = userSettings?.id || id();
      if (userSettings) {
        db.transact(
          db.tx.userSettings[settingsId].update({ showCursor: show }),
        );
      } else {
        db.transact(
          db.tx.userSettings[settingsId]
            .create({ showCursor: show })
            .link({ owner: user.id }),
        );
      }
    },
    [user, userSettings],
  );

  // Track deletion to prevent hook mismatch when sketch disappears from query
  const [deleting, setDeleting] = useState(false);

  // Lineage play-all: concatenate all ancestor streams + current into one playback
  const [lineageStreamIds, setLineageStreamIds] = useState<string[] | null>(
    null,
  );
  const [lineageStopped, setLineageStopped] = useState(false);

  // Autoplay: the param is the parent sketch id whose remixes we're cycling through
  // If autoplay=self, we're auto-playing this sketch's own remixes
  const autoplayParent = autoplayParam === 'self' ? sketchId : autoplayParam;

  // Query remixes/siblings for autoplay navigation
  // - autoplay=self: need this sketch's remixes (children) to go to first one
  // - autoplay={parentId}: need parent's remixes (siblings) to find next one
  const autoplayQueryTarget = autoplayParent || null;
  const { data: autoplayData } = db.useQuery(
    autoplayQueryTarget && !autoplayBest
      ? {
          sketches: {
            $: {
              where: { 'remixOf.id': autoplayQueryTarget },
              order: { createdAt: 'desc' as const },
              limit: 20,
            },
          },
        }
      : null,
  );

  const handleReachedEnd = useCallback(() => {
    if (!autoplayParam) return;

    if (autoplayBest) {
      const nextBestSketchId = nextAutoplayBestSketchId;
      if (nextBestSketchId && nextBestSketchId !== sketchId) {
        if (onAutoplayBestNavigate) {
          onAutoplayBestNavigate(nextBestSketchId);
        } else {
          router.push(`/sketch/${nextBestSketchId}?autoplay=best`);
        }
      }
      return;
    }

    if (!autoplayData?.sketches) return;
    const list = autoplayData.sketches;
    if (list.length === 0) return;

    if (autoplayParam === 'self') {
      router.push(`/sketch/${list[0].id}?autoplay=${sketchId}`);
      return;
    }

    const currentIdx = list.findIndex((s) => s.id === sketchId);
    const nextIdx = currentIdx + 1;
    if (nextIdx < list.length) {
      router.push(`/sketch/${list[nextIdx].id}?autoplay=${autoplayParent}`);
    }
  }, [
    autoplayBest,
    autoplayParam,
    autoplayParent,
    autoplayData,
    nextAutoplayBestSketchId,
    onAutoplayBestNavigate,
    sketchId,
    router,
  ]);

  const handlePlayAll = useCallback((streamIds: string[]) => {
    if (streamIds.length === 0) return;
    setLineageStreamIds(streamIds);
    setLineageStopped(false);
  }, []);

  const handleStopLineage = useCallback(() => {
    setLineageStreamIds(null);
    setLineageStopped(true);
  }, []);

  // Track current time for delete-window gating and orphan detection.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isAuthor || isAdmin || !sketch?.createdAt) return;
    if (!canDeleteOwnSketch(sketch.createdAt, now)) return;

    const expiresAt = sketch.createdAt + SKETCH_DELETE_WINDOW_MS;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiresAt - now) + 50,
    );
    return () => window.clearTimeout(timeout);
  }, [isAuthor, isAdmin, now, sketch?.createdAt]);

  const sketchMissing = !sketch || (sketch.flagged && !isAuthor) || deleting;

  if (sketchMissing) {
    return (
      <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
        <AuthHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-text-secondary text-base sm:text-lg">
            Sketch not found
          </p>
          <Link
            href="/"
            className="bg-accent text-accent-text shadow-border hover:bg-accent-hover cursor-pointer rounded-xl px-5 py-2 text-sm font-semibold shadow-md transition-all hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:text-base"
          >
            Back to gallery
          </Link>
        </div>
      </div>
    );
  }

  const stream = sketch.stream;
  if (!stream) {
    return <ErrorMsg msg="Stream not found" />;
  }

  // Detect orphaned streams: not done but past expected duration + buffer
  // For older sketches without duration field, use 2 minutes as max
  const maxDurationMs = sketch.duration
    ? sketch.duration * 1000 + 5000
    : 120_000;
  const isOrphaned =
    !stream.done &&
    !!sketch.createdAt &&
    now > sketch.createdAt + maxDurationMs;
  const effectiveLive = !stream.done && !isOrphaned;
  const canDelete =
    isAdmin || (isAuthor && canDeleteOwnSketch(sketch.createdAt, now));

  const isLineagePlaying = !!lineageStreamIds;
  const effectiveStreamIds = lineageStreamIds ?? [stream.id];

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      {showBestHeader && (
        <div className="w-full max-w-4xl px-3 pt-3 sm:px-6 sm:pt-6">
          <BrowsePageHeader
            label="Live View"
            title="Best"
            description={
              showBestExplanation
                ? 'Live view of the top-scoring sketch. Vote for your favorite or sketch your masterpiece to unseat it.'
                : undefined
            }
          />
        </div>
      )}
      <ReplayCanvas
        key={effectiveStreamIds.join(',')}
        sketchId={sketchId}
        streamIds={effectiveStreamIds}
        isLive={isLineagePlaying ? false : effectiveLive}
        isAuthor={isLineagePlaying ? false : isAuthor}
        isAdmin={isLineagePlaying ? false : isAdmin}
        canDelete={isLineagePlaying ? false : canDelete}
        canReport={!!user && !isAuthor}
        savedTrimStart={isLineagePlaying ? null : (sketch.trimStart ?? null)}
        savedTrimEnd={isLineagePlaying ? null : (sketch.trimEnd ?? null)}
        remixOf={isLineagePlaying ? null : (sketch.remixOf ?? null)}
        autoplay={!!autoplayParam}
        autoplayBest={autoplayBest}
        nextBestPreview={nextAutoplayBestData ?? undefined}
        onAutoplayEnd={handleReachedEnd}
        onPlaybackActiveChange={onPlaybackActiveChange}
        savedSpeed={savedSpeed}
        onSaveSpeed={saveSpeed}
        savedShowCursor={savedShowCursor}
        onSaveShowCursor={saveShowCursor}
        initialPaused={lineageStopped}
        onDelete={() => setDeleting(true)}
        score={sketch.score ?? 0}
        votes={sketch.votes ?? []}
        authorId={sketch.author?.id}
        viewerUserId={user?.id}
      />
      {sketch.remixOf && (
        <RemixHistory
          key={sketchId}
          currentSketchId={sketchId}
          parentId={sketch.remixOf.id}
          currentThumbnailUrl={sketch.thumbnail?.url ?? null}
          currentStreamId={stream.id}
          onPlayAll={handlePlayAll}
          isPlaying={isLineagePlaying}
          onStop={handleStopLineage}
        />
      )}
      <RemixesSection
        sketchId={sketchId}
        autoplay={!!autoplayParam}
        autoplayParent={autoplayParent}
      />
    </div>
  );
}

function NextUpOverlay({
  preview,
  countdownActive,
  onPlayNow,
  onDismiss,
}: {
  preview: { thumbnailUrl?: string; authorHandle?: string };
  countdownActive: boolean;
  onPlayNow: () => void;
  onDismiss: () => void;
}) {
  const COUNTDOWN_SECONDS = 3;
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!countdownActive) return;
    if (countdown <= 0) {
      onPlayNow();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdownActive, countdown, onPlayNow]);

  return (
    <button
      onClick={onPlayNow}
      className="group/overlay absolute right-3 bottom-3 w-28 overflow-hidden rounded-lg bg-black/85 text-left shadow-lg backdrop-blur-sm sm:w-32"
      style={{ animation: 'slide-in-up 0.3s ease-out' }}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-[4/3] w-full overflow-hidden shadow-[inset_0_0_12px_rgba(255,255,255,0.3)]"
        style={{ backgroundColor: DEFAULT_BG }}
      >
        {preview.thumbnailUrl ? (
          <img
            src={preview.thumbnailUrl}
            alt="Next sketch"
            className="h-full w-full object-cover"
          />
        ) : null}
        {/* Frosted glass pill */}
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-white uppercase backdrop-blur-md sm:text-[10px]">
          {preview.authorHandle ? <>New #1 · @{preview.authorHandle}</> : 'New #1'}
        </span>
      </div>
      {/* Play icon centered over entire card on hover */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/overlay:bg-black/40">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-md transition-opacity group-hover/overlay:opacity-100">
          <svg viewBox="0 0 24 24" fill="black" className="ml-0.5 h-5 w-5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      {/* Countdown spinner */}
      {countdownActive && (
        <div className="pointer-events-none absolute top-1 right-1">
          <svg width="22" height="22" className="-rotate-90 drop-shadow-md">
            <circle
              cx="11"
              cy="11"
              r="10"
              fill="rgba(0,0,0,0.5)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.5"
            />
            <circle
              cx="11"
              cy="11"
              r="10"
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={
                2 * Math.PI * 10 -
                ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) *
                  2 *
                  Math.PI *
                  10
              }
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
            <text
              x="11"
              y="11"
              textAnchor="middle"
              dominantBaseline="central"
              className="rotate-90 fill-white text-[8px] font-semibold"
              style={{ transformOrigin: '11px 11px' }}
            >
              {countdown}
            </text>
          </svg>
        </div>
      )}
      {/* Dismiss X — top-left, only on hover */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            onDismiss();
          }
        }}
        className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white/60 opacity-0 transition-all group-hover/overlay:opacity-100 hover:text-white"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </div>
    </button>
  );
}

function ReplayCanvas({
  sketchId,
  streamIds,
  isLive,
  isAuthor,
  isAdmin,
  canDelete,
  canReport,
  savedTrimStart,
  savedTrimEnd,
  remixOf,
  autoplay,
  autoplayBest,
  nextBestPreview,
  onAutoplayEnd,
  onPlaybackActiveChange,
  savedSpeed,
  onSaveSpeed,
  savedShowCursor,
  onSaveShowCursor,
  initialPaused,
  onDelete,
  score,
  votes,
  authorId,
  viewerUserId,
}: {
  sketchId: string;
  streamIds: string[];
  isLive: boolean;
  isAuthor: boolean;
  isAdmin: boolean;
  canDelete: boolean;
  canReport: boolean;
  savedTrimStart: number | null;
  savedTrimEnd: number | null;
  remixOf: { id: string; author?: { handle?: string | null } } | null;
  autoplay?: boolean;
  autoplayBest?: boolean;
  nextBestPreview?: { thumbnailUrl?: string; authorHandle?: string } | null;
  onAutoplayEnd?: () => void;
  onPlaybackActiveChange?: (isActive: boolean) => void;
  savedSpeed?: number | null;
  onSaveSpeed?: (speed: number) => void;
  savedShowCursor?: boolean | null;
  onSaveShowCursor?: (show: boolean) => void;
  initialPaused?: boolean;
  onDelete?: () => void;
  score: number;
  votes: { id: string }[];
  authorId?: string;
  viewerUserId?: string;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<{
    x: number;
    y: number;
    tool?: string;
    color?: string;
    lastDrawTime?: number;
    pressed?: boolean;
    pressTime?: number;
  } | null>(null);
  const [showCursor, setShowCursorState] = useState(savedShowCursor ?? true);
  const appliedSavedShowCursor = useRef(false);
  useEffect(() => {
    if (savedShowCursor != null && !appliedSavedShowCursor.current) {
      appliedSavedShowCursor.current = true;
      setShowCursorState(savedShowCursor);
    }
  }, [savedShowCursor]);
  const setShowCursor = useCallback(
    (v: boolean) => {
      setShowCursorState(v);
      onSaveShowCursor?.(v);
    },
    [onSaveShowCursor],
  );
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(!initialPaused);
  const [done, setDone] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [dismissedNextUp, setDismissedNextUp] = useState(false);
  const [loop, setLoop] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [speed, setSpeedState] = useState(isLive ? 1 : (savedSpeed ?? 2));
  const setSpeed = useCallback(
    (s: number) => {
      setSpeedState(s);
      onSaveSpeed?.(s);
    },
    [onSaveSpeed],
  );
  // Sync speed when savedSpeed loads asynchronously
  const appliedSavedSpeed = useRef(false);
  useEffect(() => {
    if (!isLive && savedSpeed && !appliedSavedSpeed.current) {
      appliedSavedSpeed.current = true;
      // Adjust replayStart so the current position is preserved at the new speed
      const state = replayStateRef.current;
      if (!state.isPaused) {
        const now = performance.now();
        const elapsed = (now - state.replayStart) * speedRef.current;
        state.replayStart = now - elapsed / savedSpeed;
      }
      setSpeedState(savedSpeed);
    }
  }, [savedSpeed, isLive]);
  const [trimming, setTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState<number>(savedTrimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState<number | null>(savedTrimEnd);
  const [undoTrim, setUndoTrim] = useState<{
    trimStart: number;
    trimEnd: number | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  useEffect(() => {
    if (!canDelete && confirmDelete) {
      setConfirmDelete(false);
    }
  }, [canDelete, confirmDelete]);
  useEffect(() => {
    if (!confirmDelete) {
      setDeletePending(false);
    }
  }, [confirmDelete]);
  const trimStartRef = useRef(trimStart);
  trimStartRef.current = trimStart;
  const trimEndRef = useRef(trimEnd);
  trimEndRef.current = trimEnd;
  const maxTimeRef = useRef(maxTime);
  maxTimeRef.current = maxTime;
  const cancelledRef = useRef(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const eventsRef = useRef<StrokeEvent[]>([]);
  const activeReadersRef = useRef<ReadableStreamDefaultReader<string>[]>([]);
  const animFrameRef = useRef<number>(0);
  const replayStateRef = useRef({
    eventIdx: 0,
    replayStart: 0,
    pausedAt: 0,
    isPaused: false,
    isScrubbing: false,
  });

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const showCursorRef = useRef(showCursor);
  showCursorRef.current = showCursor;
  const doneRef = useRef(done);
  doneRef.current = done;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const autoplayBestRef = useRef(autoplayBest);
  autoplayBestRef.current = autoplayBest;
  const dismissedNextUpRef = useRef(dismissedNextUp);
  dismissedNextUpRef.current = dismissedNextUp;
  const nextBestPreviewRef = useRef(nextBestPreview);
  nextBestPreviewRef.current = nextBestPreview;
  const onAutoplayEndRef = useRef(onAutoplayEnd);
  onAutoplayEndRef.current = onAutoplayEnd;
  const recordedViewForRunRef = useRef(false);

  const recordCompletedView = useCallback(() => {
    if (recordedViewForRunRef.current) return;
    recordedViewForRunRef.current = true;

    void recordSketchView({
      sketchId,
      viewerUserId,
      authorUserId: authorId,
    }).catch(() => {
      recordedViewForRunRef.current = false;
    });
  }, [authorId, sketchId, viewerUserId]);

  useEffect(() => {
    onPlaybackActiveChange?.(playing && !reachedEnd);
  }, [onPlaybackActiveChange, playing, reachedEnd]);

  useEffect(() => {
    recordedViewForRunRef.current = false;
  }, [streamIds, sketchId]);

  // Close settings popover on click outside
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const redrawUpTo = useCallback((targetTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const result = renderEventsToCanvas(ctx, eventsRef.current, {
      upToTime: targetTime,
    });

    if (result.cursor) {
      cursorRef.current = {
        x: result.cursor.x,
        y: result.cursor.y,
        tool: result.tool || undefined,
        color: result.color || undefined,
        lastDrawTime: performance.now(),
      };
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    cancelledRef.current = false;
    eventsRef.current = [];
    const events = eventsRef.current;
    const state = replayStateRef.current;
    state.eventIdx = 0;
    state.replayStart = performance.now();
    state.isPaused = false;
    state.isScrubbing = false;

    // Shared incremental state for both live and replay processing
    const incState: IncrementalState = {
      tool: '',
      color: '',
      size: 4,
      shapeStart: null,
    };

    let firstEventReceived = false;
    let snapshotBuffer: StrokeEvent[] | null = null;

    const processEvent = (evt: StrokeEvent) => {
      events.push(evt);
      setMaxTime(evt.t);

      if (!firstEventReceived) {
        firstEventReceived = true;
        state.replayStart = performance.now();
      }

      if (isLive) {
        // Snapshot buffering: batch events between markers
        if (evt.type === 'snapshot-start') {
          snapshotBuffer = [];
          return;
        }
        if (evt.type === 'snapshot-end') {
          if (snapshotBuffer) {
            renderEventsToCanvas(ctx, events);
            snapshotBuffer = null;
          }
          state.eventIdx = events.length;
          return;
        }
        if (snapshotBuffer) {
          snapshotBuffer.push(evt);
          return;
        }

        const result = processEventIncremental(ctx, evt, events, incState);

        if (result.needsFullRedraw) {
          renderEventsToCanvas(ctx, events);
        }

        if (result.shapePreview) {
          // Shape preview during live: redraw canvas then draw preview shape
          renderEventsToCanvas(ctx, events);
          const sp = result.shapePreview;
          drawShapeOnCanvas(
            ctx,
            sp.shape,
            sp.x1,
            sp.y1,
            sp.x2,
            sp.y2,
            sp.color,
            sp.size,
            1,
          );
        }

        // Update cursor
        if (result.stateChanged) {
          cursorRef.current = {
            x: cursorRef.current?.x ?? 0,
            y: cursorRef.current?.y ?? 0,
            tool: incState.tool || undefined,
            color: incState.color || undefined,
            lastDrawTime: cursorRef.current?.lastDrawTime,
          };
        } else if (result.cursorPosition && !result.needsFullRedraw) {
          cursorRef.current = {
            x: result.cursorPosition.x,
            y: result.cursorPosition.y,
            tool: incState.tool || undefined,
            color: incState.color || undefined,
            lastDrawTime: result.isDrawEvent
              ? performance.now()
              : cursorRef.current?.lastDrawTime,
          };
        }

        state.eventIdx = events.length;
        setScrubValue(evt.t);
      }
    };

    activeReadersRef.current = [];
    const readSingleStream = async (streamId: string, timeOffset: number) => {
      const readStream = db.streams.createReadStream({ streamId });
      const reader = readStream.getReader();
      activeReadersRef.current.push(reader);
      let buffer = '';
      let lastTime = timeOffset;
      try {
        while (!cancelledRef.current) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              evt.t = evt.t + timeOffset;
              lastTime = evt.t;
              processEvent(evt);
            } catch {}
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError')
          return lastTime;
        throw e;
      } finally {
        reader.cancel().catch(() => {});
      }
      return lastTime;
    };

    (async () => {
      let timeOffset = 0;
      for (let i = 0; i < streamIds.length; i++) {
        if (cancelledRef.current) break;
        const lastTime = await readSingleStream(streamIds[i], timeOffset);
        if (i < streamIds.length - 1) {
          timeOffset = lastTime + 500;
        }
      }
      setDone(true);
      // If starting paused (e.g. after stopping lineage), show final frame
      if (initialPaused && events.length > 0) {
        const finalTime = events[events.length - 1].t;
        renderEventsToCanvas(ctx, events);
        state.eventIdx = events.length;
        state.isPaused = true;
        setScrubValue(finalTime);
        setReachedEnd(true);
        cursorRef.current = null;
      }
    })();

    // Replay loop — uses separate incremental state from live processing
    const replayState: IncrementalState = {
      tool: '',
      color: '',
      size: 4,
      shapeStart: null,
    };

    const frame = () => {
      if (cancelledRef.current) return;

      // When live, events are drawn directly in the stream reader
      if (isLive && !doneRef.current) {
        animFrameRef.current = requestAnimationFrame(frame);
        return;
      }

      if (!state.isScrubbing) {
        const shouldPause = !playingRef.current;
        if (shouldPause && !state.isPaused) {
          state.isPaused = true;
          state.pausedAt = performance.now();
        } else if (!shouldPause && state.isPaused) {
          state.isPaused = false;
          state.replayStart += performance.now() - state.pausedAt;
        }

        if (!state.isPaused) {
          const elapsed =
            (performance.now() - state.replayStart) * speedRef.current;
          setScrubValue(elapsed);
          let needsRedraw = false;
          while (
            state.eventIdx < events.length &&
            events[state.eventIdx].t <= elapsed
          ) {
            const evt = events[state.eventIdx];

            // Snapshot buffering: wait for snapshot-end, then render all at once
            if (evt.type === 'snapshot-start') {
              let endIdx = state.eventIdx + 1;
              while (
                endIdx < events.length &&
                events[endIdx].type !== 'snapshot-end'
              ) {
                endIdx++;
              }
              if (
                endIdx >= events.length ||
                events[endIdx].type !== 'snapshot-end'
              ) {
                // snapshot-end hasn't arrived yet — stop processing, wait for more data
                break;
              }
              state.eventIdx = endIdx + 1;
              renderEventsToCanvas(ctx, events.slice(0, state.eventIdx));
              needsRedraw = false;
              continue;
            }

            const result = processEventIncremental(
              ctx,
              evt,
              events.slice(0, state.eventIdx + 1),
              replayState,
            );

            if (result.needsFullRedraw) {
              state.eventIdx++;
              needsRedraw = true;
              continue;
            }

            // Flush any pending redraws before processing other events
            if (needsRedraw) {
              needsRedraw = false;
              redrawUpTo(evt.t);
            }

            // Handle shape preview (cursor during shape drawing)
            if (result.shapePreview) {
              renderEventsToCanvas(ctx, events.slice(0, state.eventIdx));
              const sp = result.shapePreview;
              drawShapeOnCanvas(
                ctx,
                sp.shape,
                sp.x1,
                sp.y1,
                sp.x2,
                sp.y2,
                sp.color,
                sp.size,
                1,
              );
            }

            // Update cursor
            if (evt.type === 'click') {
              if (cursorRef.current) {
                cursorRef.current = {
                  ...cursorRef.current,
                  pressed: true,
                  pressTime: performance.now(),
                };
              }
            } else if (result.stateChanged) {
              cursorRef.current = {
                x: cursorRef.current?.x ?? 0,
                y: cursorRef.current?.y ?? 0,
                tool: replayState.tool || undefined,
                color: replayState.color || undefined,
                lastDrawTime: cursorRef.current?.lastDrawTime,
              };
            } else if (result.cursorPosition) {
              cursorRef.current = {
                x: result.cursorPosition.x,
                y: result.cursorPosition.y,
                tool: replayState.tool || undefined,
                color: replayState.color || undefined,
                lastDrawTime: result.isDrawEvent
                  ? performance.now()
                  : cursorRef.current?.lastDrawTime,
              };
            }

            state.eventIdx++;
          }
          // Flush any remaining batched redraws
          if (needsRedraw) {
            redrawUpTo(elapsed);
          }

          const effectiveEnd = trimEndRef.current || maxTimeRef.current;
          const pastEnd =
            doneRef.current &&
            ((state.eventIdx >= events.length && events.length > 0) ||
              (effectiveEnd > 0 && elapsed >= effectiveEnd));

          if (pastEnd) {
            recordCompletedView();
            if (loopRef.current) {
              const ts = trimStartRef.current;
              state.eventIdx = 0;
              state.replayStart = performance.now() - ts / speedRef.current;
              state.isPaused = false;
              recordedViewForRunRef.current = false;

              // Redraw up to trim start
              const loopResult = renderEventsToCanvas(ctx, events, {
                upToTime: ts,
              });

              // Find event index for trim start
              for (let i = 0; i < events.length; i++) {
                if (events[i].t > ts) {
                  state.eventIdx = i;
                  break;
                }
                state.eventIdx = i + 1;
              }

              // Reset replay state to match render result
              replayState.tool = loopResult.tool;
              replayState.color = loopResult.color;
              replayState.size = loopResult.size;
              replayState.shapeStart = null;
            } else {
              state.isPaused = true;
              setPlaying(false);
              setReachedEnd(true);
              cursorRef.current = null;
              if (autoplayRef.current) {
                // When autoplayBest with a visible overlay, the NextUpOverlay
                // handles the countdown and fires onAutoplayEnd — skip here.
                // But if dismissed, navigate normally.
                if (
                  !(
                    autoplayBestRef.current &&
                    nextBestPreviewRef.current &&
                    !dismissedNextUpRef.current
                  )
                ) {
                  onAutoplayEndRef.current?.();
                }
              }
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(frame);
    };

    animFrameRef.current = requestAnimationFrame(frame);

    return () => {
      cancelledRef.current = true;
      cancelAnimationFrame(animFrameRef.current);
      activeReadersRef.current.forEach((r) => r.cancel().catch(() => {}));
      activeReadersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join produces a stable string key from the array
  }, [streamIds.join(',')]);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetTime = parseFloat(e.target.value);
      setScrubValue(targetTime);

      const state = replayStateRef.current;
      state.isScrubbing = true;

      redrawUpTo(targetTime);

      const events = eventsRef.current;
      let idx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].t > targetTime) break;
        idx = i + 1;
      }
      state.eventIdx = idx;
      state.replayStart = performance.now() - targetTime / speedRef.current;
      state.isPaused = !playingRef.current;
      if (state.isPaused) {
        state.pausedAt = performance.now();
      }
      state.isScrubbing = false;
    },
    [redrawUpTo],
  );

  const handleReplay = useCallback(() => {
    recordedViewForRunRef.current = false;
    setReachedEnd(false);
    setPlaying(true);
    const state = replayStateRef.current;
    const ts = trimStartRef.current;
    state.replayStart = performance.now() - ts / speedRef.current;
    state.isPaused = false;
    state.isScrubbing = false;
    redrawUpTo(ts);
    setScrubValue(ts);
    // Find the event index for trim start
    const events = eventsRef.current;
    state.eventIdx = 0;
    for (let i = 0; i < events.length; i++) {
      if (events[i].t > ts) break;
      state.eventIdx = i + 1;
    }
  }, [redrawUpTo]);

  const togglePlay = useCallback(() => {
    if (reachedEnd) {
      handleReplay();
    } else {
      setPlaying((p) => !p);
    }
  }, [reachedEnd, handleReplay]);

  return (
    <div className="w-full max-w-4xl space-y-2 px-2 py-2 sm:space-y-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-text-tertiary hover:text-text-secondary text-sm font-medium transition-colors"
          >
            Back
          </button>
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-text-tertiary text-xs font-medium transition-colors hover:text-red-500 sm:text-sm"
            >
              Delete
            </button>
          )}
          {remixOf && (
            <Link
              href={`/sketch/${remixOf.id}`}
              className="text-text-tertiary hover:text-text-secondary text-xs transition-colors"
            >
              Remix of{' '}
              {remixOf.author?.handle ? (
                <span className="font-medium">@{remixOf.author.handle}</span>
              ) : (
                'a sketch'
              )}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <UpvoteButton
            sketchId={sketchId}
            score={score}
            votes={votes}
            authorId={authorId}
          />
          <button
            onClick={() => router.push(`/new?remix=${sketchId}`)}
            className="border-border-strong text-text-secondary hover:bg-hover cursor-pointer rounded-lg border px-3 py-1 text-xs font-semibold transition-all active:scale-95 sm:rounded-xl sm:px-4 sm:py-1.5 sm:text-sm"
          >
            Remix
          </button>
          <button
            onClick={() => router.push('/new')}
            className="bg-accent text-accent-text shadow-border hover:bg-accent-hover cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold shadow-md transition-all active:scale-95 sm:rounded-xl sm:px-4 sm:py-1.5 sm:text-sm"
          >
            New sketch
          </button>
          {isLive && !done && (
            <span className="bg-accent text-accent-text animate-pulse rounded-full px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs">
              LIVE
            </span>
          )}
          {canReport && (
            <OverflowMenu
              onReport={() => {
                setPlaying(false);
                setShowReport(true);
              }}
            />
          )}
        </div>
      </div>

      <div className="border-border bg-surface relative border-y sm:rounded-2xl sm:border sm:shadow-lg sm:shadow-slate-100/50">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full sm:rounded-2xl"
          style={{ backgroundColor: DEFAULT_BG }}
        />
        {showCursor && <CursorOverlay cursorRef={cursorRef} />}
        {isLive && !done && (
          <span className="bg-accent text-accent-text absolute top-3 left-3 animate-pulse rounded-full px-2.5 py-1 text-xs font-semibold shadow-md">
            LIVE
          </span>
        )}
        {autoplayBest && nextBestPreview && !dismissedNextUp && (
          <NextUpOverlay
            preview={nextBestPreview}
            countdownActive={!playing}
            onPlayNow={() => {
              onAutoplayEndRef.current?.();
            }}
            onDismiss={() => {
              setDismissedNextUp(true);
              if (reachedEnd) {
                onAutoplayEndRef.current?.();
              }
            }}
          />
        )}
      </div>

      {/* Scrub bar with play button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={togglePlay}
          className="border-border hover:border-border-strong hover:bg-hover flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors"
        >
          {reachedEnd ? (
            <svg
              className="text-accent h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
          ) : playing ? (
            <svg
              className="text-text-secondary h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg
              className="text-text-secondary ml-0.5 h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {/* Settings cog */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
              showSettings
                ? 'border-border-strong bg-surface-secondary text-text-secondary'
                : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
            }`}
            title="Settings"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
            </svg>
          </button>
          {showSettings && (
            <div className="border-border bg-surface absolute bottom-full left-0 mb-2 flex flex-col gap-2 rounded-xl border p-3 shadow-lg">
              <label className="text-text-secondary flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap select-none">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                  className="accent-accent"
                />
                Loop
              </label>
              <label className="text-text-secondary flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap select-none">
                <input
                  type="checkbox"
                  checked={showCursor}
                  onChange={(e) => setShowCursor(e.target.checked)}
                  className="accent-accent"
                />
                Show cursor
              </label>
            </div>
          )}
        </div>
        <SpeedSelector
          speed={speed}
          onSpeedChange={(next) => {
            const state = replayStateRef.current;
            if (!state.isPaused) {
              const now = performance.now();
              const elapsed = (now - state.replayStart) * speed;
              state.replayStart = now - elapsed / next;
            }
            setSpeed(next);
          }}
        />
        {(() => {
          const effectiveTrimEnd = trimEnd || maxTime;
          const isTrimmedView =
            !trimming && (trimStart > 0 || effectiveTrimEnd < maxTime);
          const displayCurrent = isTrimmedView
            ? Math.max(0, scrubValue - trimStart)
            : scrubValue;
          const displayTotal = isTrimmedView
            ? effectiveTrimEnd - trimStart
            : maxTime;
          return (
            <>
              <span className="text-text-tertiary w-10 text-right text-xs tabular-nums">
                {formatTime(displayCurrent)}
              </span>
              <ScrubBar
                maxTime={maxTime}
                scrubValue={scrubValue}
                trimming={trimming}
                trimStart={trimStart}
                trimEnd={effectiveTrimEnd}
                onScrub={handleScrub}
                onTrimStartChange={(v) => {
                  setTrimStart(v);
                  handleScrub({
                    target: { value: String(v) },
                  } as React.ChangeEvent<HTMLInputElement>);
                }}
                onTrimEndChange={(v) => {
                  setTrimEnd(v);
                  handleScrub({
                    target: { value: String(v) },
                  } as React.ChangeEvent<HTMLInputElement>);
                }}
              />
              <span className="text-text-tertiary w-10 text-xs tabular-nums">
                {formatTime(displayTotal)}
              </span>
            </>
          );
        })()}
      </div>
      {/* Trim actions */}
      {trimming && maxTime > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary text-xs">
            {formatTime(trimStart)} – {formatTime(trimEnd || maxTime)}
          </span>
          <button
            onClick={async () => {
              setUndoTrim({
                trimStart: savedTrimStart ?? 0,
                trimEnd: savedTrimEnd,
              });
              const effectiveTrimEnd = trimEnd || maxTime;
              db.transact(
                db.tx.sketches[sketchId].update({
                  trimStart,
                  trimEnd: effectiveTrimEnd,
                }),
              );
              setTrimming(false);
              // Update thumbnail to show the frame at trimEnd
              redrawUpTo(effectiveTrimEnd);
              const canvas = canvasRef.current;
              if (canvas) {
                const blob = await new Promise<Blob | null>((resolve) =>
                  canvas.toBlob(resolve, 'image/png'),
                );
                if (blob) {
                  const file = new File([blob], `sketch-${sketchId}.png`, {
                    type: 'image/png',
                  });
                  const { data } = await db.storage.uploadFile(
                    `sketches/${sketchId}.png`,
                    file,
                  );
                  db.transact(
                    db.tx.sketches[sketchId].link({ thumbnail: data.id }),
                  );
                }
              }
            }}
            className="rounded-lg bg-stone-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-stone-700"
          >
            Trim
          </button>
          <button
            onClick={() => {
              setTrimStart(savedTrimStart ?? 0);
              setTrimEnd(savedTrimEnd);
              setTrimming(false);
            }}
            className="border-border text-text-secondary hover:bg-hover rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Skip
          </button>
        </div>
      )}
      {/* Undo trim */}
      {!trimming && undoTrim && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              db.transact(
                db.tx.sketches[sketchId].update({
                  trimStart: undoTrim.trimStart || null,
                  trimEnd: undoTrim.trimEnd || null,
                } as Record<string, unknown>),
              );
              setTrimStart(undoTrim.trimStart);
              setTrimEnd(undoTrim.trimEnd);
              setUndoTrim(null);
              setTrimming(true);
            }}
            className="border-border text-text-secondary hover:bg-hover rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Undo trim
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-surface mx-4 w-full max-w-sm rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-text-primary text-lg font-semibold">
              Delete this sketch?
            </h3>
            <p className="text-text-secondary mt-2 text-sm">
              This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deletePending}
                className="bg-surface-secondary text-text-secondary hover:bg-hover rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeletePending(true);
                  try {
                    await db.transact(db.tx.sketches[sketchId].delete());
                    onDelete?.();
                    router.push('/');
                  } catch (error) {
                    showToast({
                      message: getErrorMessage(
                        error,
                        'Failed to delete sketch. Please try again.',
                        'Delete failed. You can only delete your own sketches for the first 5 minutes.',
                      ),
                      tone: 'error',
                    });
                  } finally {
                    setDeletePending(false);
                  }
                }}
                disabled={deletePending}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <ReportModal
          sketchId={sketchId}
          events={eventsRef.current}
          maxTime={maxTime}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// Shared shape for each level of nested remixOf query result
type AncestorNode = {
  id: string;
  thumbnail?: { url: string };
  author?: { handle?: string | null };
  stream?: { id: string };
  remixOf?: AncestorNode;
};

// Flatten the nested remixOf chain into an array (parent first, oldest last)
function flattenAncestors(node: AncestorNode | undefined): AncestorNode[] {
  const result: AncestorNode[] = [];
  let current = node;
  while (current) {
    result.push(current);
    current = current.remixOf;
  }
  return result;
}

const REMIX_OF_DEPTH = {
  thumbnail: {},
  author: {},
  stream: {},
  remixOf: {
    thumbnail: {},
    author: {},
    stream: {},
    remixOf: {
      thumbnail: {},
      author: {},
      stream: {},
      remixOf: {
        thumbnail: {},
        author: {},
        stream: {},
        remixOf: {
          thumbnail: {},
          author: {},
          stream: {},
        },
      },
    },
  },
};

function RemixHistory({
  currentSketchId,
  parentId,
  currentThumbnailUrl,
  currentStreamId,
  onPlayAll,
  isPlaying,
  onStop,
}: {
  currentSketchId: string;
  parentId: string;
  currentThumbnailUrl: string | null;
  currentStreamId: string;
  onPlayAll: (streamIds: string[]) => void;
  isPlaying: boolean;
  onStop: () => void;
}) {
  const { data } = db.useQuery({
    sketches: {
      ...REMIX_OF_DEPTH,
      $: { where: { id: parentId } },
    },
  });

  const root = data?.sketches[0] as AncestorNode | undefined;
  const ancestors = root ? flattenAncestors(root) : [];

  // The deepest ancestor had a remixOf that wasn't fetched — offer to load more
  const deepest = ancestors[ancestors.length - 1];
  const [olderAncestors, setOlderAncestors] = useState<AncestorNode[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMore =
    !!deepest?.remixOf || (ancestors.length === 5 && !olderAncestors.length);

  // Actually we can't tell from the query if there's a 6th — remixOf on the 5th
  // level isn't included. We need to check via a separate query.
  const deepestId = ancestors[ancestors.length - 1]?.id;
  const { data: deepestData } = db.useQuery(
    deepestId
      ? {
          sketches: {
            $: { where: { 'remixes.id': deepestId }, limit: 1 },
          },
        }
      : null,
  );
  const hasDeeper = !!deepestData?.sketches?.[0] && olderAncestors.length === 0;

  const loadOlder = useCallback(async () => {
    const deepestParentId = deepestData?.sketches?.[0]?.id;
    if (!deepestParentId) return;
    setLoadingOlder(true);
    const res = (await db.queryOnce({
      sketches: {
        ...REMIX_OF_DEPTH,
        $: { where: { id: deepestParentId } },
      },
    })) as { data: { sketches: AncestorNode[] } };
    const olderRoot = res.data.sketches[0];
    if (olderRoot) {
      setOlderAncestors(flattenAncestors(olderRoot));
    }
    setLoadingOlder(false);
  }, [deepestData]);

  const allAncestors = [
    ...[...olderAncestors].reverse(),
    ...[...ancestors].reverse(),
  ];
  // Dedupe just in case
  const seen = new Set<string>();
  const deduped = allAncestors.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  if (deduped.length === 0) return null;

  const buildStreamIds = () => {
    const ids: string[] = [];
    for (const a of deduped) {
      if (a.stream?.id) ids.push(a.stream.id);
    }
    ids.push(currentStreamId);
    return ids;
  };

  return (
    <div className="w-full max-w-4xl px-2 pb-2 sm:px-6 sm:pb-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-text-secondary text-sm font-semibold">
          Remix history
        </h3>
        <button
          onClick={() => {
            if (isPlaying) {
              onStop();
            } else {
              onPlayAll(buildStreamIds());
            }
          }}
          className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors ${
            isPlaying
              ? 'border-border-strong bg-surface-secondary text-text-secondary'
              : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
          }`}
        >
          {isPlaying ? (
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {isPlaying ? 'Stop' : 'Play all'}
        </button>
      </div>
      <div className="flex items-center overflow-x-auto pb-2">
        {hasDeeper && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="border-border-strong text-text-tertiary hover:border-border-strong hover:text-text-secondary flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed text-xs transition-colors sm:h-20 sm:w-20"
          >
            {loadingOlder ? '...' : 'Older'}
          </button>
        )}
        {deduped.map((a, i) => (
          <div key={a.id} className="flex shrink-0 items-center">
            {(i > 0 || hasDeeper) && (
              <svg
                className="text-border-strong mx-1 h-3 w-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            <Link
              href={`/sketch/${a.id}`}
              className="group border-border relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow-md sm:h-20 sm:w-20"
            >
              {a.thumbnail?.url ? (
                <img
                  src={a.thumbnail.url}
                  alt="Ancestor sketch"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ backgroundColor: DEFAULT_BG }}
                >
                  <span className="text-text-tertiary text-[8px]">?</span>
                </div>
              )}
              {a.author?.handle && (
                <span className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-[8px] font-medium text-white sm:text-[10px]">
                  @{a.author.handle}
                </span>
              )}
            </Link>
          </div>
        ))}
        {/* Current sketch */}
        <svg
          className="text-border-strong mx-1 h-3 w-3 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="border-accent relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 sm:h-20 sm:w-20">
          {currentThumbnailUrl ? (
            <img
              src={currentThumbnailUrl}
              alt="Current sketch"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: DEFAULT_BG }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RemixesSection({
  sketchId,
  autoplay,
  autoplayParent,
}: {
  sketchId: string;
  autoplay: boolean;
  autoplayParent: string | null;
}) {
  const router = useRouter();
  const { data } = db.useQuery({
    sketches: {
      thumbnail: {},
      author: {},
      $: {
        where: { 'remixOf.id': sketchId },
        order: { createdAt: 'desc' as const },
        limit: 12,
      },
    },
  });

  const remixes = data?.sketches;
  if (!remixes || remixes.length === 0) return null;

  const isAutoplayActive = autoplay && autoplayParent === sketchId;

  return (
    <div className="w-full max-w-4xl px-2 pb-4 sm:px-6 sm:pb-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-text-secondary text-sm font-semibold">
          Remixes
          <span className="text-text-tertiary ml-1.5 font-normal">
            ({remixes.length})
          </span>
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
        {remixes.map((remix) => (
          <Link
            key={remix.id}
            href={`/sketch/${remix.id}${autoplay ? `?autoplay=${autoplayParent || sketchId}` : ''}`}
            className="group border-border bg-surface relative overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-100 active:scale-[0.98]"
          >
            {remix.thumbnail?.url ? (
              <img
                src={remix.thumbnail.url}
                alt="Remix thumbnail"
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div
                className="flex aspect-[4/3] w-full items-center justify-center"
                style={{ backgroundColor: DEFAULT_BG }}
              >
                <span className="text-text-tertiary text-xs">No preview</span>
              </div>
            )}
            {remix.author?.handle && (
              <span className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5 text-[10px] font-medium text-white sm:text-xs">
                @{remix.author.handle}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function OverflowMenu({ onReport }: { onReport: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-text-tertiary hover:bg-hover hover:text-text-secondary flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="border-border bg-surface absolute top-full right-0 z-50 mt-1 overflow-hidden rounded-lg border py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onReport();
            }}
            className="text-text-secondary hover:bg-hover flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:text-red-500"
          >
            Report
          </button>
        </div>
      )}
    </div>
  );
}

function ReportModal({
  sketchId,
  events,
  maxTime,
  onClose,
}: {
  sketchId: string;
  events: StrokeEvent[];
  maxTime: number;
  onClose: () => void;
}) {
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scrubTime, setScrubTime] = useState(maxTime);
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redraw mini canvas when scrub time changes
  useEffect(() => {
    const canvas = miniCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderEventsToCanvas(ctx, events, { upToTime: scrubTime });
  }, [events, scrubTime]);

  const handleSubmit = async () => {
    const canvas = miniCanvasRef.current;
    if (!canvas) return;
    const frameDataUrl = canvas.toDataURL('image/png');

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sketchId,
          reason,
          details: details.trim() || undefined,
          frameDataUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit report');
      }

      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
        onClick={onClose}
      >
        <div
          className="bg-surface mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-text-primary text-center text-lg font-semibold">
            Report submitted
          </p>
          <p className="text-text-secondary mt-2 text-center text-sm">
            Thank you for helping keep the community safe.
          </p>
          <div className="mt-5 flex justify-center">
            <button
              onClick={onClose}
              className="bg-surface-secondary text-text-secondary hover:bg-hover rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
      onClick={onClose}
    >
      <div
        className="bg-surface mx-4 w-full max-w-lg rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-text-primary text-lg font-semibold">
          Report this sketch
        </h3>
        <p className="text-text-secondary mt-1 text-sm">
          Scrub to the frame with objectionable content.
        </p>

        {/* Mini canvas preview */}
        <div className="border-border mt-4 overflow-hidden rounded-lg border">
          <canvas
            ref={miniCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full"
            style={{ backgroundColor: DEFAULT_BG }}
          />
        </div>

        {/* Scrubber */}
        <div className="mt-2 flex items-center gap-3">
          <span className="text-text-tertiary text-xs tabular-nums">
            {formatTime(scrubTime)}
          </span>
          <input
            type="range"
            min={0}
            max={maxTime}
            value={scrubTime}
            onChange={(e) => setScrubTime(Number(e.target.value))}
            className="bg-surface-secondary accent-accent h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
          />
          <span className="text-text-tertiary text-xs tabular-nums">
            {formatTime(maxTime)}
          </span>
        </div>

        {/* Reason */}
        <div className="mt-4">
          <label className="text-text-secondary mb-2 block text-sm font-medium">
            Reason
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'inappropriate', label: 'Inappropriate' },
              { value: 'offensive', label: 'Offensive / hateful' },
              { value: 'spam', label: 'Spam' },
              { value: 'other', label: 'Other' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReason(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  reason === opt.value
                    ? 'border-accent bg-accent text-accent-text'
                    : 'border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="mt-3">
          <label className="text-text-secondary text-sm font-medium">
            Details
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Any additional context..."
            rows={2}
            className="border-border bg-surface text-text-secondary placeholder:text-text-tertiary mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-surface-secondary text-text-secondary hover:bg-hover rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScrubBar({
  maxTime,
  scrubValue,
  trimming,
  trimStart,
  trimEnd,
  onScrub,
  onTrimStartChange,
  onTrimEndChange,
}: {
  maxTime: number;
  scrubValue: number;
  trimming: boolean;
  trimStart: number;
  trimEnd: number;
  onScrub: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTrimStartChange: (v: number) => void;
  onTrimEndChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | 'scrub' | null>(null);

  // Half the handle width — used as horizontal padding so handles at 0%/100% stay clickable
  const HANDLE_PAD = 6;

  const getTimeFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const inner = rect.width - HANDLE_PAD * 2;
      const pct = Math.max(
        0,
        Math.min(1, (clientX - rect.left - HANDLE_PAD) / inner),
      );
      return Math.round(pct * maxTime);
    },
    [maxTime],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!trimming) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const inner = rect.width - HANDLE_PAD * 2;
      const px = e.clientX - rect.left - HANDLE_PAD;
      const startPx = (trimStart / (maxTime || 1)) * inner;
      const endPx = (trimEnd / (maxTime || 1)) * inner;

      const t = getTimeFromPointer(e.clientX);
      const distStart = Math.abs(px - startPx);
      const distEnd = Math.abs(px - endPx);
      if (distStart <= distEnd) {
        draggingRef.current = 'start';
        onTrimStartChange(Math.max(0, Math.min(t, trimEnd - 200)));
      } else {
        draggingRef.current = 'end';
        onTrimEndChange(Math.min(maxTime, Math.max(t, trimStart + 200)));
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [
      trimming,
      trimStart,
      trimEnd,
      maxTime,
      getTimeFromPointer,
      onTrimStartChange,
      onTrimEndChange,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const t = getTimeFromPointer(e.clientX);
      if (draggingRef.current === 'start') {
        onTrimStartChange(Math.max(0, Math.min(t, trimEnd - 200)));
      } else if (draggingRef.current === 'end') {
        onTrimEndChange(Math.min(maxTime, Math.max(t, trimStart + 200)));
      } else {
        // scrub drag
        onScrub({
          target: { value: String(Math.max(0, Math.min(maxTime, t))) },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    },
    [
      getTimeFromPointer,
      trimStart,
      trimEnd,
      maxTime,
      onTrimStartChange,
      onTrimEndChange,
      onScrub,
    ],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // When trimming: show full timeline with trim handles
  // When not trimming: scale bar to just the trimmed region
  const isTrimmed = !trimming && (trimStart > 0 || trimEnd < maxTime);
  const barStart = isTrimmed ? trimStart : 0;
  const barEnd = isTrimmed ? trimEnd : maxTime;
  const barRange = Math.max(barEnd - barStart, 1);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const playPct =
    computePlaybackProgress({
      elapsed: scrubValue,
      start: barStart,
      end: barEnd,
      stalledOnStream: false,
      lastProcessedTime: scrubValue,
      previousProgress: 0,
    }) * 100;

  // For trim mode, percentages are relative to full maxTime
  const fullMax = maxTime || 1;
  const startPct = (trimStart / fullMax) * 100;
  const endPct = (trimEnd / fullMax) * 100;

  const trackH = trimming ? 28 : 16;
  const barTop = trimming ? 10 : 5;
  const barH = trimming ? 8 : 6;

  return (
    <div
      ref={trackRef}
      className="relative min-w-0 flex-1 select-none"
      style={{ height: trackH }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Inner track area inset by HANDLE_PAD so handles at 0%/100% stay fully clickable */}
      <div
        className="absolute inset-y-0"
        style={{ left: HANDLE_PAD, right: HANDLE_PAD }}
      >
        {/* Base track */}
        <div
          className="bg-surface-secondary absolute inset-x-0 rounded-full"
          style={{ top: barTop, height: barH }}
        />

        {trimming ? (
          <>
            {/* Gray outside trim area */}
            <div
              className="absolute left-0 rounded-l-full bg-gray-400"
              style={{ top: barTop, height: barH, width: `${startPct}%` }}
            />
            <div
              className="absolute right-0 rounded-r-full bg-gray-400"
              style={{
                top: barTop,
                height: barH,
                width: `${100 - endPct}%`,
              }}
            />
            {/* Active trim region */}
            <div
              className="absolute bg-stone-300"
              style={{
                top: barTop,
                height: barH,
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }}
            />
            {/* Progress fill within trim region */}
            <div
              className="absolute rounded-l-full bg-slate-500"
              style={{
                top: barTop,
                height: barH,
                left: `${startPct}%`,
                width: `${clamp(((scrubValue - trimStart) / (trimEnd - trimStart || 1)) * (endPct - startPct))}%`,
              }}
            />
            {/* Start handle */}
            <div
              className="absolute top-0 h-7 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm border-2 border-stone-600 bg-stone-500 shadow"
              style={{ left: `${startPct}%` }}
            />
            {/* End handle */}
            <div
              className="absolute top-0 h-7 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm border-2 border-stone-600 bg-stone-500 shadow"
              style={{ left: `${endPct}%` }}
            />
          </>
        ) : (
          <>
            {/* Progress fill scaled to trimmed range */}
            <div
              className="absolute left-0 rounded-full bg-slate-500"
              style={{
                top: barTop,
                height: barH,
                width: `${playPct}%`,
              }}
            />
          </>
        )}

        {/* Scrub input — scaled to trimmed range when not trimming */}
        <input
          type="range"
          min={Math.round(barStart)}
          max={Math.round(barEnd)}
          step={1}
          value={Math.round(Math.max(barStart, Math.min(barEnd, scrubValue)))}
          onChange={onScrub}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          style={{ zIndex: trimming ? 1 : 10 }}
        />
      </div>
    </div>
  );
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];

function SpeedSelector({
  speed,
  onSpeedChange,
}: {
  speed: number;
  onSpeedChange: (s: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex h-8 shrink-0 items-center justify-center rounded-full border px-2 text-xs font-semibold transition-colors ${
          speed !== 1
            ? 'border-border-strong bg-surface-secondary text-text-secondary'
            : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
        }`}
        title="Playback speed"
      >
        {speed}x
      </button>
      {open && (
        <div className="border-border bg-surface absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 overflow-hidden rounded-lg border py-1 shadow-lg">
          <div className="text-text-tertiary px-3 py-1.5 text-xs font-semibold">
            Speed
          </div>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onSpeedChange(s);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                speed === s
                  ? 'bg-surface-secondary text-text-primary font-semibold'
                  : 'text-text-secondary hover:bg-hover'
              }`}
            >
              {speed === s && (
                <svg
                  className="text-text-secondary h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
              {speed !== s && <span className="w-3" />}
              {s === 1 ? 'Normal' : `${s}x`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
