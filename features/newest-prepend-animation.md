# Newest Prepend Animation

## What it does
Adds a controlled prepend animation when new sketches arrive at the top of the live newest feeds, both on `/newest` and in the homepage `Fresh off the canvas` section.

## Implementation
- Keep a displayed snapshot of the current first-page sketches instead of rendering every live query change immediately
- Detect when incoming live data is a true prepend of new sketch ids at the beginning
- Animate those new cards in while existing cards shift downward
- If more live updates arrive during that animation, queue only the latest result and apply it after the current animation finishes so the page does not thrash

## Changes after implementation
- Added a shared `usePrependAnimatedSketches(...)` hook for snapshotting live newest queries and queueing prepend updates
- Added `AnimatedNewestSketchGrid` to combine FLIP movement for existing cards with a short enter animation for newly prepended cards
- `/newest` uses that shared hook and grid on the live first page, while paginated views still swap immediately
- The homepage `Fresh off the canvas` preview uses the same animation path, so new sketches slide in there too without thrashing when multiple new items arrive quickly
- The hook keeps live sketch data flowing through even when the visible ids stay the same, so active thumbnails and other live card updates are not frozen by the animation layer
- Initial load and the first post-mount catch-up update both sync without animation, which avoids the jarring enter motion on first paint and when navigating back to the page
