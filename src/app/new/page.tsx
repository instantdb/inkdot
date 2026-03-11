'use client';

import { db } from '@/lib/db';
import { id } from '@instantdb/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type StrokeEvent,
  type IncrementalState,
  AuthHeader,
  CursorOverlay,
  LoginModal,
  TimerDisplay,
  InkDisplay,
  InkBudgetPreview,
  ToolBar,
  ColorPickers,
  DEFAULT_BG,
  CANVAS_W,
  CANVAS_H,
  buildOffsets,
  buildDeletedSet,
  drawShapeOnCanvas,
  isLightColor,
  formatTime,
  renderEventsToCanvas,
  processEventIncremental,
} from '../components';
import {
  useDrawingCanvas,
  TemplatePicker,
  type DrawingUserSettings,
} from '../drawing';

function SignedOutNew() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-text-secondary text-base sm:text-lg">
          Sign in to create a sketch
        </p>
        <button
          onClick={() => setShowLogin(true)}
          className="bg-accent text-accent-text shadow-border hover:bg-accent-hover cursor-pointer rounded-xl px-5 py-2 text-sm font-semibold shadow-md transition-all sm:text-base"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

function SignedInNew() {
  const user = db.useUser();
  const searchParams = useSearchParams();
  const remixId = searchParams.get('remix');

  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <DrawCanvas userId={user.id} remixId={remixId} />
    </div>
  );
}

export default function NewSketchPage() {
  return (
    <>
      <db.SignedOut>
        <SignedOutNew />
      </db.SignedOut>
      <db.SignedIn>
        <SignedInNew />
      </db.SignedIn>
    </>
  );
}

