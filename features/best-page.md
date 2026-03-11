# Best Page

## What it does
Adds a real `/best` route that plays the highest-scoring visible sketch in place and keeps following the live top-scoring sketch without interrupting the current playback mid-run.

## Implementation
- Add a `/best` page that resolves the current top visible sketch and renders the existing sketch player in place
- Fetch only the current best sketch with a suspense query ordered by score descending
- Filter flagged sketches in the query itself, keeping authored flagged sketches visible to their owner
- Queue the next best sketch in page state so playback only switches after the current sketch finishes

## Changes after implementation
- Added a real `/best` route that keeps playback on `/best` instead of redirecting to `/sketch/[id]`
- Added a `best` autoplay mode to the sketch page that accepts the queued next-best sketch from `/best`
- Switched `/best` to a `useSuspenseQuery` that fetches only the current top visible sketch
- Queued the next best sketch in `/best` state so playback only switches after the current sketch reaches the end while playback is active
- If the player is paused or already finished when the best sketch changes, `/best` now swaps immediately instead of waiting for autoplay end
- Added an explainer banner on `/best` so the auto-switching behavior is visible to the user
- `/best` now uses the same shared browse-page header style as `/top` and `/newest`, with its explainer folded into the same header card
- Removed the homepage "Most loved" see-all link

## Next-Up & Previous Best (follow-up)
- When playback ends and a new best is queued, a Netflix-style "Up Next" overlay appears at bottom-right of the canvas with a 5-second countdown ring, thumbnail, author handle, "Play now" button, and dismiss X
- If countdown reaches 0 or "Play now" is clicked, navigation fires to the queued sketch
- Dismissing the overlay cancels auto-navigation, leaving the user on the finished sketch
- After transitioning to a new best, a thin "Previously #1" banner appears between the header and canvas showing the old best's thumbnail and author handle as a link
- The previous-best banner auto-dismisses after 8 seconds or can be dismissed manually
- BestPage queries both the queued and active sketch's thumbnail/author to power these previews
