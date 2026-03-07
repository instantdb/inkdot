# Remix Snapshot: Compact SVG-like Path Data

## What it does
When creating a remix, pen strokes from the parent stream are collapsed into single compact `stroke` events with SVG-like path data (e.g., `"M10,20 L15,25 L20,30"`), dramatically reducing event count. The initial state is wrapped in `snapshot-start`/`snapshot-end` markers so consumers can render it all at once instead of incrementally.

## How it works

### New event types
- **`stroke`**: Compact pen stroke with `path` field containing SVG-like M/L commands. Rendered by parsing the path and drawing with canvas `moveTo`/`lineTo`, including an initial dot at the M point.
- **`snapshot-start` / `snapshot-end`**: Bracket the initial state of a remix. Consumers buffer events between these markers and render them all at once via `renderEventsToCanvas()`.

### Stroke collapsing (new/page.tsx)
In `loadRemix()`, the event-by-event copy is replaced with:
1. Emit `snapshot-start` (t: 0)
2. Walk trimmed events, grouping start/move/end sequences by shapeId for pen/eraser tools into single `stroke` events with path data
3. Keep shape, fill, and other event types as-is with offsets applied
4. Emit `snapshot-end` (t: 0)

### Rendering (components.tsx)
- `drawEvent()`: Parses path string, draws initial dot at M point, draws lines between consecutive L points using same color/size/lineCap as regular strokes
- `processEventIncremental()`: Handles `stroke` as a draw event; handles `snapshot-start`/`snapshot-end` by returning `needsFullRedraw: true`
- `renderEventsToCanvas()`: Tracks state for `stroke` events and skips snapshot markers

### Snapshot buffering (consumers)
- **LiveThumbnail**: Buffers events between snapshot-start/end markers, renders all at once
- **Sketch player**: Same buffering in live processEvent path
- **ReplayThumbnail**: No special handling needed — all t:0 events process in same frame tick

## What stays the same
- Live drawing still emits individual start/move/end events
- Playback of existing non-remix streams unchanged
- Geometric shapes, fills, bg events unchanged
- Shape offsets and deletions still resolved before collapsing

## Files modified
- `src/app/components.tsx`: StrokeEvent type, drawEvent(), processEventIncremental(), renderEventsToCanvas(), LiveThumbnail snapshot buffering
- `src/app/new/page.tsx`: loadRemix() stroke collapsing + snapshot markers
- `src/app/sketch/[id]/page.tsx`: sketch player snapshot buffering