function DrawCanvas({
  userId,
  remixId,
}: {
  userId: string;
  remixId: string | null;
}) {
  const router = useRouter();
  const [sketchId] = useState(() => id());
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const startTimeRef = useRef<number>(0);
  const remixEventsRef = useRef<StrokeEvent[]>([]);
  const [remixLoading, setRemixLoading] = useState(!!remixId);
  const [remixAuthor, setRemixAuthor] = useState<string | null>(null);

  // Query user settings
  const { data: settingsData } = db.useSuspenseQuery({
    userSettings: {
      $: { where: { 'owner.id': userId } },
    },
  });
  const rawSettings = settingsData?.userSettings?.[0];
  const savedSpeed = rawSettings?.playbackSpeed ?? 2;
  const userSettings: DrawingUserSettings | undefined = rawSettings
    ? {
        id: rawSettings.id,
        lastPenColor: rawSettings.lastPenColor ?? undefined,
        lastBgColor: rawSettings.lastBgColor ?? undefined,
        lastTool: rawSettings.lastTool ?? undefined,
        lastBrushSize: rawSettings.lastBrushSize ?? undefined,
        penColors: rawSettings.penColors ?? undefined,
        bgColors: rawSettings.bgColors ?? undefined,
      }
    : undefined;

  const [budgetMode, setBudgetMode] = useState<'time' | 'ink'>('time');
  const [duration, setDuration] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15);
  const [inkBudget, setInkBudget] = useState(6000);
  const [inkRemaining, setInkRemaining] = useState(6000);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);

  const finishedRef = useRef(false);
  const streamActiveRef = useRef(false);
  const finishRecordingRef = useRef(() => {});
  const budgetModeRef = useRef(budgetMode);
  budgetModeRef.current = budgetMode;
  const inkBudgetRef = useRef(inkBudget);
  inkBudgetRef.current = inkBudget;

  // Drawing hook
  const drawing = useDrawingCanvas({
    userId,
    userSettings,
    getTimestamp: useCallback(
      () =>
        streamActiveRef.current ? performance.now() - startTimeRef.current : 0,
      [],
    ),
    onEvent: useCallback((evt: StrokeEvent) => {
      if (finishedRef.current) return;
      const writer = writerRef.current;
      if (!writer) return;
      writer.write(JSON.stringify(evt) + '\n');
    }, []),
    isActive: useCallback(
      () => streamActiveRef.current && !finishedRef.current,
      [],
    ),
    beforePointerDown: useCallback(async () => {
      if (streamActiveRef.current) return;
      await ensureStartedRef.current();
    }, []),
    writeCursorEvents: true,
    drawTraceOnCanvas: false,
    inkBudget: budgetMode === 'ink' ? inkBudget : undefined,
    onInkUsed: useCallback((used: number) => {
      const remaining = Math.max(0, inkBudgetRef.current - used);
      setInkRemaining(remaining);
      if (remaining <= 0) {
        finishRecordingRef.current();
      }
    }, []),
  });

  // ensureStarted needs access to drawing values, so use a ref to avoid circular deps
  const ensureStartedRef = useRef(async () => {});
  ensureStartedRef.current = async () => {
    if (started) return;
    setStarted(true);
    streamActiveRef.current = true;
    if (budgetMode === 'time') {
      setTimeLeft(duration);
    }

    const sketchData =
      budgetMode === 'ink'
        ? { createdAt: Date.now(), inkBudget }
        : { createdAt: Date.now(), duration };
    const txOps = [
      db.tx.sketches[sketchId].update(sketchData).link({ author: userId }),
    ];
    if (remixId) {
      txOps.push(db.tx.sketches[sketchId].link({ remixOf: remixId }));
    }
    db.transact(txOps);

    const writeStream = db.streams.createWriteStream({ clientId: sketchId });
    const streamId = await writeStream.streamId();

    db.transact(db.tx.sketches[sketchId].link({ stream: streamId }));

    const writer = writeStream.getWriter();
    writerRef.current = writer;

    // Write remix prefix events (resolved parent shapes at t=0)
    const remixEvents = remixEventsRef.current;
    if (remixEvents.length > 0) {
      for (const evt of remixEvents) {
        writer.write(JSON.stringify(evt) + '\n');
      }
    } else {
      writer.write(
        JSON.stringify({
          t: 0,
          x: 0,
          y: 0,
          type: 'bg',
          color: drawing.bgColor,
        }) + '\n',
      );
    }

    writer.write(
      JSON.stringify({
        t: 0,
        x: 0,
        y: 0,
        type: 'state',
        tool: drawing.tool,
        color: drawing.penColor,
        size: drawing.brushSize,
      }) + '\n',
    );

    // Start the timestamp clock AFTER writing remix/initial events
    // so the first real drawing event has t≈0 and playback doesn't
    // show dead time at the start
    startTimeRef.current = performance.now();
  };

  // Load remix events
  useEffect(() => {
    if (!remixId) return;
    let cancelled = false;

    async function loadRemix() {
      const { data } = await db.queryOnce({
        sketches: {
          stream: {},
          author: {},
          $: { where: { id: remixId! } },
        },
      });
      const parent = data.sketches[0];
      if (!parent?.stream || cancelled) {
        setRemixLoading(false);
        return;
      }

      setRemixAuthor(parent.author?.handle || null);

      const readStream = db.streams.createReadStream({
        streamId: parent.stream.id,
      });
      const reader = readStream.getReader();
      const rawEvents: StrokeEvent[] = [];
      let buf = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (cancelled) return;
          if (done) break;
          buf += value;
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              rawEvents.push(JSON.parse(line));
            } catch {}
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        throw e;
      }
      if (buf.trim()) {
        try {
          rawEvents.push(JSON.parse(buf));
        } catch {}
      }

      if (cancelled) return;

      const parentTrimStart = parent.trimStart ?? 0;
      const parentTrimEnd = parent.trimEnd ?? parent.durationMs ?? Infinity;
      const trimmedEvents = rawEvents.filter(
        (evt) => evt.t >= parentTrimStart && evt.t <= parentTrimEnd,
      );

      const offsets = buildOffsets(trimmedEvents);
      const deleted = buildDeletedSet(trimmedEvents);

      let lastBg: StrokeEvent | null = null;
      for (const evt of rawEvents) {
        if (evt.t > parentTrimEnd) break;
        if (evt.type === 'bg') lastBg = evt;
      }

      const resolved: StrokeEvent[] = [];

      // Snapshot start marker
      resolved.push({ t: 0, x: 0, y: 0, type: 'snapshot-start' });

      if (lastBg) {
        resolved.push({ ...lastBg, t: 0 });
      }

      // Collapse pen strokes into compact stroke events
      // Track current stroke being built: shapeId -> path points
      let currentStroke: {
        shapeId: string;
        color: string;
        size: number;
        tool: string;
        points: { x: number; y: number }[];
      } | null = null;

      const flushStroke = () => {
        if (!currentStroke || currentStroke.points.length === 0) return;
        const pts = currentStroke.points;
        const pathParts = [`M${pts[0].x},${pts[0].y}`];
        for (let i = 1; i < pts.length; i++) {
          pathParts.push(`L${pts[i].x},${pts[i].y}`);
        }
        resolved.push({
          t: 0,
          x: pts[0].x,
          y: pts[0].y,
          type: 'stroke',
          path: pathParts.join(' '),
          color: currentStroke.color,
          size: currentStroke.size,
          tool: currentStroke.tool,
          shapeId: currentStroke.shapeId,
        });
        currentStroke = null;
      };

      for (const evt of trimmedEvents) {
        if (
          evt.type === 'bg' ||
          evt.type === 'cursor' ||
          evt.type === 'state' ||
          evt.type === 'relocate' ||
          evt.type === 'click' ||
          evt.type === 'delete' ||
          evt.type === 'snapshot-start' ||
          evt.type === 'snapshot-end'
        )
          continue;
        if (evt.shapeId && deleted.has(evt.shapeId)) continue;

        const o = evt.shapeId
          ? offsets.get(evt.shapeId) || { dx: 0, dy: 0 }
          : { dx: 0, dy: 0 };

        // Pen strokes: collapse start/move/end into single stroke event
        if (
          evt.type === 'start' &&
          (evt.tool === 'pen' || evt.tool === 'eraser')
        ) {
          flushStroke();
          currentStroke = {
            shapeId: evt.shapeId || '',
            color: evt.color || '#1e293b',
            size: evt.size || 4,
            tool: evt.tool,
            points: [{ x: evt.x + o.dx, y: evt.y + o.dy }],
          };
          continue;
        }

        if (
          (evt.type === 'move' || evt.type === 'end') &&
          currentStroke &&
          evt.shapeId === currentStroke.shapeId
        ) {
          currentStroke.points.push({ x: evt.x + o.dx, y: evt.y + o.dy });
          if (evt.type === 'end') {
            flushStroke();
          }
          continue;
        }

        // Already-collapsed stroke events: apply offsets to path
        if (evt.type === 'stroke' && evt.path) {
          flushStroke();
          const adjustedPath = evt.path
            .split(' ')
            .map((cmd) => {
              const prefix = cmd[0];
              const [cx, cy] = cmd.slice(1).split(',').map(Number);
              return `${prefix}${cx + o.dx},${cy + o.dy}`;
            })
            .join(' ');
          resolved.push({
            ...evt,
            t: 0,
            x: evt.x + o.dx,
            y: evt.y + o.dy,
            path: adjustedPath,
          });
          continue;
        }

        // Non-pen events (shape, fill): keep as-is with offset applied
        flushStroke();
        const resolved_evt: StrokeEvent = {
          ...evt,
          t: 0,
          x: evt.x + o.dx,
          y: evt.y + o.dy,
        };
        if (evt.x2 !== undefined) resolved_evt.x2 = evt.x2 + o.dx;
        if (evt.y2 !== undefined) resolved_evt.y2 = evt.y2 + o.dy;
        resolved.push(resolved_evt);
      }

      // Flush any remaining stroke
      flushStroke();

      // Snapshot end marker
      resolved.push({ t: 0, x: 0, y: 0, type: 'snapshot-end' });

      if (cancelled) return;

      remixEventsRef.current = resolved;

      if (lastBg?.color) {
        drawing.saveSettings({ lastBgColor: lastBg.color });
      }

      drawing.loadEvents(resolved);
      setRemixLoading(false);
    }

    loadRemix();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixId]);

  const uploadThumbnail = useCallback(async () => {
    const canvas = drawing.canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;
    const file = new File([blob], `sketch-${sketchId}.png`, {
      type: 'image/png',
    });
    const { data } = await db.storage.uploadFile(
      `sketches/${sketchId}.png`,
      file,
    );
    db.transact(db.tx.sketches[sketchId].link({ thumbnail: data.id }));
  }, [sketchId, drawing.canvasRef]);

  const finishRecording = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    streamActiveRef.current = false;
    const elapsed = performance.now() - startTimeRef.current;
    writerRef.current?.close();
    db.transact(
      db.tx.sketches[sketchId].update({ durationMs: Math.round(elapsed) }),
    );
    uploadThumbnail();
    setRecordingDurationMs(elapsed);
    setFinished(true);
  }, [sketchId, uploadThumbnail]);
  finishRecordingRef.current = finishRecording;

  useEffect(() => {
    if (!started || budgetModeRef.current === 'ink') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          finishRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started, finishRecording]);

  // Close writer on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (finishedRef.current || !writerRef.current) return;
      finishedRef.current = true;
      streamActiveRef.current = false;
      const elapsed = performance.now() - startTimeRef.current;
      try {
        writerRef.current.close();
      } catch {}
      db.transact(
        db.tx.sketches[sketchId].update({ durationMs: Math.round(elapsed) }),
      );
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [sketchId]);

  const cancel = useCallback(() => {
    writerRef.current?.abort('cancelled');
    db.transact(db.tx.sketches[sketchId].delete());
    router.push('/');
  }, [sketchId, router]);

  const progress =
    budgetMode === 'ink'
      ? started
        ? (inkBudget - inkRemaining) / inkBudget
        : 0
      : started
        ? (duration - timeLeft) / duration
        : 0;

  const topBtnClass =
    'rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary';

  if (finished) {
    return (
      <TrimPhase
        sketchId={sketchId}
        events={drawing.localEventsRef.current}
        maxTime={recordingDurationMs}
        speed={savedSpeed}
      />
    );
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-2 py-2 sm:gap-4 sm:p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-0">
        {!started ? (
          <div className="flex items-center gap-2">
            <Link href="/practice" className={topBtnClass}>
              Practice
            </Link>
            {remixAuthor && (
              <span className="text-text-tertiary text-xs">
                Remix of{' '}
                <span className="text-text-secondary font-medium">
                  @{remixAuthor}
                </span>
              </span>
            )}
          </div>
        ) : remixAuthor ? (
          <span className="text-text-tertiary text-xs">
            Remix of{' '}
            <span className="text-text-secondary font-medium">
              @{remixAuthor}
            </span>
          </span>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          {!started && (
            <>
              <input
                ref={drawing.traceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={drawing.handleTraceFileChange}
              />
              <button
                onClick={() => {
                  drawing.setShowEasyMode((v) => !v);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  drawing.traceUrl
                    ? 'border-border-strong bg-surface-secondary text-text-secondary'
                    : 'border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {drawing.traceUrl ? 'Easy mode ✓' : 'Easy mode'}
              </button>
              {/* Mode toggle */}
              <div className="flex">
                {(['time', 'ink'] as const).map((mode, i) => (
                  <button
                    key={mode}
                    onClick={() => setBudgetMode(mode)}
                    className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      i === 0 ? 'rounded-l-lg' : 'rounded-r-lg border-l-0'
                    } ${
                      budgetMode === mode
                        ? 'border-border-strong bg-surface-secondary text-text-primary'
                        : 'border-border bg-surface text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {mode === 'time' ? 'Time' : 'Ink'}
                  </button>
                ))}
              </div>
              {/* Budget picker */}
              <div className="flex">
                {budgetMode === 'time'
                  ? [15, 30, 60].map((d, i) => (
                      <button
                        key={d}
                        onClick={() => {
                          setDuration(d);
                          setTimeLeft(d);
                        }}
                        className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          i === 0 ? 'rounded-l-lg' : ''
                        } ${i === 2 ? 'rounded-r-lg' : ''} ${
                          i > 0 ? 'border-l-0' : ''
                        } ${
                          duration === d
                            ? 'border-accent bg-accent text-accent-text'
                            : 'border-border bg-surface text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {d}s
                      </button>
                    ))
                  : [3000, 6000, 12000].map((b, i) => (
                      <button
                        key={b}
                        onClick={() => {
                          setInkBudget(b);
                          setInkRemaining(b);
                        }}
                        className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          i === 0 ? 'rounded-l-lg' : ''
                        } ${i === 2 ? 'rounded-r-lg' : ''} ${
                          i > 0 ? 'border-l-0' : ''
                        } ${
                          inkBudget === b
                            ? 'border-accent bg-accent text-accent-text'
                            : 'border-border bg-surface text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {b / 1000}k
                      </button>
                    ))}
              </div>
              {budgetMode === 'ink' && <InkBudgetPreview budget={inkBudget} />}
              <span className="text-text-tertiary hidden animate-pulse text-sm sm:inline">
                {remixLoading ? 'Loading remix...' : 'Draw to start!'}
              </span>
            </>
          )}
          {started && (
            <>
              {drawing.traceUrl && (
                <label className="text-text-secondary flex cursor-pointer items-center gap-1.5 text-xs select-none">
                  <input
                    type="checkbox"
                    checked={drawing.showTrace}
                    onChange={(e) => drawing.setShowTrace(e.target.checked)}
                    className="accent-slate-700"
                  />
                  Trace
                </label>
              )}
              <button
                onClick={finishRecording}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
              >
                Done
              </button>
            </>
          )}
          {budgetMode === 'ink' ? (
            <InkDisplay inkRemaining={inkRemaining} inkBudget={inkBudget} />
          ) : (
            <TimerDisplay
              timeLeft={timeLeft}
              duration={duration}
              progress={progress}
            />
          )}
        </div>
      </div>

      {/* Easy mode template picker */}
      {drawing.showEasyMode && (
        <TemplatePicker
          traceUrl={drawing.traceUrl}
          onSelectTrace={drawing.selectTrace}
          onClose={() => drawing.setShowEasyMode(false)}
          onUploadClick={() => drawing.traceInputRef.current?.click()}
        />
      )}

      {/* Canvas */}
      <div className="border-border bg-surface relative overflow-hidden border-y sm:rounded-2xl sm:border sm:shadow-lg sm:shadow-slate-100/50">
        <canvas
          ref={drawing.canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full cursor-crosshair"
          style={{ touchAction: 'none', backgroundColor: drawing.bgColor }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.handlePointerDown(e);
          }}
          onPointerMove={drawing.handlePointerMove}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            drawing.handlePointerUp(e);
          }}
        />
        {drawing.traceUrl && drawing.showTrace && (
          <img
            src={drawing.traceUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{
              opacity: 0.5,
              filter: isLightColor(drawing.bgColor) ? 'none' : 'invert(1)',
            }}
          />
        )}
        <div className="bg-surface-secondary absolute right-0 bottom-0 left-0 h-1.5">
          <div
            className={`bg-accent h-full transition-all ${budgetMode === 'ink' ? 'duration-150' : 'duration-1000'} ease-linear`}
            style={{
              width: `${progress * 100}%`,
              backgroundColor:
                budgetMode === 'ink'
                  ? inkRemaining / inkBudget <= 0.1
                    ? '#ef4444'
                    : inkRemaining / inkBudget <= 0.25
                      ? '#eab308'
                      : undefined
                  : undefined,
            }}
          />
        </div>
      </div>

      <ToolBar
        tool={drawing.tool}
        onToolChange={drawing.changeTool}
        shapeFilled={drawing.shapeFilled}
        onShapeFilledChange={drawing.setShapeFilled}
        brushSize={drawing.brushSize}
        onBrushSizeChange={drawing.changeBrushSize}
      />

      <ColorPickers
        penPalette={drawing.penPalette}
        bgPalette={drawing.bgPalette}
        penColor={drawing.penColor}
        bgColor={drawing.bgColor}
        onPenColorChange={drawing.changePenColor}
        onBgColorChange={drawing.changeBgColor}
        onPaletteChange={(type, index, newColor) => {
          const current =
            type === 'pen' ? [...drawing.penPalette] : [...drawing.bgPalette];
          current[index] = newColor;
          drawing.saveSettings(
            type === 'pen' ? { penColors: current } : { bgColors: current },
          );
        }}
      />
    </div>
  );
}

function TrimPhase({
  sketchId,
  events,
  maxTime,
  speed,
}: {
  sketchId: string;
  events: StrokeEvent[];
  maxTime: number;
  speed: number;
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
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(maxTime);
  const [scrubValue, setScrubValue] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loop, setLoop] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(speed);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | 'scrub' | null>(null);
  const animRef = useRef<number>(0);
  const speedRef = useRef(currentSpeed);
  const loopRef = useRef(loop);
  const playingRef = useRef(playing);
  const scrubValueRef = useRef(scrubValue);
  useEffect(() => {
    loopRef.current = loop;
    playingRef.current = playing;
    scrubValueRef.current = scrubValue;
  }, [loop, playing, scrubValue]);
  const stateRef = useRef({
    eventIdx: 0,
    replayStart: 0,
  });

  const redrawUpTo = useCallback(
    (targetTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const result = renderEventsToCanvas(ctx, events, {
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
      } else {
        cursorRef.current = null;
      }
    },
    [events],
  );

  // Replay animation
  useEffect(() => {
    if (!playing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;
    const replayState: IncrementalState = {
      tool: '',
      color: '',
      size: 4,
      shapeStart: null,
    };

    const frame = () => {
      if (!playingRef.current) return;

      const currentTime =
        (performance.now() - state.replayStart) * speedRef.current;

      let needsRedraw = false;
      while (state.eventIdx < events.length) {
        const evt = events[state.eventIdx];
        if (evt.t > currentTime) break;

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
        if (result.stateChanged) {
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

      if (needsRedraw) {
        redrawUpTo(currentTime);
      }

      setScrubValue(Math.min(currentTime, maxTime));

      if (currentTime >= maxTime) {
        if (loopRef.current) {
          state.eventIdx = 0;
          state.replayStart = performance.now();
          renderEventsToCanvas(ctx, [], { bgColor: DEFAULT_BG });
          replayState.tool = '';
          replayState.color = '';
          replayState.size = 4;
          replayState.shapeStart = null;
          setScrubValue(0);
          animRef.current = requestAnimationFrame(frame);
          return;
        }
        cursorRef.current = null;
        setPlaying(false);
        setReachedEnd(true);
        setScrubValue(maxTime);
        return;
      }

      animRef.current = requestAnimationFrame(frame);
    };

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, events, maxTime, redrawUpTo]);

  // Initialize: start playing from 0
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const state = stateRef.current;
    state.replayStart = performance.now();
    state.eventIdx = 0;
  }, []);

  const scrubTo = useCallback(
    (targetTime: number) => {
      cancelAnimationFrame(animRef.current);
      setPlaying(false);
      setReachedEnd(targetTime >= maxTime);
      redrawUpTo(targetTime);
      setScrubValue(targetTime);

      const state = stateRef.current;
      let idx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].t > targetTime) break;
        idx = i + 1;
      }
      state.eventIdx = idx;
      state.replayStart = performance.now() - targetTime / speedRef.current;
    },
    [maxTime, redrawUpTo, events],
  );

  const resume = useCallback(() => {
    setPlaying(true);
    setReachedEnd(false);
  }, []);

  const handleReplay = useCallback(() => {
    const state = stateRef.current;
    state.eventIdx = 0;
    state.replayStart = performance.now();
    setScrubValue(0);
    setReachedEnd(false);
    redrawUpTo(0);
    setPlaying(true);
  }, [redrawUpTo]);

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

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
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
        const clamped = Math.max(0, Math.min(t, trimEnd - 200));
        setTrimStart(clamped);
        scrubTo(clamped);
      } else {
        draggingRef.current = 'end';
        const clamped = Math.min(maxTime, Math.max(t, trimStart + 200));
        setTrimEnd(clamped);
        scrubTo(clamped);
      }
      track.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [trimStart, trimEnd, maxTime, getTimeFromPointer, scrubTo],
  );

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const t = getTimeFromPointer(e.clientX);
      if (draggingRef.current === 'start') {
        const clamped = Math.max(0, Math.min(t, trimEnd - 200));
        setTrimStart(clamped);
        scrubTo(clamped);
      } else if (draggingRef.current === 'end') {
        const clamped = Math.min(maxTime, Math.max(t, trimStart + 200));
        setTrimEnd(clamped);
        scrubTo(clamped);
      } else if (draggingRef.current === 'scrub') {
        const clamped = Math.max(0, Math.min(maxTime, t));
        scrubTo(clamped);
      }
    },
    [getTimeFromPointer, trimStart, trimEnd, maxTime, scrubTo],
  );

  const onTrackPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const hasTrimmed = trimStart > 0 || trimEnd < maxTime;

  const saveTrim = useCallback(async () => {
    if (hasTrimmed) {
      db.transact(db.tx.sketches[sketchId].update({ trimStart, trimEnd }));
      redrawUpTo(trimEnd);
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
          db.transact(db.tx.sketches[sketchId].link({ thumbnail: data.id }));
        }
      }
    }
    router.push(`/sketch/${sketchId}`);
  }, [sketchId, trimStart, trimEnd, hasTrimmed, router, redrawUpTo]);

  const skip = useCallback(() => {
    router.push(`/sketch/${sketchId}`);
  }, [sketchId, router]);

  const fullMax = maxTime || 1;
  const startPct = (trimStart / fullMax) * 100;
  const endPct = (trimEnd / fullMax) * 100;
  const playPct = Math.max(0, Math.min(100, (scrubValue / fullMax) * 100));

  return (
    <div className="flex w-full max-w-4xl flex-col gap-2 py-2 sm:gap-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 px-2 sm:px-0">
        <span className="text-text-secondary text-sm font-medium">
          Trim your sketch
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={skip}
            className="border-border text-text-secondary hover:bg-hover rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Skip
          </button>
          <button
            onClick={saveTrim}
            className="bg-accent text-accent-text hover:bg-accent-hover rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            {hasTrimmed ? 'Save trim' : 'Done'}
          </button>
        </div>
      </div>

      {/* Canvas with replay */}
      <div className="border-border bg-surface relative overflow-hidden border-y sm:rounded-2xl sm:border sm:shadow-lg sm:shadow-slate-100/50">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full"
          style={{ backgroundColor: DEFAULT_BG }}
        />
        <CursorOverlay cursorRef={cursorRef} />
      </div>

      {/* Player controls */}
      <div className="flex items-center gap-2 px-2 sm:gap-3 sm:px-0">
        <button
          onClick={
            reachedEnd
              ? handleReplay
              : playing
                ? () => {
                    cancelAnimationFrame(animRef.current);
                    stateRef.current.replayStart =
                      performance.now() -
                      scrubValueRef.current / speedRef.current;
                    setPlaying(false);
                  }
                : resume
          }
          className="border-border hover:border-border-strong hover:bg-surface-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors"
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

        <button
          onClick={() => setLoop((l) => !l)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
            loop
              ? 'border-border-strong bg-surface-secondary text-text-secondary'
              : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
          }`}
          title="Loop"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
          </svg>
        </button>

        <TrimSpeedSelector
          speed={currentSpeed}
          onSpeedChange={(next) => {
            const state = stateRef.current;
            if (playingRef.current) {
              const now = performance.now();
              const elapsed = (now - state.replayStart) * currentSpeed;
              state.replayStart = now - elapsed / next;
            }
            speedRef.current = next;
            setCurrentSpeed(next);
          }}
        />

        <span className="text-text-tertiary w-10 text-right text-xs tabular-nums">
          {formatTime(scrubValue)}
        </span>

        {/* Trim scrub bar */}
        <div
          ref={trackRef}
          className="relative min-w-0 flex-1 cursor-pointer touch-none select-none"
          style={{ height: 28 }}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
        >
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: HANDLE_PAD, right: HANDLE_PAD }}
          >
            <div
              className="absolute inset-x-0 rounded-full bg-gray-200"
              style={{ top: 10, height: 8 }}
            />
            <div
              className="absolute left-0 rounded-l-full bg-gray-400"
              style={{ top: 10, height: 8, width: `${startPct}%` }}
            />
            <div
              className="absolute right-0 rounded-r-full bg-gray-400"
              style={{ top: 10, height: 8, width: `${100 - endPct}%` }}
            />
            <div
              className="absolute bg-stone-300"
              style={{
                top: 10,
                height: 8,
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }}
            />
            <div
              className="absolute rounded-l-full bg-slate-500"
              style={{
                top: 10,
                height: 8,
                left: `${startPct}%`,
                width: `${Math.max(0, Math.min(endPct - startPct, playPct - startPct))}%`,
              }}
            />
            <div
              className="absolute top-0 h-7 w-3 -translate-x-1/2 rounded-sm border-2 border-stone-600 bg-stone-500 shadow"
              style={{ left: `${startPct}%` }}
            />
            <div
              className="absolute top-0 h-7 w-3 -translate-x-1/2 rounded-sm border-2 border-stone-600 bg-stone-500 shadow"
              style={{ left: `${endPct}%` }}
            />
          </div>
        </div>

        <span className="text-text-tertiary w-10 text-xs tabular-nums">
          {formatTime(maxTime)}
        </span>
      </div>

      {hasTrimmed && (
        <div className="px-2 sm:px-0">
          <span className="text-text-tertiary text-xs">
            Trimmed: {formatTime(trimStart)} – {formatTime(trimEnd)}
          </span>
        </div>
      )}
    </div>
  );
}

const TRIM_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];

function TrimSpeedSelector({
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
          {TRIM_SPEED_OPTIONS.map((s) => (
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
