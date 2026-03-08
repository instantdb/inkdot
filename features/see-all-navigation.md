# "See All" Navigation for Fresh Sketches

## What it does

Replaces the in-place expand/collapse toggle on the "Fresh off the canvas" homepage section with an App Store/Netflix-style "See all" link that navigates to a dedicated `/newest` page.

## Implementation

### Homepage changes (`src/app/page.tsx`)
- `SectionHeader` now accepts an optional `href` prop instead of `expanded`/`onToggle`. When set, renders a `<Link>` with "See all →".
- `NewGallerySection` always fetches exactly 3 items (`first: NEW_COLLAPSED_COUNT`). Removed cursor pagination state and the `expanded` prop.
- Removed `Pagination` component (moved to `/newest` page).
- Removed `newExpanded` state from `GalleryContent`.

### New route (`src/app/newest/page.tsx`)
- Full-page gallery of newest sketches with `AuthHeader` at top.
- Back link ("← Home") + "Fresh off the canvas" title.
- Full grid (`grid-cols-2 lg:grid-cols-3`) using `SketchCard`.
- `useSuspenseQuery` with `order: { createdAt: 'desc' }` + cursor pagination (Prev/Next buttons).
- Auth pattern: `db.SignedIn` / `db.SignedOut` for userId-based filtering.

## Status
Complete.
