# Live Nav Pages

## What it does
Adds direct navigation to the live browsing pages and introduces a live `/top` page for score-ordered sketches.

## Implementation
- Add shared header menu links for `/best`, `/newest`, and `/top`
- Build `/top` from the existing live `/newest` page structure
- Keep `/top` live by using `useSuspenseQuery` with score ordering and pagination

## Changes after implementation
- Added header menu links to `/best`, `/newest`, and `/top`
- Added the same `/best`, `/newest`, and `/top` links to the home-page action row beside `Create Sketch`
- Home-page browse links now warm their route data on hover, touch, and focus via `db.core.subscribeQuery`, matching the sketch-thumbnail prefetch pattern
- The browse-link warmers now reuse the exact shared query builders from the destination pages, so prefetch stays aligned if those routes change
- The home-page `See all` link for `Fresh off the canvas` now uses the same shared `/newest` warmer
- `/top` and `/newest` now share a lighter browse-page header with a label and tighter title instead of the plain inline heading
- Added a new live `/top` page ordered by score descending
- Kept `/top` on `useSuspenseQuery` with pagination so it updates like the other live browse pages
- Switched `/top` to live client-side pagination over the full sketch list so displayed entries are truly sorted by score, then recency
- Wired `/top` into the upvote button's optimistic score updates so entries re-order immediately on vote
- `/top` now animates vote-driven reordering locally with a short FLIP-style transform on the card grid
