# View All Sketches by a User's Handle

## Problem
Need a way to see all sketches by a specific user.

## Solution
- Created `/user/[handle]` route at `src/app/user/[handle]/page.tsx`
- Clicking `@handle` on a `SketchCard` navigates to `/user/{handle}`
- Moved `SketchCard` to `components.tsx` so it's shared between homepage and user page
- User page shows "← All" link back to the gallery
- Removed `searchParams`-based `?author=` filtering from homepage

## Files changed
- `src/app/page.tsx` — simplified, removed author filter logic, imports `SketchCard` from components
- `src/app/components.tsx` — added exported `SketchCard` component with orphaned stream detection
- `src/app/user/[handle]/page.tsx` — new route, queries sketches filtered by `author.handle`
