Signed-in sketch queries now fetch only the current viewer's vote edge instead of the full `votes` relation, and signed-out queries omit `votes` entirely.

This is shared through `src/lib/sketch-query.ts` and applied across the home page, `/top`, `/best`, user galleries, sketch pages, and sketch-card hover prefetching so `UpvoteButton` still gets the right voted state without overfetching.

Guest auth sessions should be treated like signed-out users for vote fetches. Instant guest users still have an id, so vote-aware query builders need to explicitly check `user.type === 'guest'` before attaching the `votes` relation.

That check now lives directly inside `viewerVotesQuery(...)`, and the shared sketch/browse query builders pass the auth user through unchanged. Ownership-sensitive behavior still uses the real `userId`, but vote fetching no longer needs separate guest-filtered plumbing at each call site.
