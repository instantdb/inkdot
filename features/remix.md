# Remix Feature

## What it does
Users can "remix" any finished sketch — starting a new sketch with the parent's final drawing already on the canvas. The new sketch links back to the original.

## How it works

### Schema
- Self-referencing link `sketchRemix` on `sketches`: forward `remixOf` (has-one), reverse `remixes` (has-many)

### Sketch Detail Page
- "Remix" button next to "New sketch" → navigates to `/new?remix={sketchId}`

### New Sketch Page (`/new?remix={id}`)
1. Read `remix` query param
2. Fetch parent sketch + stream
3. Read all events from parent stream via `db.streams.createReadStream()`
4. **Resolve** parent events into clean minimal set:
   - Build offsets and deleted set
   - Filter out: deleted shapes, relocate, cursor, state, click events
   - Bake offsets into coordinates (apply dx/dy to x/y)
   - Keep only the last bg event
   - Result: flat list of resolved shape events
5. Draw resolved events onto canvas
6. Store in `localEventsRef` as base state
7. When recording starts (`ensureStarted`):
   - Write resolved events to new stream as prefix (all at t=0)
   - Link `remixOf` on the new sketch
8. Show "Remix of @handle's sketch" indicator

### Trim-aware remixing
When loading a parent sketch for remix, we respect its `trimEnd` but include ALL events from the start:
- Filter raw events to only include those up to `trimEnd` (not from `trimStart`)
- `trimStart` only controls playback start time — shapes drawn before it are still visible on canvas
- The background color search scans all events up to `trimEnd` to find the correct bg
- Resolved shapes come from the full range `[0, trimEnd]`, so the remix starts from the parent's complete visual state at trim end

### Resolving prevents unbounded growth
A remix-of-a-remix doesn't grow because the parent stream already contains its resolved ancestors. We just resolve the full set once.

### Gallery
- Include `remixOf: { author: {} }` in gallery query
- Show small remix icon on SketchCard if sketch has remixOf

### Auto-play Remixes
Users can auto-play through all remixes of a sketch sequentially.

**URL scheme:**
- `?autoplay=self` — on the parent sketch, plays it then chains to first remix
- `?autoplay={parentId}` — on a remix, plays it then advances to next sibling

**Flow:**
1. RemixesSection shows "Auto-play all" button on any sketch with remixes
2. Clicking it navigates to `?autoplay=self`, which replays the parent sketch
3. When replay reaches the end, `onAutoplayEnd` fires immediately
4. SketchPage queries remixes/siblings via `autoplayData` and navigates to the next one
5. Each remix page continues the chain with `?autoplay={parentId}`
6. Chain ends when the last remix finishes (no more siblings)

**UI indicators:**
- "Auto-play" badge in the replay controls when active
- "Auto-playing" state on the button in RemixesSection
- Clicking "Auto-playing" stops autoplay (removes param)

### Play All (Lineage)
Users can play through the full remix history (ancestors + current sketch) without navigating away.

**How it works:**
- RemixHistory has a "Play all" button
- Clicking it builds a chain of `{sketchId, streamId}` from visible ancestors + current sketch
- SketchPage manages a `lineagePlaylist` state and `lineageIdx`
- When active, ReplayCanvas receives the active item's sketchId/streamId via `key` (forces remount)
- On each replay end, `handleReachedEnd` advances `lineageIdx`
- When the last item finishes, the playlist clears
- A "Playing X of Y" indicator with "Stop" button appears during playback
- The active ancestor thumbnail gets a highlighted border (border-2 border-slate-700)

## Files modified
1. `src/instant.schema.ts` — sketchRemix link
2. `src/app/sketch/[id]/page.tsx` — Remix button, RemixesSection with auto-play, autoplay state management
3. `src/app/new/page.tsx` — remix loading, canvas pre-fill, stream prefix
4. `src/app/components.tsx` — remix indicator on SketchCard
5. `src/app/page.tsx` — remixOf in gallery query
6. `src/app/user/[handle]/page.tsx` — remixOf in user profile query
