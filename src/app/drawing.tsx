'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { id } from '@instantdb/react';
import {
  type StrokeEvent,
  type DrawTool,
  type ShapeOffsets,
  BRUSH_SIZES,
  PEN_COLORS,
  BG_COLORS,
  DEFAULT_BG,
  CANVAS_W,
  CANVAS_H,
  buildOffsets,
  buildDeletedSet,
  drawEvent,
  drawShapeOnCanvas,
  floodFill,
  isLightColor,
  resetDrawState,
  renderEventsToCanvas,
  TEMPLATES,
} from './components';

// --- Types ---

export interface DrawingUserSettings {
  id: string;
  lastPenColor?: string;
  lastBgColor?: string;
  lastTool?: string;
  lastBrushSize?: number;
  penColors?: string[];
  bgColors?: string[];
}

export type UseDrawingCanvasOptions = {
  userId?: string;
  userSettings?: DrawingUserSettings;
  /** Returns timestamp for events. Default: () => 0 */
  getTimestamp?: () => number;
  /** Called after each event is stored locally */
  onEvent?: (evt: StrokeEvent) => void;
  /** Gate for writeStateChange/changeBgColor streaming. Default: () => true */
  isActive?: () => boolean;
  /** Called before processing first pointer down (e.g., ensureStarted) */
  beforePointerDown?: () => Promise<void> | void;
  /** Whether to write cursor events in pointer move. Default: false */
  writeCursorEvents?: boolean;
  /** Whether to draw trace image on canvas vs HTML overlay. Default: false */
  drawTraceOnCanvas?: boolean;
};

// --- Hook ---

