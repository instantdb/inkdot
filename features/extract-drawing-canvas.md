# Extract shared drawing canvas logic

## What this does
Extracts ~600 lines of duplicated drawing logic from `src/app/new/page.tsx` and `src/app/practice/page.tsx` into a shared `useDrawingCanvas` hook and `TemplatePicker` component in `src/app/drawing.tsx`.

## Implementation

### `useDrawingCanvas` hook (`src/app/drawing.tsx`)
Accepts options to customize behavior per page:
- `getTimestamp`: Returns event timestamp (practice: `() => 0`, new: elapsed ms)
- `onEvent`: Called after each event stored locally (new page writes to stream)
- `isActive`: Gate for state change events (new page checks started && !finished)
- `beforePointerDown`: Async setup before first draw (new page's `ensureStarted`)
- `writeCursorEvents`: Whether to emit cursor position events (new: true, practice: false)
- `drawTraceOnCanvas`: Whether to draw trace image on canvas (practice: true) vs HTML overlay (new: false)
- `userId` / `userSettings`: For settings persistence

Returns all drawing state, handlers, and refs needed by both pages.

### `TemplatePicker` component (`src/app/drawing.tsx`)
Shared template picker UI used by both pages.

### What stays page-specific
- **new/page.tsx**: `ensureStarted`, streaming (writer, stream creation), timer/duration, remix loading, `finishRecording`, thumbnail upload, TrimPhase, cursor event recording
- **practice/page.tsx**: `clearCanvas` button, `saveImage` (download PNG), trace opacity slider

## Line count changes
| File | Before | After |
|------|--------|-------|
| practice/page.tsx | 1115 | 217 |
| new/page.tsx | 2133 | 1203 |
| drawing.tsx | - | 1159 |
| **Total** | **3248** | **2579** |

## Key design decisions
1. Used callback refs for all option props to avoid stale closures in event handlers
2. Hook manages its own `startedRef` (set on first pointer down) to gate pointer moves
3. `changeBgColor` pushes events via `onEvent` callback rather than bypassing `writeEvent`
4. `loadEvents` encapsulates remix event loading (sets localEventsRef, rebuilds offsets/deleted, redraws canvas, updates cache)
5. Settings are read from `userSettings` prop rather than querying inside the hook, since new page uses `useSuspenseQuery` and practice uses `useQuery`

## Verification
- `npx tsc --noEmit` passes
- Practice page: all tools, colors, sizes, keyboard shortcuts, easy mode templates, trace on canvas
- New page: same plus recording, timer, streaming, remix, trim, trace as HTML overlay
