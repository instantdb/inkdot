# Orphaned Stream Detection on Gallery Page

## Problem
The gallery page (`page.tsx`) shows "LIVE" badge based only on `stream.done`. If a stream never gets properly closed (e.g. browser crash, network loss), it shows as "LIVE" forever.

## Solution
Apply the same orphaned stream detection logic from the replay page (`sketch/[id]/page.tsx`) to the `SketchCard` component:
- If `sketch.duration` exists: `maxDurationMs = duration * 1000 + 5000`
- Fallback for old sketches: `maxDurationMs = 120_000` (2 minutes)
- `isOrphaned = !stream.done && Date.now() > sketch.createdAt + maxDurationMs`
- Use `effectiveLive` instead of `!isDone` for LIVE badge and LiveThumbnail

## Changes
- `src/app/page.tsx`: Add orphan detection in `SketchCard`, update LIVE badge and LiveThumbnail conditions
- Add `duration` to the sketch type in SketchCard props