export function useDrawingCanvas(opts: UseDrawingCanvasOptions) {
  const {
    userId,
    userSettings,
    getTimestamp: getTimestampProp,
    onEvent: onEventProp,
    isActive: isActiveProp,
    beforePointerDown: beforePointerDownProp,
    writeCursorEvents: writeCursorEventsProp = false,
    drawTraceOnCanvas: drawTraceOnCanvasProp = false,
  } = opts;

  // --- Derived settings ---
  const customPenColors = userSettings?.penColors;
  const customBgColors = userSettings?.bgColors;
  const penPalette =
    customPenColors && customPenColors.length > 0
      ? customPenColors
      : PEN_COLORS;
  const bgPalette =
    customBgColors && customBgColors.length > 0 ? customBgColors : BG_COLORS;
  const penColor = userSettings?.lastPenColor || PEN_COLORS[0];
  const bgColor = userSettings?.lastBgColor || DEFAULT_BG;
  const tool = (userSettings?.lastTool as DrawTool) || 'pen';
  const brushSize = userSettings?.lastBrushSize || BRUSH_SIZES[1];

  const generatedIdRef = useRef(id());
  const settingsId = userSettings?.id || generatedIdRef.current;

  const saveSettings = useCallback(
    (updates: Record<string, unknown>) => {
      if (!userId) return;
      const tx = userSettings
        ? db.tx.userSettings[settingsId].update(updates)
        : db.tx.userSettings[settingsId]
            .update(updates)
            .link({ owner: userId });
      db.transact(tx);
    },
    [settingsId, userSettings, userId],
  );

  // --- Canvas refs ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const localEventsRef = useRef<StrokeEvent[]>([]);
  const startedRef = useRef(false);

  // --- Drawing state ---
  const [shapeFilled, setShapeFilled] = useState(false);
  const [traceUrl, setTraceUrl] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(true);
  const [traceOpacity, setTraceOpacity] = useState(0.3);
  const [showEasyMode, setShowEasyMode] = useState(false);
  const traceImgRef = useRef<HTMLImageElement | null>(null);
  const traceInputRef = useRef<HTMLInputElement>(null);

  // --- Sync values to refs (avoid stale closures) ---
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const shapeFilledRef = useRef(shapeFilled);
  shapeFilledRef.current = shapeFilled;
  const bgColorRef = useRef(bgColor);
  bgColorRef.current = bgColor;
  const penPaletteRef = useRef(penPalette);
  penPaletteRef.current = penPalette;
  const bgPaletteRef = useRef(bgPalette);
  bgPaletteRef.current = bgPalette;

  // --- Shape/move/eraser refs ---
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentShapeIdRef = useRef<string | null>(null);
  const shapeOffsetsRef = useRef<ShapeOffsets>(new Map());
  const moveSelectedIdsRef = useRef<Set<string>>(new Set());
  const moveDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const moveSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const moveSelectCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const moveModeRef = useRef<'drag' | 'select' | null>(null);
  const moveHoveredRef = useRef<string | null>(null);
  const deletedShapesRef = useRef<Set<string>>(new Set());
  const canvasCacheRef = useRef<ImageData | null>(null);
  const canvasCacheDirtyRef = useRef(true);

  // --- Trace refs ---
  const showTraceRef = useRef(showTrace);
  showTraceRef.current = showTrace;
  const traceOpacityRef = useRef(traceOpacity);
  traceOpacityRef.current = traceOpacity;

  // --- Option refs (always current) ---
  const getTimestampRef = useRef(getTimestampProp || (() => 0));
  getTimestampRef.current = getTimestampProp || (() => 0);
  const onEventRef = useRef(onEventProp);
  onEventRef.current = onEventProp;
  const isActiveRef = useRef(isActiveProp || (() => true));
  isActiveRef.current = isActiveProp || (() => true);
  const beforePointerDownRef = useRef(beforePointerDownProp);
  beforePointerDownRef.current = beforePointerDownProp;
  const writeCursorEventsRef = useRef(writeCursorEventsProp);
  writeCursorEventsRef.current = writeCursorEventsProp;
  const drawTraceOnCanvasRef = useRef(drawTraceOnCanvasProp);
  drawTraceOnCanvasRef.current = drawTraceOnCanvasProp;

  // --- Hit testing ---

  type ShapeInfo = {
    id: string;
    points: { x: number; y: number }[];
    size: number;
  };

  const parseStrokePoints = useCallback(
    (path: string, dx: number, dy: number): { x: number; y: number }[] => {
      const points: { x: number; y: number }[] = [];

      for (const command of path.split(' ')) {
        if (!command) continue;
        const prefix = command[0];
        if (prefix !== 'M' && prefix !== 'L') continue;
        const [rawX, rawY] = command
          .slice(1)
          .split(',')
          .map((value) => Number(value));
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;
        points.push({ x: rawX + dx, y: rawY + dy });
      }

      return points;
    },
    [],
  );

  const getShapes = useCallback((): ShapeInfo[] => {
    const events = localEventsRef.current;
    const offsets = shapeOffsetsRef.current;
    const shapes: ShapeInfo[] = [];
    const shapeMap = new Map<string, ShapeInfo>();

    for (const evt of events) {
      if (!evt.shapeId) continue;
      const o = offsets.get(evt.shapeId) || { dx: 0, dy: 0 };
      if (evt.type === 'start') {
        const s: ShapeInfo = {
          id: evt.shapeId,
          points: [{ x: evt.x + o.dx, y: evt.y + o.dy }],
          size: evt.size || 4,
        };
        shapeMap.set(evt.shapeId, s);
        shapes.push(s);
      } else if (evt.type === 'move') {
        const s = shapeMap.get(evt.shapeId);
        if (s) s.points.push({ x: evt.x + o.dx, y: evt.y + o.dy });
      } else if (evt.type === 'end') {
        const s = shapeMap.get(evt.shapeId);
        if (s) s.points.push({ x: evt.x + o.dx, y: evt.y + o.dy });
      } else if (evt.type === 'shape') {
        const x1 = evt.x + o.dx,
          y1 = evt.y + o.dy;
        const x2 = (evt.x2 ?? evt.x) + o.dx,
          y2 = (evt.y2 ?? evt.y) + o.dy;
        const pts: { x: number; y: number }[] = [];
        if (evt.shape === 'line') {
          for (let i = 0; i <= 10; i++) {
            pts.push({
              x: x1 + (x2 - x1) * (i / 10),
              y: y1 + (y2 - y1) * (i / 10),
            });
          }
        } else if (evt.shape === 'rect') {
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            pts.push({ x: x1 + (x2 - x1) * t, y: y1 });
            pts.push({ x: x1 + (x2 - x1) * t, y: y2 });
            pts.push({ x: x1, y: y1 + (y2 - y1) * t });
            pts.push({ x: x2, y: y1 + (y2 - y1) * t });
          }
        } else if (evt.shape === 'circle') {
          const cx = (x1 + x2) / 2,
            cy = (y1 + y2) / 2;
          const rx = Math.abs(x2 - x1) / 2,
            ry = Math.abs(y2 - y1) / 2;
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
          }
        }
        const s: ShapeInfo = {
          id: evt.shapeId,
          points: pts,
          size: evt.size || 4,
        };
        shapes.push(s);
      } else if (evt.type === 'fill') {
        const s: ShapeInfo = {
          id: evt.shapeId,
          points: [{ x: evt.x + o.dx, y: evt.y + o.dy }],
          size: 20,
        };
        shapes.push(s);
      } else if (evt.type === 'stroke' && evt.path) {
        const points = parseStrokePoints(evt.path, o.dx, o.dy);
        if (points.length === 0) continue;
        const s: ShapeInfo = {
          id: evt.shapeId,
          points,
          size: evt.size || 4,
        };
        shapes.push(s);
      }
    }

    const deleted = deletedShapesRef.current;
    return shapes.filter((shape) => !deleted.has(shape.id));
  }, [parseStrokePoints]);

  const findShapeAt = useCallback(
    (px: number, py: number): string | null => {
      const HIT_RADIUS = 20;
      const shapes = getShapes();

      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        const hitR = Math.max(HIT_RADIUS, s.size / 2 + 4);
        if (
          s.points.some(
            (p) => Math.abs(p.x - px) < hitR && Math.abs(p.y - py) < hitR,
          )
        ) {
          return s.id;
        }
      }
      return null;
    },
    [getShapes],
  );

  const findShapesInRect = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
    ): string[] => {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);

      return getShapes()
        .filter((shape) =>
          shape.points.some(
            (point) =>
              point.x >= minX &&
              point.x <= maxX &&
              point.y >= minY &&
              point.y <= maxY,
          ),
        )
        .map((shape) => shape.id);
    },
    [getShapes],
  );

  // --- Selection highlight ---

  const drawHighlights = useCallback(
    (targetIds: Iterable<string>) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const events = localEventsRef.current;
      const offsets = shapeOffsetsRef.current;

      const bgLight = isLightColor(bgColorRef.current);
      const ringColor = bgLight ? '#3b82f6' : '#60a5fa';
      const pad = 3;

      for (const targetId of targetIds) {
        ctx.save();
        let lx = 0,
          ly = 0;
        for (const evt of events) {
          if (evt.shapeId !== targetId) continue;
          if (evt.type === 'relocate') continue;
          const o = offsets.get(targetId) || { dx: 0, dy: 0 };
          const x = evt.x + o.dx;
          const y = evt.y + o.dy;
          const size = evt.size || 4;

          if (evt.type === 'start') {
            lx = x;
            ly = y;
            ctx.beginPath();
            ctx.arc(x, y, (size + pad) / 2, 0, Math.PI * 2);
            ctx.fillStyle = ringColor;
            ctx.fill();
          } else if (evt.type === 'move') {
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = size + pad * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            lx = x;
            ly = y;
          } else if (evt.type === 'end') {
            lx = x;
            ly = y;
          } else if (evt.type === 'shape') {
            const x2 = (evt.x2 ?? evt.x) + o.dx;
            const y2 = (evt.y2 ?? evt.y) + o.dy;
            drawShapeOnCanvas(
              ctx,
              evt.shape || 'rect',
              x,
              y,
              x2,
              y2,
              ringColor,
              size + pad * 2,
              1,
            );
          } else if (evt.type === 'fill') {
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (evt.type === 'stroke' && evt.path) {
            const points = parseStrokePoints(evt.path, o.dx, o.dy);
            if (points.length === 0) continue;
            const lineWidth = size + pad * 2;

            ctx.beginPath();
            ctx.arc(points[0].x, points[0].y, lineWidth / 2, 0, Math.PI * 2);
            ctx.fillStyle = ringColor;
            ctx.fill();

            if (points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(points[0].x, points[0].y);
              for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
              }
              ctx.strokeStyle = ringColor;
              ctx.lineWidth = lineWidth;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      resetDrawState();
      for (const targetId of targetIds) {
        for (const evt of events) {
          if (evt.shapeId !== targetId) continue;
          if (evt.type === 'relocate') continue;
          drawEvent(ctx, evt, 1, offsets);
        }
      }
    },
    [parseStrokePoints],
  );

  // --- Init canvas ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Redraw ---

  const redrawCanvas = useCallback(
    (_initialBg: string, skipCache?: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (
        !skipCache &&
        !canvasCacheDirtyRef.current &&
        canvasCacheRef.current
      ) {
        ctx.putImageData(canvasCacheRef.current, 0, 0);
        return;
      }

      // For trace-on-canvas (practice mode), we need to draw trace between
      // bg and strokes. First find the final bg, fill it, draw trace, then
      // draw strokes using the shared renderer with events that skip bg.
      const hasTrace =
        drawTraceOnCanvasRef.current &&
        showTraceRef.current &&
        traceImgRef.current;

      // Determine final bg color so it goes behind all strokes
      let currentBg = _initialBg;
      for (const evt of localEventsRef.current) {
        if (evt.type === 'bg') currentBg = evt.color || DEFAULT_BG;
      }
      ctx.fillStyle = currentBg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      if (hasTrace) {
        // Draw trace image under strokes
        const img = traceImgRef.current!;
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (CANVAS_W - w) / 2;
        const y = (CANVAS_H - h) / 2;
        ctx.save();
        ctx.globalAlpha = traceOpacityRef.current;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
      }

      // Draw strokes (drawEvent skips bg events)
      resetDrawState();
      const offsets = buildOffsets(localEventsRef.current);
      const deleted = buildDeletedSet(localEventsRef.current);
      for (const evt of localEventsRef.current) {
        drawEvent(ctx, evt, 1, offsets, deleted);
      }

      canvasCacheRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      canvasCacheDirtyRef.current = false;
    },
    [],
  );

  const redrawMoveOverlay = useCallback(() => {
    redrawCanvas(bgColorRef.current);

    const selectedIds = Array.from(moveSelectedIdsRef.current);
    const highlightIds =
      moveHoveredRef.current && !selectedIds.includes(moveHoveredRef.current)
        ? [...selectedIds, moveHoveredRef.current]
        : selectedIds;

    if (highlightIds.length > 0) {
      drawHighlights(highlightIds);
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const selectionStart = moveSelectStartRef.current;
    const selectionCurrent = moveSelectCurrentRef.current;
    if (!ctx || !selectionStart || !selectionCurrent) return;

    const x = Math.min(selectionStart.x, selectionCurrent.x);
    const y = Math.min(selectionStart.y, selectionCurrent.y);
    const width = Math.abs(selectionCurrent.x - selectionStart.x);
    const height = Math.abs(selectionCurrent.y - selectionStart.y);

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.strokeRect(x, y, width, height);
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }, [drawHighlights, redrawCanvas]);

  // --- Trace image loading (canvas mode only) ---

  useEffect(() => {
    if (!drawTraceOnCanvasProp) return;
    if (!traceUrl) {
      traceImgRef.current = null;
      canvasCacheDirtyRef.current = true;
      redrawCanvas(bgColorRef.current, true);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      traceImgRef.current = img;
      canvasCacheDirtyRef.current = true;
      redrawCanvas(bgColorRef.current, true);
    };
    img.src = traceUrl;
    return () => {
      img.onload = null;
    };
  }, [traceUrl, redrawCanvas, drawTraceOnCanvasProp]);

  // Redraw when trace visibility/opacity changes (canvas mode only)
  useEffect(() => {
    if (!drawTraceOnCanvasProp) return;
    canvasCacheDirtyRef.current = true;
    redrawCanvas(bgColorRef.current, true);
  }, [showTrace, traceOpacity, redrawCanvas, drawTraceOnCanvasProp]);

  // --- Event writing ---

  const writeEvent = useCallback((evt: StrokeEvent) => {
    localEventsRef.current.push(evt);
    if (evt.type !== 'cursor' && evt.type !== 'state' && evt.type !== 'click') {
      canvasCacheDirtyRef.current = true;
    }
    onEventRef.current?.(evt);
  }, []);

  const writeStateChange = useCallback(
    (updates: { tool?: string; color?: string; size?: number }) => {
      if (!isActiveRef.current()) return;
      const t = getTimestampRef.current();
      const evt: StrokeEvent = { t, x: 0, y: 0, type: 'state', ...updates };
      writeEvent(evt);
    },
    [writeEvent],
  );

  // --- Tool/color/size handlers ---

  const changeTool = useCallback(
    (t: DrawTool) => {
      const prev = toolRef.current;
      if ((prev === 'move' || prev === 'eraser') && t !== prev) {
        moveSelectedIdsRef.current = new Set();
        moveDragStartRef.current = null;
        moveSelectStartRef.current = null;
        moveSelectCurrentRef.current = null;
        moveModeRef.current = null;
        moveHoveredRef.current = null;
        redrawCanvas(bgColorRef.current);
        if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      }
      if ((t === 'move' || t === 'eraser') && canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
      saveSettings({ lastTool: t });
      writeStateChange({ tool: t });
    },
    [writeStateChange, redrawCanvas, saveSettings],
  );

  const changePenColor = useCallback(
    (c: string) => {
      saveSettings({ lastPenColor: c });
      writeStateChange({ color: c });
    },
    [writeStateChange, saveSettings],
  );

  const changeBrushSize = useCallback(
    (s: number) => {
      saveSettings({ lastBrushSize: s });
      writeStateChange({ size: s });
    },
    [writeStateChange, saveSettings],
  );

  const changeBgColor = useCallback(
    (newBg: string) => {
      saveSettings({ lastBgColor: newBg });
      const bgEvt: StrokeEvent = {
        t: getTimestampRef.current(),
        x: 0,
        y: 0,
        type: 'bg',
        color: newBg,
      };
      localEventsRef.current.push(bgEvt);
      canvasCacheDirtyRef.current = true;
      redrawCanvas(DEFAULT_BG);
      onEventRef.current?.(bgEvt);
    },
    [redrawCanvas, saveSettings],
  );

  // --- Canvas operations ---

  const clearCanvas = useCallback(() => {
    localEventsRef.current = [];
    shapeOffsetsRef.current = new Map();
    deletedShapesRef.current = new Set();
    canvasCacheDirtyRef.current = true;
    canvasCacheRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bgColorRef.current;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const loadEvents = useCallback((events: StrokeEvent[]) => {
    localEventsRef.current = [...events];
    shapeOffsetsRef.current = buildOffsets(events);
    deletedShapesRef.current = buildDeletedSet(events);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderEventsToCanvas(ctx, events);

    canvasCacheRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    canvasCacheDirtyRef.current = false;
  }, []);

  // --- Pointer handlers ---

  const getCanvasPos = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (beforePointerDownRef.current) {
        await beforePointerDownRef.current();
      }
      startedRef.current = true;

      const pos = getCanvasPos(e);
      const t = getTimestampRef.current();
      writeEvent({ t, ...pos, type: 'click' });
      const currentTool = toolRef.current;

      // Move tool
      if (currentTool === 'move') {
        const hitId = findShapeAt(pos.x, pos.y);
        if (hitId) {
          if (!moveSelectedIdsRef.current.has(hitId)) {
            moveSelectedIdsRef.current = new Set([hitId]);
          }
          moveDragStartRef.current = pos;
          moveSelectStartRef.current = null;
          moveSelectCurrentRef.current = null;
          moveModeRef.current = 'drag';
          isDrawingRef.current = true;
          redrawMoveOverlay();
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        } else {
          moveSelectedIdsRef.current = new Set();
          moveDragStartRef.current = null;
          moveSelectStartRef.current = pos;
          moveSelectCurrentRef.current = pos;
          moveModeRef.current = 'select';
          moveHoveredRef.current = null;
          isDrawingRef.current = true;
          redrawMoveOverlay();
        }
        return;
      }

      // Eraser
      if (currentTool === 'eraser') {
        const hitId = findShapeAt(pos.x, pos.y);
        if (hitId) {
          deletedShapesRef.current.add(hitId);
          writeEvent({ t, x: 0, y: 0, type: 'delete', shapeId: hitId });
          canvasCacheDirtyRef.current = true;
          redrawCanvas(bgColorRef.current);
        }
        return;
      }

      // Fill
      if (currentTool === 'fill') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const sid = crypto.randomUUID();
        const fillEvt: StrokeEvent = {
          t,
          ...pos,
          type: 'fill',
          color: penColorRef.current,
          shapeId: sid,
        };
        floodFill(
          ctx,
          Math.round(pos.x),
          Math.round(pos.y),
          penColorRef.current,
        );
        writeEvent(fillEvt);
        return;
      }

      // Shape tools
      if (
        currentTool === 'rect' ||
        currentTool === 'circle' ||
        currentTool === 'line'
      ) {
        const sid = crypto.randomUUID();
        currentShapeIdRef.current = sid;
        isDrawingRef.current = true;
        shapeStartRef.current = pos;
        writeEvent({
          t,
          ...pos,
          type: 'start',
          tool: currentTool,
          color: penColorRef.current,
          size: brushSizeRef.current,
          shapeId: sid,
        });
        return;
      }

      // Pen (default)
      const sid = crypto.randomUUID();
      currentShapeIdRef.current = sid;
      isDrawingRef.current = true;
      const evt: StrokeEvent = {
        t,
        ...pos,
        type: 'start',
        color: penColorRef.current,
        tool: 'pen',
        size: brushSizeRef.current,
        shapeId: sid,
      };
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawEvent(ctx, evt, 1, shapeOffsetsRef.current);
      writeEvent(evt);
    },
    [findShapeAt, getCanvasPos, redrawCanvas, redrawMoveOverlay, writeEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!startedRef.current) return;
      const pos = getCanvasPos(e);
      const t = getTimestampRef.current();
      const currentTool = toolRef.current;
      const shouldWriteCursor = writeCursorEventsRef.current;

      // Eraser hover
      if (currentTool === 'eraser') {
        const hitId = findShapeAt(pos.x, pos.y);
        if (hitId !== moveHoveredRef.current) {
          moveHoveredRef.current = hitId;
          redrawMoveOverlay();
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.style.cursor = hitId
              ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='white' stroke='%23ef4444' stroke-width='2'/%3E%3Cline x1='8' y1='8' x2='16' y2='16' stroke='%23ef4444' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='16' y1='8' x2='8' y2='16' stroke='%23ef4444' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, pointer`
              : 'crosshair';
          }
        }
        if (shouldWriteCursor) writeEvent({ t, ...pos, type: 'cursor' });
        return;
      }

      // Move tool
      if (currentTool === 'move') {
        if (isDrawingRef.current && moveModeRef.current === 'drag') {
          const selectedIds = Array.from(moveSelectedIdsRef.current);
          if (selectedIds.length === 0 || !moveDragStartRef.current) return;
          const dx = pos.x - moveDragStartRef.current.x;
          const dy = pos.y - moveDragStartRef.current.y;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          for (const sid of selectedIds) {
            const orig = shapeOffsetsRef.current.get(sid) || { dx: 0, dy: 0 };
            shapeOffsetsRef.current.set(sid, {
              dx: orig.dx + dx,
              dy: orig.dy + dy,
            });
          }
          moveDragStartRef.current = pos;
          redrawMoveOverlay();
          if (shouldWriteCursor) writeEvent({ t, ...pos, type: 'cursor' });
          for (const sid of selectedIds) {
            writeEvent({
              t,
              x: dx,
              y: dy,
              type: 'relocate',
              shapeId: sid,
            });
          }
          return;
        }
        if (isDrawingRef.current && moveModeRef.current === 'select') {
          moveSelectCurrentRef.current = pos;
          redrawMoveOverlay();
          if (shouldWriteCursor) writeEvent({ t, ...pos, type: 'cursor' });
          return;
        }
        const hitId = findShapeAt(pos.x, pos.y);
        if (hitId !== moveHoveredRef.current) {
          moveHoveredRef.current = hitId;
          redrawMoveOverlay();
          const canvas = canvasRef.current;
          if (canvas) canvas.style.cursor = hitId ? 'grab' : 'default';
        }
        if (shouldWriteCursor) writeEvent({ t, ...pos, type: 'cursor' });
        return;
      }

      // Drawing
      if (isDrawingRef.current) {
        // Shape preview
        if (
          (currentTool === 'rect' ||
            currentTool === 'circle' ||
            currentTool === 'line') &&
          shapeStartRef.current
        ) {
          redrawCanvas(bgColorRef.current);
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const start = shapeStartRef.current;
          drawShapeOnCanvas(
            ctx,
            currentTool,
            start.x,
            start.y,
            pos.x,
            pos.y,
            penColorRef.current,
            brushSizeRef.current,
            1,
            shapeFilledRef.current && currentTool !== 'line',
          );
          if (shouldWriteCursor) writeEvent({ t, ...pos, type: 'cursor' });
          return;
        }

        // Pen stroke
        const evt: StrokeEvent = {
          t,
          ...pos,
          type: 'move',
          color: penColorRef.current,
          tool: 'pen',
          size: brushSizeRef.current,
          shapeId: currentShapeIdRef.current || undefined,
        };
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) drawEvent(ctx, evt, 1);
        writeEvent(evt);
      } else if (shouldWriteCursor) {
        writeEvent({ t, ...pos, type: 'cursor' });
      }
    },
    [findShapeAt, getCanvasPos, redrawCanvas, redrawMoveOverlay, writeEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const currentTool = toolRef.current;
      const pos = getCanvasPos(e);
      const t = getTimestampRef.current();

      // Move tool
      if (currentTool === 'move') {
        if (moveModeRef.current === 'drag' && moveDragStartRef.current) {
          const selectedIds = Array.from(moveSelectedIdsRef.current);
          const dx = pos.x - moveDragStartRef.current.x;
          const dy = pos.y - moveDragStartRef.current.y;
          if (
            (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) &&
            selectedIds.length > 0
          ) {
            for (const sid of selectedIds) {
              const orig = shapeOffsetsRef.current.get(sid) || {
                dx: 0,
                dy: 0,
              };
              shapeOffsetsRef.current.set(sid, {
                dx: orig.dx + dx,
                dy: orig.dy + dy,
              });
              writeEvent({
                t,
                x: dx,
                y: dy,
                type: 'relocate',
                shapeId: sid,
              });
            }
          }
        } else if (
          moveModeRef.current === 'select' &&
          moveSelectStartRef.current &&
          moveSelectCurrentRef.current
        ) {
          moveSelectedIdsRef.current = new Set(
            findShapesInRect(
              moveSelectStartRef.current,
              moveSelectCurrentRef.current,
            ),
          );
        }
        moveDragStartRef.current = null;
        moveSelectStartRef.current = null;
        moveSelectCurrentRef.current = null;
        moveModeRef.current = null;
        isDrawingRef.current = false;
        const hoverHit = findShapeAt(pos.x, pos.y);
        moveHoveredRef.current = hoverHit;
        redrawMoveOverlay();
        if (canvasRef.current) {
          canvasRef.current.style.cursor = hoverHit ? 'grab' : 'default';
        }
        return;
      }

      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      // Shape finalize
      if (
        (currentTool === 'rect' ||
          currentTool === 'circle' ||
          currentTool === 'line') &&
        shapeStartRef.current
      ) {
        const start = shapeStartRef.current;
        shapeStartRef.current = null;
        const isFilled = shapeFilledRef.current && currentTool !== 'line';
        const shapeEvt: StrokeEvent = {
          t,
          x: start.x,
          y: start.y,
          x2: pos.x,
          y2: pos.y,
          type: 'shape',
          shape: currentTool,
          color: penColorRef.current,
          size: brushSizeRef.current,
          shapeId: currentShapeIdRef.current || undefined,
          filled: isFilled || undefined,
        };
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          redrawCanvas(bgColorRef.current);
          drawShapeOnCanvas(
            ctx,
            currentTool,
            start.x,
            start.y,
            pos.x,
            pos.y,
            penColorRef.current,
            brushSizeRef.current,
            1,
            isFilled,
          );
        }
        writeEvent(shapeEvt);
        currentShapeIdRef.current = null;
        return;
      }

      // Pen end
      writeEvent({
        t,
        ...pos,
        type: 'end',
        shapeId: currentShapeIdRef.current || undefined,
      });
      currentShapeIdRef.current = null;
    },
    [
      findShapeAt,
      findShapesInRect,
      getCanvasPos,
      redrawCanvas,
      redrawMoveOverlay,
      writeEvent,
    ],
  );

  // --- Trace file upload handler ---

  const handleTraceFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setTraceUrl(url);
      setShowTrace(true);
      setShowEasyMode(false);
      e.target.value = '';
    },
    [],
  );

  const selectTrace = useCallback(
    (url: string | null) => {
      if (url === null) {
        if (traceUrl?.startsWith('blob:')) URL.revokeObjectURL(traceUrl);
        setTraceUrl(null);
      } else {
        setTraceUrl(url);
        setShowTrace(true);
      }
    },
    [traceUrl],
  );

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const shiftSymbols: Record<string, number> = {
        '!': 1,
        '@': 2,
        '#': 3,
        $: 4,
        '%': 5,
        '^': 6,
        '&': 7,
        '*': 8,
        '(': 9,
      };
      if (e.shiftKey && shiftSymbols[e.key]) {
        const bg = bgPaletteRef.current;
        const idx = shiftSymbols[e.key];
        if (idx <= bg.length) changeBgColor(bg[idx - 1]);
        return;
      }
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        if (e.shiftKey) {
          const bg = bgPaletteRef.current;
          if (num <= bg.length) changeBgColor(bg[num - 1]);
        } else {
          const pen = penPaletteRef.current;
          if (num <= pen.length) changePenColor(pen[num - 1]);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          if (isDrawingRef.current && shapeStartRef.current) {
            isDrawingRef.current = false;
            shapeStartRef.current = null;
            currentShapeIdRef.current = null;
            redrawCanvas(bgColorRef.current);
          } else if (toolRef.current === 'move') {
            moveSelectedIdsRef.current = new Set();
            moveDragStartRef.current = null;
            moveSelectStartRef.current = null;
            moveSelectCurrentRef.current = null;
            moveModeRef.current = null;
            moveHoveredRef.current = null;
            redrawCanvas(bgColorRef.current);
          }
          break;
        case 'v':
          changeTool('move');
          break;
        case 'n':
          changeTool('pen');
          break;
        case 'e':
          changeTool('eraser');
          break;
        case 'm':
          changeTool('rect');
          break;
        case 'l':
          changeTool('circle');
          break;
        case '\\':
          changeTool('line');
          break;
        case 'g':
          changeTool('fill');
          break;
        case 'f':
          setShapeFilled((f) => !f);
          break;
        case 'q':
          changeBrushSize(BRUSH_SIZES[0]);
          break;
        case 'w':
          changeBrushSize(BRUSH_SIZES[1]);
          break;
        case 'r':
          changeBrushSize(BRUSH_SIZES[2]);
          break;
        case 't':
          changeBrushSize(BRUSH_SIZES[3]);
          break;
        case '[': {
          const idx = BRUSH_SIZES.indexOf(brushSizeRef.current);
          if (idx > 0) changeBrushSize(BRUSH_SIZES[idx - 1]);
          break;
        }
        case ']': {
          const idx = BRUSH_SIZES.indexOf(brushSizeRef.current);
          if (idx < BRUSH_SIZES.length - 1)
            changeBrushSize(BRUSH_SIZES[idx + 1]);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    changeTool,
    changeBrushSize,
    changePenColor,
    changeBgColor,
    redrawCanvas,
  ]);

  return {
    // Canvas
    canvasRef,

    // Settings-derived state
    tool,
    penColor,
    bgColor,
    brushSize,
    shapeFilled,
    setShapeFilled,
    penPalette,
    bgPalette,

    // Handlers
    changeTool,
    changePenColor,
    changeBrushSize,
    changeBgColor,
    saveSettings,
    writeStateChange,

    // Pointer handlers
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,

    // Canvas operations
    redrawCanvas,
    clearCanvas,
    loadEvents,

    // Trace state
    traceUrl,
    setTraceUrl,
    showTrace,
    setShowTrace,
    traceOpacity,
    setTraceOpacity,
    showEasyMode,
    setShowEasyMode,
    traceInputRef,
    handleTraceFileChange,
    selectTrace,

    // Refs for external access
    localEventsRef,
  };
}

// --- Template Picker Component ---

export function TemplatePicker({
  traceUrl,
  onSelectTrace,
  onClose,
  onUploadClick,
}: {
  traceUrl: string | null;
  onSelectTrace: (url: string | null) => void;
  onClose: () => void;
  onUploadClick: () => void;
}) {
  return (
    <div className="border-border bg-surface-secondary mx-2 rounded-xl border p-3 sm:mx-0 sm:p-4">
      <div className="mb-2 flex items-center justify-between sm:mb-3">
        <span className="text-text-secondary text-xs font-medium sm:text-sm">
          Pick a template to trace over
        </span>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-secondary cursor-pointer p-1 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6 sm:gap-2">
        <button
          onClick={() => onSelectTrace(null)}
          className={`cursor-pointer rounded-lg border-2 text-xs font-medium transition-all ${
            !traceUrl
              ? 'border-accent text-accent shadow-md'
              : 'border-border-strong text-text-tertiary hover:border-border-strong hover:text-text-secondary border-dashed'
          }`}
        >
          <div className="flex aspect-[4/3] items-center justify-center">
            None
          </div>
        </button>
        <button
          onClick={onUploadClick}
          className={`cursor-pointer rounded-lg border-2 transition-all ${
            traceUrl?.startsWith('blob:')
              ? 'border-accent text-accent shadow-md'
              : 'border-border-strong text-text-tertiary hover:border-border-strong hover:text-text-secondary border-dashed'
          }`}
        >
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-0.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[9px] font-medium">Upload</span>
          </div>
        </button>
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onSelectTrace(tpl.src)}
            className={`group cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
              traceUrl === tpl.src
                ? 'border-accent shadow-md'
                : 'border-border hover:border-border-strong'
            }`}
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={tpl.src}
                alt={tpl.name}
                className="bg-surface h-full w-full object-contain p-0.5 sm:p-1"
              />
              <span className="text-text-secondary absolute right-0 bottom-0 left-0 bg-white/80 px-1 py-0.5 text-[8px] font-medium sm:px-2 sm:py-1 sm:text-[10px]">
                {tpl.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
