# Optimistic Vote Store

## What it does
Adds a shared client-side vote store so optimistic score updates can be reused by live ranking pages like `/top`.

## Implementation
- Add a small external store in `src/lib` for optimistic sketch scores
- Write optimistic scores into the store from `UpvoteButton`
- Keep the optimistic score until the server request settles and the live query catches up
- Read the store from `/top` so rankings reorder immediately on vote

## Changes after implementation
- Added `src/lib/vote-store.ts` as a shared external store for optimistic sketch scores
- `UpvoteButton` now writes optimistic scores into that store and settles or clears them when the vote request finishes
- `/top` now reads the shared store for immediate reorder and drops local overrides once the live query matches the confirmed server score

## Follow-up
- The store also needs to cover optimistic unvotes correctly. Live vote-edge deletion and score updates can arrive out of sync, so the optimistic entry should stay active until both the score and voted state match the confirmed server result.

## Completed follow-up
- The shared vote store now tracks both optimistic `score` and optimistic `voted` state per sketch
- `UpvoteButton` reads from that shared entry instead of keeping its own local optimistic toggle state
- Reconciliation now waits for both the live score and the live vote edge to match before clearing the optimistic entry, so removing a vote stays visually optimistic even if the vote edge disappears before the score update lands
