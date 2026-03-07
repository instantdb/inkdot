# Unified Event Renderer

## Problem
6+ separate event rendering implementations across 4 files, each with subtle differences and bugs:
- Cursor snapping to shape start on `shape` events in new/page.tsx
- Missing offsets in some renderers
- Duplicated logic for bg/state/cursor/draw event handling

## Solution
Two shared functions in `components.tsx`:

### A) `renderEventsToCanvas(ctx, events, opts?)` — Full redraw
Replaces all "redraw from scratch" paths. Clears canvas, builds offsets/deleted, iterates events, returns final tool/color/size/cursor state.

Used by:
- `drawing.tsx` `redrawCanvas` (non-trace path) and `loadEvents`
- `sketch/[id]/page.tsx` `redrawUpTo`, initial paused render, loop restart, `ReportModal` scrub preview
- `new/page.tsx` `redrawUpTo` and loop restart in TrimPhase
- `components.tsx` `LiveThumbnail` full redraws (on relocate/delete/shape preview)

### B) `processEventIncremental(ctx, evt, allEvents, state)` — Single-event processing
Replaces all "process one new event" paths. Updates `IncrementalState` in-place, draws incrementally, returns:
- `needsFullRedraw` — caller should call `renderEventsToCanvas`
- `cursorPosition` — position update for cursor overlay
- `isDrawEvent` — whether to set `lastDrawTime`
- `stateChanged` — whether tool/color/size changed (for cursor state-only update)
- `shapePreview` — data for drawing shape preview on cursor events during shape drawing

Used by:
- `sketch/[id]/page.tsx` live stream processing and replay frame loop
- `components.tsx` `LiveThumbnail` stream processing

## Files Modified
- `src/app/components.tsx` — Added `renderEventsToCanvas`, `processEventIncremental`, and types (`RenderResult`, `IncrementalState`, `IncrementalResult`)
- `src/app/drawing.tsx` — `redrawCanvas` uses `renderEventsToCanvas` (with trace-on-canvas special path preserved), `loadEvents` uses `renderEventsToCanvas`
- `src/app/sketch/[id]/page.tsx` — `redrawUpTo`, live stream `processEvent`, replay frame loop, `ReportModal` all use shared functions
- `src/app/new/page.tsx` — `redrawUpTo` in TrimPhase uses `renderEventsToCanvas`, replay loop uses `redrawUpTo` + incremental `drawEvent` with batched redraws

## What stays per-caller
- Animation frame scheduling (requestAnimationFrame loops)
- cursorRef management (callers read returned data and assign to their ref)
- Trim/loop logic, stream reading
- Canvas caching in drawing.tsx (wraps renderEventsToCanvas)
- Shape preview rendering (caller gets preview data back, draws it via drawShapeOnCanvas)
- Trace-on-canvas rendering in drawing.tsx (practice mode)

## Design Decisions
- `processEventIncremental` calls `buildOffsets`/`buildDeletedSet` on each draw event for correctness. This matches the previous behavior. Could be optimized to maintain offsets/deleted incrementally in the future.
- `renderEventsToCanvas` always handles bg events inline (re-filling canvas) rather than pre-scanning for final bg. The trace-on-canvas path in drawing.tsx preserves the original approach of finding final bg first, drawing trace, then drawing strokes.
- The TrimPhase replay loop in new/page.tsx was NOT converted to use `processEventIncremental` because it has simpler requirements (no shape preview, no live stream). It uses batched redraw + inline drawEvent instead.

## Bugs Fixed
- Shape cursor snap: new/page.tsx `redrawUpTo` used `evt.x` instead of `evt.x2` for shape events, causing cursor to snap to shape start point
- Consistent offset/deleted handling across all renderers
- TrimPhase replay now properly batches redraws for relocate/bg/delete events (previously drew them inline)
