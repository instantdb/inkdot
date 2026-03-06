# Live Sketch: Jump to Current State on Entry

## What it does
When a user clicks on a live (in-progress) sketch in the gallery, they immediately see the current state of the drawing and watch new strokes appear in real-time — just like the gallery's LiveThumbnail. A "LIVE" badge is shown on the canvas.

## Implementation
In `src/app/sketch/[id]/page.tsx` (ReplayCanvas component):

### Live drawing in stream reader
When `isLive`, events are drawn **immediately in the stream reader async loop** as they arrive — the same approach as `LiveThumbnail` in `components.tsx`. This includes:
- Pen strokes drawn incrementally
- Shape previews during cursor moves
- Full redraws for relocate/delete events
- Cursor position tracking for the overlay
- Replay state kept in sync (`state.eventIdx`, `scrubValue`) so controls work after stream ends

### Frame loop bypass
When `isLive && !done`, the frame loop returns early — no timestamp-based replay. Once the stream finishes (`done` = true), the frame loop resumes for normal replay behavior.

### LIVE badge
A "LIVE" badge is overlaid on the canvas (top-left, matching gallery style) when `isLive && !done`.

### Speed default
Speed defaults to 1x for live sketches (vs 2x for replays) so that if the stream ends and replay kicks in, timing is correct.

## Status: Complete
